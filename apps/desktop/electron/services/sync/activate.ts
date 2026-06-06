/**
 * Main-process sync activation (CLAUDE.md §18.6, docs/sync-protocol.md §10).
 *
 * Turns the Stage 18.6 sync engine on once the vault is unlocked. It is the single place
 * that connects the four uncalled seams: the per-record {@link VectorClockCache}, the
 * write-path {@link setSyncWriteContext}, the {@link createSyncRunner} push/pull loop, and
 * the {@link setActiveSyncRunner} registry the `sync:now` IPC drives.
 *
 * Called by {@link SessionStore} via its `onVaultActivate` / `onVaultDeactivate` seams, so
 * it always runs with a real enrolled device id and an unlocked data key. On lock/logout
 * {@link deactivateSync} stops the runner and clears the write context, returning the app
 * to its offline-first, no-op-sync state.
 */
import { BrowserWindow } from 'electron'
import log from 'electron-log'
import { getDb, getRawSqlite } from '../../db/index'
import { VectorClockCache } from './clock'
import { setSyncWriteContext } from './enqueue'
import { SqliteSyncStore } from './store'
import { createSyncRunner, getActiveSyncRunner, setActiveSyncRunner } from './index'
import type { RecordClock } from './clock'
import type { Notify, SyncContext, SyncLogger } from './types'
import type { VectorClock } from '@cairn/sync-protocol'
import type DatabaseType from 'better-sqlite3'

/** electron-log scoped to the sync engine; carries no user payload content (§19.9). */
const syncLog: SyncLogger = {
  debug: (msg, meta) => log.debug(msg, meta),
  info: (msg, meta) => log.info(msg, meta),
  warn: (msg, meta) => log.warn(msg, meta),
  error: (msg, meta) => log.error(msg, meta),
}

/** Forward a sync toast to every open window over the existing `cairn:event` channel. */
const notify: Notify = (toast) => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('cairn:event', { name: 'sync:toast', payload: toast })
  }
}

/**
 * Hydrate the clock cache from the durable `sync_clocks` table (migration 0013). Each row
 * holds a record's FULL vector clock as JSON (docs/sync-protocol.md §3), so the cache is
 * restored exactly — every device's component — across a restart. A malformed JSON row is
 * skipped (and logged) rather than crashing activation; the op log remains the truth.
 */
function readClocks(raw: DatabaseType.Database): readonly RecordClock[] {
  const rows = raw
    .prepare(`SELECT table_name, record_id, clock FROM "sync_clocks"`)
    .all() as Array<{ table_name: string; record_id: string; clock: string }>
  const out: RecordClock[] = []
  for (const r of rows) {
    try {
      const clock = JSON.parse(r.clock) as VectorClock
      out.push({ tableName: r.table_name, recordId: r.record_id, clock })
    } catch {
      log.warn('[sync] skipping malformed sync_clocks row', { table: r.table_name })
    }
  }
  return out
}

/**
 * Activate the push/pull runner and the write-path capture for an unlocked vault.
 * Idempotent: re-activating replaces the prior runner/context.
 *
 * @param ctx       the session store (supplies device id, data key, token, refresh).
 * @param deviceId  this device's enrolled id — the clock's local component.
 * @param baseUrl   the API base URL (passed in to avoid a session↔sync import cycle).
 */
export function activateSync(ctx: SyncContext, deviceId: string, baseUrl: string): void {
  // Tear down any prior runner first so re-activation (e.g. a keychain resume followed by a
  // manual re-unlock) never orphans the old runner's self-rescheduling timer.
  deactivateSync()

  const db = getDb()
  const raw = getRawSqlite()

  const clock = new VectorClockCache(deviceId)
  clock.hydrate(() => readClocks(raw))
  const store = new SqliteSyncStore(raw)

  // Capture local writes into sync_queue from this point on.
  setSyncWriteContext({ db, clock, now: Date.now })

  const runner = createSyncRunner({ db, store, clock, ctx, baseUrl, notify, log: syncLog })
  setActiveSyncRunner(runner)
  runner.start()
  log.info('[sync] activated', { deviceId })
}

/** Stop the runner and disable write capture (on lock/logout). Safe to call when inactive. */
export function deactivateSync(): void {
  getActiveSyncRunner()?.stop()
  setActiveSyncRunner(null)
  setSyncWriteContext(null)
  log.info('[sync] deactivated')
}
