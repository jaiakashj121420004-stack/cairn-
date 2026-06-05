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

interface AuthStore {
  status: AuthStatus
  session: PublicSession | null
  /** A pending operation is in flight (disables the form). */
  busy: boolean
  /** Last error code from an auth call, for the UI to map to copy. Null when clear. */
  errorCode: string | null

  /** Resolve the current session on app start (resume from persisted refresh token). */
  load: () => Promise<void>
  login: (input: LoginInput) => Promise<boolean>
  /** Create an account. Returns true on success; does not sign in (email verify first). */
  signup: (input: SignupInput) => Promise<boolean>
  logout: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  status: 'unknown',
  session: null,
  busy: false,
  errorCode: null,

  load: async () => {
    // Try to resume a persisted session; fall back to whatever the main process holds.
    const restored = await ipc.auth.restore()
    if (restored.ok && restored.data) {
      set({ status: 'signed-in', session: restored.data })
      return
    }
    const current = await ipc.auth.getSession()
    if (current.ok && current.data) {
      set({ status: 'signed-in', session: current.data })
    } else {
      set({ status: 'signed-out', session: null })
    }
  },

  login: async (input) => {
    set({ busy: true, errorCode: null })
    const res = await ipc.auth.login(input)
    if (res.ok) {
      set({ status: 'signed-in', session: res.data, busy: false })
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
    set({ status: 'signed-out', session: null, busy: false, errorCode: null })
  },

  clearError: () => set({ errorCode: null }),
}))
