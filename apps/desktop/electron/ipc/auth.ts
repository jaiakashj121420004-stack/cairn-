import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from '@cairn/shared-zod'
import { ipcMain } from 'electron'
import log from 'electron-log'
import { getSessionStore } from '../services/session'
import type { IpcResponse } from '../../shared/types/index'
import type { PublicSession } from '../services/session'
import type { SignupResult } from '@cairn/shared-types'

/**
 * Auth IPC (CLAUDE.md §18.5, Stage 2 client session layer). The renderer never talks to
 * the backend directly — it drives the main-process {@link SessionStore}, which owns the
 * tokens and the refresh cookie. Every channel validates its input with the same Zod
 * schema the server uses (CLAUDE.md §19.2) and returns the universal `Result` shape.
 *
 * Sync is optional and account-gated: free/offline use needs none of this, so failures
 * here never affect the local journal.
 */
export function registerAuthHandlers(): void {
  // ── auth:signup ───────────────────────────────────────────────────────────────
  ipcMain.handle('auth:signup', async (_e, raw): Promise<IpcResponse<SignupResult>> => {
    const parsed = signupSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    return getSessionStore().signup(parsed.data)
  })

  // ── auth:login ────────────────────────────────────────────────────────────────
  ipcMain.handle('auth:login', async (_e, raw): Promise<IpcResponse<PublicSession>> => {
    const parsed = loginSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    return getSessionStore().login(parsed.data)
  })

  // ── auth:logout ───────────────────────────────────────────────────────────────
  ipcMain.handle('auth:logout', async (): Promise<IpcResponse<void>> => {
    return getSessionStore().logout()
  })

  // ── auth:getSession ───────────────────────────────────────────────────────────
  ipcMain.handle('auth:getSession', (): IpcResponse<PublicSession | null> => {
    return { ok: true, data: getSessionStore().getSession() }
  })

  // ── auth:restore ──────────────────────────────────────────────────────────────
  // Resume a session from the persisted refresh token (called by the renderer on load).
  ipcMain.handle('auth:restore', async (): Promise<IpcResponse<PublicSession | null>> => {
    try {
      const session = await getSessionStore().restore()
      return { ok: true, data: session }
    } catch (err) {
      log.error('[auth:restore]', err)
      return { ok: false, error: { code: 'INTERNAL', message: String(err) } }
    }
  })

  // ── auth:verifyEmail ──────────────────────────────────────────────────────────
  ipcMain.handle('auth:verifyEmail', async (_e, raw): Promise<IpcResponse<{ verified: boolean }>> => {
    const parsed = verifyEmailSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    return getSessionStore().verifyEmail(parsed.data.token)
  })

  // ── auth:forgotPassword ───────────────────────────────────────────────────────
  ipcMain.handle('auth:forgotPassword', async (_e, raw): Promise<IpcResponse<{ sent: true }>> => {
    const parsed = forgotPasswordSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    return getSessionStore().forgotPassword(parsed.data)
  })

  // ── auth:resetPassword ────────────────────────────────────────────────────────
  ipcMain.handle('auth:resetPassword', async (_e, raw): Promise<IpcResponse<{ reset: true }>> => {
    const parsed = resetPasswordSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    return getSessionStore().resetPassword(parsed.data)
  })
}
