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
import { ok } from '@cairn/shared-types'
import type { AuthClientSession } from './auth-client'
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

export interface SessionStoreDeps {
  readonly client: AuthClient
  readonly persistence: SessionPersistence
  readonly now?: () => number
  readonly log?: SessionLogger
}

export class SessionStore implements SyncContext {
  private readonly client: AuthClient
  private readonly persistence: SessionPersistence
  private readonly now: () => number
  private readonly log: SessionLogger

  private session: ActiveSession | null = null
  /** Enrolled device id — populated in Stage 3; null gates sync as not-ready. */
  private deviceId: string | null = null
  /** Unwrapped vault data key — populated in Stage 3; null gates sync as not-ready. */
  private dataKey: Uint8Array | null = null

  constructor(deps: SessionStoreDeps) {
    this.client = deps.client
    this.persistence = deps.persistence
    this.now = deps.now ?? Date.now
    this.log = deps.log ?? NOOP_LOGGER
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

  /** End the session: best-effort server revoke, then clear memory + persistence. */
  async logout(): Promise<Result<void>> {
    const current = this.session
    await this.client.logout(current?.refreshToken ?? null)
    if (current) {
      const cleared = await this.persistence.clearRefreshToken(current.userId)
      if (!cleared.ok) this.log.warn('[session] failed to clear refresh token', cleared.error)
    }
    this.persistence.clearResume()
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

  // ── Stage 3 seam (vault enrollment / unlock) ─────────────────────────────────

  /** Mark the vault unlocked with an enrolled device + unwrapped data key (Stage 3). */
  setVaultUnlocked(deviceId: string, dataKey: Uint8Array): void {
    this.deviceId = deviceId
    this.dataKey = dataKey
  }

  /** Drop the in-memory data key (lock) without ending the auth session (Stage 3). */
  lockVault(): void {
    this.dataKey = null
  }

  // ── Internals ───────────────────────────────────────────────────────────────

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
