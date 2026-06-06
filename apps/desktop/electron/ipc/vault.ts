import { ipcMain } from 'electron'
import log from 'electron-log'
import { z } from 'zod'
import { getSessionStore } from '../services/session'
import type { IpcResponse } from '../../shared/types/index'
import type { UnlockVaultResult } from '../services/session/store'

/**
 * Vault IPC (CLAUDE.md §18.5/§18.6, Stage 3). Drives the main-process {@link SessionStore}'s
 * enrollment/unlock — the renderer sends only the password and reads back status; the data
 * key, KEK, and recovery phrase never persist in a renderer-reachable surface.
 *
 * The recovery phrase is returned by `vault:unlock` exactly once (first enrollment) for the
 * UI to display under a forced acknowledgement; it is never re-fetchable and never logged.
 */

/** Renderer-facing snapshot of vault readiness, used to decide whether to prompt. */
export interface VaultStatus {
  /** The data key is in memory and sync is running. */
  readonly unlocked: boolean
  /** A signed-in user must enter their password to unlock/enroll. */
  readonly needsPassword: boolean
}

const unlockInputSchema = z.object({
  // Mirror the auth password floor (8+) so the prompt rejects obvious typos before any KDF.
  password: z.string().min(8).max(1024),
})

const recoverInputSchema = z.object({
  // 24 BIP-39 words. Normalised to lowercase/trimmed words before validation.
  phrase: z.array(z.string().min(1)).length(24),
  newPassword: z.string().min(8).max(1024),
})

export function registerVaultHandlers(): void {
  // ── vault:status ──────────────────────────────────────────────────────────────
  // Attempts a password-free resume (keychain) as a side effect, then reports readiness.
  ipcMain.handle('vault:status', async (): Promise<IpcResponse<VaultStatus>> => {
    try {
      const status = await getSessionStore().resumeVault()
      return {
        ok: true,
        data: { unlocked: status === 'unlocked', needsPassword: status === 'needs-password' },
      }
    } catch (err) {
      log.error('[vault:status]', err)
      return { ok: false, error: { code: 'INTERNAL', message: String(err) } }
    }
  })

  // ── vault:unlock ────────────────────────────────────────────────────────────────
  ipcMain.handle('vault:unlock', async (_e, raw): Promise<IpcResponse<UnlockVaultResult>> => {
    const parsed = unlockInputSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'invalid password input' } }
    }
    // `unlockVault` owns its own no-throw contract (it converts crypto throws to a typed
    // Result), so this handler stays thin like the other auth/* handlers.
    return getSessionStore().unlockVault(parsed.data.password)
  })

  // ── vault:recover ─────────────────────────────────────────────────────────────
  ipcMain.handle('vault:recover', async (_e, raw): Promise<IpcResponse<UnlockVaultResult>> => {
    const parsed = recoverInputSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'invalid recovery input' } }
    }
    const phrase = parsed.data.phrase.map((w) => w.trim().toLowerCase())
    return getSessionStore().recoverVault(phrase, parsed.data.newPassword)
  })

  // ── vault:lock ──────────────────────────────────────────────────────────────────
  ipcMain.handle('vault:lock', (): IpcResponse<void> => {
    getSessionStore().lockVault()
    return { ok: true, data: undefined }
  })
}
