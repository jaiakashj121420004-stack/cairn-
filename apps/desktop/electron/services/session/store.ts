/**
 * Desktop session store (CLAUDE.md §18.5, Stage 2 client session layer).
 *
 * The single owner of the authenticated session in the main process. It:
 *  - drives signup / login / logout / verify / password-reset through the
 *    {@link AuthClient};
 *  - holds the access token and rotated refresh token in memory;
 *  - persists the refresh token (keychain) and resume metadata (settings) so a
 *    restart can re-establish the session without a password prompt;
 *  - implements {@link SyncContext} so the sync engine reads its token and (from
 *    Stage 3 on) the enrolled device id + unwrapped data key from one place.
 *
 * Vault enrollment (device id) and unlock (data key) land in Stage 3; until then
 * {@link SessionStore.getDeviceId} / {@link SessionStore.getDataKey} return null, which
 * the sync engine reads as `not-ready` — exactly the desired pre-enrollment behavior.
 *
 * Every dependency is injected so the store is unit-testable with no keychain, SQLite,
 * or network.
 */
import { err, ok } from '@cairn/shared-types'
import type { AuthClientSession } from './auth-client'
import type { VaultEnrollment, VaultUnlockResult as EnrollUnlockResult } from './enrollment'
import type { SessionPersistence } from './persistence'
import type { SyncContext } from '../sync/types'
import type { Entitlement, PublicSession, Result, SignupResult } from '@cairn/shared-types'
import type {
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
} from '@cairn/shared-zod'

/** The subset of {@link AuthHttpClient} the store depends on (injectable for tests). */
export interface AuthClient {
  signup(input: SignupInput): Promise<Result<SignupResult>>
  login(input: LoginInput): Promise<Result<AuthClientSession>>
  refresh(refreshToken: string): Promise<Result<AuthClientSession>>
  logout(refreshToken: string | null): Promise<Result<void>>
  verifyEmail(token: string): Promise<Result<{ verified: boolean }>>
  forgotPassword(input: ForgotPasswordInput): Promise<Result<{ sent: true }>>
  resetPassword(input: ResetPasswordInput): Promise<Result<{ reset: true }>>
}

interface ActiveSession {
  userId: string
  email: string
  emailVerified: boolean
  entitlement: Entitlement
  accessToken: string
  /** Epoch ms at which the access token expires (for diagnostics; the server is authoritative). */
  accessExpiresAt: number
  refreshToken: string
}

/** Minimal logger seam. Defaults to no-op so the store stays free of electron-log in tests. */
export interface SessionLogger {
  warn(msg: string, meta?: unknown): void
}

const NOOP_LOGGER: SessionLogger = { warn: () => undefined }

/** The result of an unlock attempt surfaced to the renderer (phrase shown once on enroll). */
export interface UnlockVaultResult {
  readonly enrolled: boolean
  /** The 24-word recovery phrase — present only on first enrollment, to display once. */
  readonly recoveryPhrase?: readonly string[]
}

/** Whether the vault is ready, needs a password, or there is no session to unlock. */
export type ResumeVaultStatus = 'unlocked' | 'needs-password' | 'no-session'

export interface SessionStoreDeps {
  readonly client: AuthClient
  readonly persistence: SessionPersistence
  readonly enroller: VaultEnrollment
  readonly now?: () => number
  readonly log?: SessionLogger
  /** Human-readable device label used when registering this device (e.g. the hostname). */
  readonly deviceName?: string
  /** OS platform string for the device record (display only). */
  readonly platform?: string
  /** Called once the vault is unlocked, to wire the main-process sync runner (Stage 3). */
  readonly onVaultActivate?: (deviceId: string) => void
  /** Called on lock/logout to tear the sync runner down. */
  readonly onVaultDeactivate?: () => void
}

export class SessionStore implements SyncContext {
  private readonly client: AuthClient
  private readonly persistence: SessionPersistence
  private readonly enroller: VaultEnrollment
  private readonly now: () => number
  private readonly log: SessionLogger
  private readonly deviceName: string
  private readonly platform: string
  private readonly onVaultActivate: (deviceId: string) => void
  private readonly onVaultDeactivate: () => void

  private session: ActiveSession | null = null
  /** Enrolled device id — set on vault unlock; null gates sync as not-ready. */
  private deviceId: string | null = null
  /** Unwrapped vault data key — set on vault unlock; null gates sync as not-ready. */
  private dataKey: Uint8Array | null = null

  constructor(deps: SessionStoreDeps) {
    this.client = deps.client
    this.persistence = deps.persistence
    this.enroller = deps.enroller
    this.now = deps.now ?? Date.now
    this.log = deps.log ?? NOOP_LOGGER
    this.deviceName = deps.deviceName ?? 'Cairn device'
    this.platform = deps.platform ?? 'unknown'
    this.onVaultActivate = deps.onVaultActivate ?? (() => undefined)
    this.onVaultDeactivate = deps.onVaultDeactivate ?? (() => undefined)
  }

