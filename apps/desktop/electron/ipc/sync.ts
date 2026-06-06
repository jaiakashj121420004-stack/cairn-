import { ipcMain } from 'electron'
import log from 'electron-log'
import { getActiveSyncRunner, SYNC_ERROR_CODES } from '../services/sync'
import type { IpcResponse } from '../../shared/types/index'

/** Result of a manual sync trigger surfaced to the renderer. */
export interface SyncNowResult {
  /** The runner's outcome kind (e.g. 'pushed', 'idle', 'auth-expired'). */
  readonly kind: string
  /** Ops pushed in this run, when applicable. */
  readonly opCount?: number
}

/** Sync readiness snapshot for the renderer (badge / settings panel). */
export interface SyncStatusResult {
  /** True once a session has wired the runner (device enrolled + vault unlocked). */
  readonly configured: boolean
  /** True when the automatic cadence is paused awaiting a manual run (auth/4xx/wrong-key). */
  readonly paused: boolean
}

/**
 * Sync IPC (CLAUDE.md §18.6, docs/sync-protocol.md §10). Exposes the manual
 * `window.api.sync.now()` (spec shorthand `cairn.sync.now()`). The runner is wired by
 * the main process once a session exists; until then this reports `SYNC_NOT_READY`.
 */
export function registerSyncHandlers(): void {
  // ── sync:now ────────────────────────────────────────────────────────────────
  ipcMain.handle('sync:now', async (): Promise<IpcResponse<SyncNowResult>> => {
    const runner = getActiveSyncRunner()
    if (runner === null) {
      return {
        ok: false,
        error: {
          code: SYNC_ERROR_CODES.NOT_READY,
          message: 'Sync is not configured for this session.',
        },
      }
    }
    try {
      const outcome = await runner.now()
      return {
        ok: true,
        data:
          outcome.kind === 'pushed'
            ? { kind: outcome.kind, opCount: outcome.opCount }
            : { kind: outcome.kind },
      }
    } catch (err) {
      log.error('[sync:now]', err)
      return { ok: false, error: { code: SYNC_ERROR_CODES.SERVER_ERROR, message: String(err) } }
    }
  })

  // ── sync:status ───────────────────────────────────────────────────────────────
  ipcMain.handle('sync:status', (): IpcResponse<SyncStatusResult> => {
    const runner = getActiveSyncRunner()
    return {
      ok: true,
      data: { configured: runner !== null, paused: runner?.isPaused() ?? false },
    }
  })
}
