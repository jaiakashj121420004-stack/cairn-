import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { PublicSession } from '@cairn/shared-types'
import type { LoginInput, SignupInput } from '@cairn/shared-zod'

/**
 * Renderer-side mirror of the main-process session (CLAUDE.md §18.5, Stage 2).
 *
 * The store holds no tokens — those live in the main process (`SessionStore`) and the
 * `__Host-` refresh cookie. This is purely UI state derived from `auth:*` IPC. Sync is
 * optional: a signed-out app is fully functional offline, so nothing here gates the
 * local journal.
 */

/** `unknown` until the first `load()` resolves; then `signed-in` / `signed-out`. */
type AuthStatus = 'unknown' | 'signed-out' | 'signed-in'

/** Outcome of an unlock attempt. The recovery phrase is returned, never stored in the store. */
type UnlockOutcome =
  | { ok: true; enrolled: boolean; recoveryPhrase?: readonly string[] }
  | { ok: false; code: string }

interface AuthStore {
  status: AuthStatus
  session: PublicSession | null
  /** A pending operation is in flight (disables the form). */
  busy: boolean
  /** Last error code from an auth call, for the UI to map to copy. Null when clear. */
  errorCode: string | null
  /** The vault data key is loaded and sync is running. */
  vaultUnlocked: boolean
  /** A signed-in user must enter their password to unlock/enroll the vault. */
  vaultNeedsPassword: boolean
  /** A vault operation is in flight (disables the unlock form). */
  vaultBusy: boolean
  /** Last error code from a vault call, for the UI to map to copy. Null when clear. */
  vaultErrorCode: string | null

  /** Resolve the current session on app start (resume from persisted refresh token). */
  load: () => Promise<void>
  login: (input: LoginInput) => Promise<boolean>
  /** Create an account. Returns true on success; does not sign in (email verify first). */
  signup: (input: SignupInput) => Promise<boolean>
  logout: () => Promise<void>
  clearError: () => void
  /** Re-check vault readiness (also attempts a password-free keychain resume). */
  refreshVaultStatus: () => Promise<void>
  /**
   * Enroll or unlock the vault. On first enrollment the result carries the 24-word recovery
   * phrase for the caller to display once; the store itself never holds it.
   */
  unlockVault: (password: string) => Promise<UnlockOutcome>
  lockVault: () => Promise<void>
  clearVaultError: () => void
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  status: 'unknown',
  session: null,
  busy: false,
  errorCode: null,
  vaultUnlocked: false,
  vaultNeedsPassword: false,
  vaultBusy: false,
  vaultErrorCode: null,

  load: async () => {
    // Try to resume a persisted session; fall back to whatever the main process holds.
    const restored = await ipc.auth.restore()
    if (restored.ok && restored.data) {
      set({ status: 'signed-in', session: restored.data })
      await get().refreshVaultStatus()
      return
    }
    const current = await ipc.auth.getSession()
    if (current.ok && current.data) {
      set({ status: 'signed-in', session: current.data })
      await get().refreshVaultStatus()
    } else {
      set({ status: 'signed-out', session: null })
    }
  },

  login: async (input) => {
    set({ busy: true, errorCode: null })
    const res = await ipc.auth.login(input)
    if (res.ok) {
      set({ status: 'signed-in', session: res.data, busy: false })
      await get().refreshVaultStatus()
      return true
    }
    set({ busy: false, errorCode: res.error.code })
    return false
  },

  signup: async (input) => {
    set({ busy: true, errorCode: null })
    const res = await ipc.auth.signup(input)
    set({ busy: false, ...(res.ok ? {} : { errorCode: res.error.code }) })
    return res.ok
  },

  logout: async () => {
    set({ busy: true })
    await ipc.auth.logout()
    set({
      status: 'signed-out',
      session: null,
      busy: false,
      errorCode: null,
      vaultUnlocked: false,
      vaultNeedsPassword: false,
      vaultErrorCode: null,
    })
  },

  clearError: () => set({ errorCode: null }),

  refreshVaultStatus: async () => {
    const res = await ipc.vault.status()
    if (res.ok) {
      set({ vaultUnlocked: res.data.unlocked, vaultNeedsPassword: res.data.needsPassword })
    }
  },

  unlockVault: async (password) => {
    set({ vaultBusy: true, vaultErrorCode: null })
    const res = await ipc.vault.unlock(password)
    if (res.ok) {
      set({ vaultBusy: false, vaultUnlocked: true, vaultNeedsPassword: false })
      return {
        ok: true,
        enrolled: res.data.enrolled,
        ...(res.data.recoveryPhrase ? { recoveryPhrase: res.data.recoveryPhrase } : {}),
      }
    }
    set({ vaultBusy: false, vaultErrorCode: res.error.code })
    return { ok: false, code: res.error.code }
  },

  lockVault: async () => {
    await ipc.vault.lock()
    set({ vaultUnlocked: false, vaultNeedsPassword: true })
  },

  clearVaultError: () => set({ vaultErrorCode: null }),
}))