  // ── Auth operations ───────────────────────────────────────────────────────────

  /** Create an account. Does not sign in — the user verifies email, then logs in. */
  signup(input: SignupInput): Promise<Result<SignupResult>> {
    return this.client.signup(input)
  }

  /** Log in and start a session; persists the refresh token + resume metadata. */
  async login(input: LoginInput): Promise<Result<PublicSession>> {
    const res = await this.client.login(input)
    if (!res.ok) return res
    const session = await this.adopt(res.data, input.email)
    return ok(this.snapshot(session))
  }

  /** End the session: best-effort server revoke, then clear memory + persistence + vault. */
  async logout(): Promise<Result<void>> {
    const current = this.session
    await this.client.logout(current?.refreshToken ?? null)
    if (current) {
      const cleared = await this.persistence.clearRefreshToken(current.userId)
      if (!cleared.ok) this.log.warn('[session] failed to clear refresh token', cleared.error)
      // Drop the cached vault key so a different user on this machine can't resume it.
      await this.enroller.forget(current.userId)
    }
    this.persistence.clearResume()
    this.onVaultDeactivate()
    this.session = null
    this.dataKey = null
    this.deviceId = null
    return ok(undefined)
  }

  /** The current session snapshot, or null if signed out. */
  getSession(): PublicSession | null {
    return this.session ? this.snapshot(this.session) : null
  }

  verifyEmail(token: string): Promise<Result<{ verified: boolean }>> {
    return this.client.verifyEmail(token)
  }

  forgotPassword(input: ForgotPasswordInput): Promise<Result<{ sent: true }>> {
    return this.client.forgotPassword(input)
  }

  resetPassword(input: ResetPasswordInput): Promise<Result<{ reset: true }>> {
    return this.client.resetPassword(input)
  }

  /**
   * Re-establish a session on app start from the persisted refresh token. Returns the
   * snapshot on success, or null if there is nothing to resume / the token is stale.
   * A stale token is cleaned up so we don't retry it every launch.
   */
  async restore(): Promise<PublicSession | null> {
    const resume = this.persistence.loadResume()
    if (!resume) return null
    const stored = await this.persistence.readRefreshToken(resume.userId)
    if (!stored.ok || stored.data === null) return null

    const res = await this.client.refresh(stored.data)
    if (!res.ok) {
      // Only forget the token on a definitive auth failure; keep it through transient
      // network/server errors so an offline launch can still resume later.
      if (res.error.code === 'INVALID_TOKEN' || res.error.code === 'UNAUTHENTICATED') {
        await this.persistence.clearRefreshToken(resume.userId)
        this.persistence.clearResume()
      }
      return null
    }
    const session = await this.adopt(res.data, resume.email)
    return this.snapshot(session)
  }

  // ── SyncContext ─────────────────────────────────────────────────────────────

  getDeviceId(): string | null {
    return this.deviceId
  }

  getDataKey(): Uint8Array | null {
    return this.dataKey
  }

  getAccessToken(): string | null {
    return this.session?.accessToken ?? null
  }

  /**
   * Refresh the access token via the persisted refresh token (cookie equivalent).
   * Resolves to the new access token, or null on failure — matching the seam the sync
   * engine's 401 path expects.
   */
  async refresh(): Promise<string | null> {
    const current = this.session
    if (!current) return null
    const res = await this.client.refresh(current.refreshToken)
    if (!res.ok) {
      this.log.warn('[session] refresh failed', res.error)
      return null
    }
    await this.adopt(res.data, current.email)
    return res.data.session.accessToken
  }

  // ── Vault enrollment / unlock (Stage 3) ──────────────────────────────────────

  /**
   * Enroll or unlock the vault with the user's password. On success the device id +
   * unwrapped data key are held in memory and the sync runner is activated. The recovery
   * phrase is returned exactly once (first enrollment only) for the caller to display; it is
   * never persisted or logged here.
   */
  async unlockVault(password: string): Promise<Result<UnlockVaultResult>> {
    const current = this.session
    if (!current) return err('UNAUTHENTICATED', 'sign in before unlocking the vault')

    let res: Result<EnrollUnlockResult>
    try {
      res = await this.withFreshToken((accessToken) =>
        this.enroller.unlock({
          userId: current.userId,
          password,
          accessToken,
          deviceName: this.deviceName,
          platform: this.platform,
        }),
      )
    } catch (e) {
      // The unlock path runs crypto directly, which can throw (e.g. a corrupt server
      // descriptor → INVALID_NONCE_LENGTH, or SODIUM_NOT_READY). Keep the boundary's
      // no-throw contract: convert to a typed Result. The thrown error carries no key
      // material (crypto/errors.ts) and never the password (a local of this method).
      this.log.warn('[session] vault unlock threw', e instanceof Error ? e.name : 'unknown')
      return err('INTERNAL', 'could not unlock the vault')
    }
    if (!res.ok) return res

    this.applyVaultUnlocked(res.data.deviceId, res.data.dataKey)
    return ok({
      enrolled: res.data.enrolled,
      ...(res.data.recoveryPhrase ? { recoveryPhrase: res.data.recoveryPhrase } : {}),
    })
  }

