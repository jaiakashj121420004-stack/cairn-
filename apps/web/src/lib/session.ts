import { ERROR_CODES, err, ok, type Entitlement, type Result } from '@cairn/shared-types'
import { loginSchema, signupSchema } from '@cairn/shared-zod'
import { create } from 'zustand'
import { core, onAuthLost, vault } from './transport-http'

/**
 * Session controller for the web client (CLAUDE.md §18.5, task §3/§7). Owns the
 * signed-in identity, the vault-unlocked flag, and every auth action the screens call.
 * The access token lives in {@link HttpCore} (memory only); this store holds only
 * non-secret identity/status so React can render it.
 */

interface SessionUser {
  readonly userId: string
  readonly email: string | null
  readonly emailVerified: boolean
  readonly entitlement: Entitlement
}

/** Server `AuthSession` shape (mirrors `@cairn/shared-types` AuthSession). */
interface AuthSessionWire {
  accessToken: string
  expiresIn: number
  user: { userId: string; emailVerified: boolean; entitlement: Entitlement }
}

type Status = 'unknown' | 'signedOut' | 'signedIn'

interface SessionState {
  status: Status
  user: SessionUser | null
  vaultUnlocked: boolean

  restore: () => Promise<void>
  signup: (email: string, password: string) => Promise<Result<{ userId: string }>>
  login: (email: string, password: string) => Promise<Result<void>>
  verifyEmail: (token: string) => Promise<Result<void>>
  forgotPassword: (email: string) => Promise<Result<void>>
  resetPassword: (token: string, password: string) => Promise<Result<void>>
  magicRequest: (email: string) => Promise<Result<void>>
  magicConsume: (token: string) => Promise<Result<void>>
  checkVaultEnrollment: () => Promise<Result<boolean>>
  enrollVault: (password: string) => Promise<Result<{ recoveryPhrase: readonly string[] }>>
  unlockVault: (password: string) => Promise<Result<void>>
  recoverVault: (phrase: readonly string[]) => Promise<Result<void>>
  syncNow: () => Promise<Result<{ applied: number }>>
  logout: () => Promise<void>
}

function applyAuthSession(
  set: (p: Partial<SessionState>) => void,
  email: string | null,
  wire: AuthSessionWire,
): void {
  core.setAccessToken(wire.accessToken)
  set({
    status: 'signedIn',
    user: {
      userId: wire.user.userId,
      email,
      emailVerified: wire.user.emailVerified,
      entitlement: wire.user.entitlement,
    },
  })
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'unknown',
  user: null,
  vaultUnlocked: false,

  async restore() {
    // A valid `__Host-refresh` cookie mints a fresh access token without re-login.
    const refreshed = await core.refresh()
    if (!refreshed) {
      set({ status: 'signedOut', user: null, vaultUnlocked: false })
      return
    }
    // Refresh installed a token but we don't get claims back from refresh alone here;
    // a follow-up `/auth/me`-style call would populate them. We mark signed-in with
    // minimal claims; the entitlement gate re-checks on the next authed call.
    set({ status: 'signedIn' })
  },

  async signup(email, password) {
    const parsed = signupSchema.safeParse({ email, password })
    if (!parsed.success) return err(ERROR_CODES.VALIDATION_FAILED, 'check your email and password')
    return core.call<{ userId: string }>('POST', '/auth/signup', parsed.data)
  },

  async login(email, password) {
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success)
      return err(ERROR_CODES.INVALID_CREDENTIALS, 'check your email and password')
    const res = await core.call<AuthSessionWire>('POST', '/auth/login', parsed.data)
    if (!res.ok) return res
    applyAuthSession(set, parsed.data.email, res.data)
    return ok(undefined)
  },

  async verifyEmail(token) {
    const res = await core.call<{ verified: boolean }>('POST', '/auth/verify', { token })
    if (!res.ok) return res
    const u = get().user
    if (u !== null) set({ user: { ...u, emailVerified: true } })
    return ok(undefined)
  },

  async forgotPassword(email) {
    const res = await core.call<{ sent: true }>('POST', '/auth/forgot-password', { email })
    return res.ok ? ok(undefined) : res
  },

  async resetPassword(token, password) {
    const res = await core.call<{ reset: true }>('POST', '/auth/reset-password', {
      token,
      password,
    })
    return res.ok ? ok(undefined) : res
  },

  async magicRequest(email) {
    const res = await core.call<{ sent: true }>('POST', '/auth/magic-request', { email })
    return res.ok ? ok(undefined) : res
  },

  async magicConsume(token) {
    const res = await core.call<AuthSessionWire>('POST', '/auth/magic-consume', { token })
    if (!res.ok) return res
    applyAuthSession(set, null, res.data)
    return ok(undefined)
  },

  async checkVaultEnrollment() {
    return vault.isEnrolled()
  },

  async enrollVault(password) {
    const res = await vault.enroll(password)
    if (!res.ok) return res
    set({ vaultUnlocked: true })
    return res
  },

  async unlockVault(password) {
    const res = await vault.unlock(password)
    if (!res.ok) return res
    set({ vaultUnlocked: true })
    return ok(undefined)
  },

  async recoverVault(phrase) {
    const res = await vault.recover(phrase)
    if (!res.ok) return res
    set({ vaultUnlocked: true })
    return ok(undefined)
  },

  async syncNow() {
    return vault.pull()
  },

  async logout() {
    await core.call('POST', '/auth/logout').catch(() => undefined)
    core.setAccessToken(null)
    await vault.logout()
    set({ status: 'signedOut', user: null, vaultUnlocked: false })
  },
}))

// Route back to signed-out when a refresh fails terminally mid-session.
onAuthLost(() => {
  useSession.setState({ status: 'signedOut', user: null, vaultUnlocked: false })
})

/**
 * Ensure a readable CSRF token exists for the `/auth/refresh` double-submit (task §6).
 * The access token is not a cookie and CORS is a strict allowlist, so CSRF is already
 * structurally closed; this is defence-in-depth. The token is non-secret (it only has to
 * match between the cookie and the header), `SameSite=Strict` + `Secure`.
 */
export function ensureCsrfToken(): void {
  if (typeof document === 'undefined') return
  if (/(?:^|;\s*)csrf=/.test(document.cookie)) return
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `csrf=${token}; Path=/; SameSite=Strict${secure}`
}