  /**
   * Recover the vault with the 24-word recovery phrase and set a new password. On success the
   * vault is unlocked and sync activated, exactly like {@link unlockVault}. Keeps the boundary
   * no-throw contract by converting any crypto throw to a typed Result.
   */
  async recoverVault(
    phrase: readonly string[],
    newPassword: string,
  ): Promise<Result<UnlockVaultResult>> {
    const current = this.session
    if (!current) return err('UNAUTHENTICATED', 'sign in before recovering the vault')

    let res: Result<EnrollUnlockResult>
    try {
      res = await this.withFreshToken((accessToken) =>
        this.enroller.recover({
          userId: current.userId,
          accessToken,
          phrase,
          newPassword,
          deviceName: this.deviceName,
          platform: this.platform,
        }),
      )
    } catch (e) {
      this.log.warn('[session] vault recover threw', e instanceof Error ? e.name : 'unknown')
      return err('INTERNAL', 'could not recover the vault')
    }
    if (!res.ok) return res

    this.applyVaultUnlocked(res.data.deviceId, res.data.dataKey)
    return ok({ enrolled: res.data.enrolled })
  }

  /**
   * Try to unlock the vault without a password by reading the cached data key from the OS
   * keychain. Called after `login()` / `restore()`. Returns whether the vault is ready, a
   * password is needed, or there is no session.
   */
  async resumeVault(): Promise<ResumeVaultStatus> {
    const current = this.session
    if (!current) return 'no-session'
    if (this.dataKey !== null) return 'unlocked'

    const res = await this.enroller.resume({ userId: current.userId })
    if (res.status === 'needs-password') return 'needs-password'
    this.applyVaultUnlocked(res.deviceId, res.dataKey)
    return 'unlocked'
  }

  /**
   * Low-level setter: record the device id + data key in memory only. This does NOT activate
   * the sync runner — the production unlock paths (`unlockVault` / `resumeVault`) go through
   * the private {@link applyVaultUnlocked}, which also fires `onVaultActivate`. Prefer those;
   * this exists for the SyncContext-reflection unit test.
   */
  setVaultUnlocked(deviceId: string, dataKey: Uint8Array): void {
    this.deviceId = deviceId
    this.dataKey = dataKey
  }

  /** Drop the in-memory data key (lock) without ending the auth session; stops sync. */
  lockVault(): void {
    const current = this.session
    this.dataKey = null
    this.onVaultDeactivate()
    if (current) void this.enroller.forget(current.userId)
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /** Hold the unlocked vault in memory and activate the sync runner. */
  private applyVaultUnlocked(deviceId: string, dataKey: Uint8Array): void {
    this.setVaultUnlocked(deviceId, dataKey)
    this.onVaultActivate(deviceId)
  }

  /**
   * Run a vault call with the current access token, retrying once with a freshly-refreshed
   * token if the server rejected the first attempt as unauthenticated (the 15-minute access
   * token may have expired between login and unlock).
   */
  private async withFreshToken<T>(
    fn: (accessToken: string) => Promise<Result<T>>,
  ): Promise<Result<T>> {
    const current = this.session
    if (!current) return err('UNAUTHENTICATED', 'sign in first')
    const first = await fn(current.accessToken)
    if (first.ok || first.error.code !== 'UNAUTHENTICATED') return first
    const refreshed = await this.refresh()
    if (refreshed === null) return first
    return fn(refreshed)
  }

  /** Adopt a fresh authentication into memory and persist the rotated token + resume. */
  private async adopt(data: AuthClientSession, email: string): Promise<ActiveSession> {
    const { session, refreshToken } = data
    const active: ActiveSession = {
      userId: session.user.userId,
      email,
      emailVerified: session.user.emailVerified,
      entitlement: session.user.entitlement,
      accessToken: session.accessToken,
      accessExpiresAt: this.now() + session.expiresIn * 1000,
      refreshToken,
    }
    this.session = active
    const saved = await this.persistence.saveRefreshToken(session.user.userId, refreshToken)
    if (!saved.ok) {
      // Non-fatal: the in-memory token still works for this run; only cross-restart
      // resume is lost. Common on Linux without libsecret.
      this.log.warn('[session] failed to persist refresh token', saved.error)
    }
    this.persistence.saveResume({ userId: session.user.userId, email })
    return active
  }

  private snapshot(s: ActiveSession): PublicSession {
    return {
      userId: s.userId,
      email: s.email,
      emailVerified: s.emailVerified,
      entitlement: s.entitlement,
      vaultUnlocked: this.dataKey !== null,
    }
  }
}
