import { ipcMain } from 'electron'
import log from 'electron-log'
import { z } from 'zod'
import { getRawSqlite } from '../db/index'
import {
  enqueueSyncOp,
  isSyncWriteEnabled,
  mergeRemoteClock,
  parseEnvelope,
  SqliteSyncStore,
} from '../services/sync'
import type { IpcResponse } from '../../shared/types/index'
import type { VectorClock } from '@cairn/sync-protocol'

/**
 * Conflict-resolution IPC (docs/sync-protocol.md §5). When a pulled op is concurrent with
 * the local record, the pull engine retains BOTH sides in `sync_conflicts` and never
 * fast-forwards. This module lets the renderer list those conflicts, show both versions,
 * and pick a winner — the resolution is written back through the normal enqueue path, with
 * the losing clock merged in first so the new op causally dominates both and converges.
 *
 * The server never participates: it only ever stored ciphertext (CLAUDE.md §2.4).
 */

/** One unresolved conflict, with both sides decoded for display. */
export interface ConflictDTO {
  readonly id: number
  readonly tableName: string
  readonly recordId: string
  readonly detectedAt: number
  readonly remoteDeviceId: string
  /** The current local row (camelCase columns), or null if it was deleted locally. */
  readonly localData: Record<string, unknown> | null
  /** The remote row from the conflicting op, or null for a remote delete tombstone. */
  readonly remoteData: Record<string, unknown> | null
}

interface ConflictRow {
  id: number
  table_name: string
  record_id: string
  remote_clock: string
  remote_payload: string
  remote_device_id: string
  detected_at: number
}

const ResolveSchema = z.object({
  conflictId: z.number().int().positive(),
  winner: z.enum(['local', 'remote']),
})

const SYNC_NOT_READY = 'SYNC_NOT_READY'

/** Decode the remote envelope's row data; null for a delete or an unparseable payload. */
function remoteDataOf(payload: string): Record<string, unknown> | null {
  if (payload === '') return null
  try {
    const data = parseEnvelope(payload).data
    return data ? (data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function registerSyncConflictHandlers(): void {
  // ── sync:conflicts:list ─────────────────────────────────────────────────────
  ipcMain.handle('sync:conflicts:list', (): IpcResponse<ConflictDTO[]> => {
    try {
      const raw = getRawSqlite()
      const store = new SqliteSyncStore(raw)
      const rows = raw
        .prepare(
          `SELECT id, table_name, record_id, remote_clock, remote_payload, remote_device_id, detected_at
           FROM "sync_conflicts" WHERE resolved_at IS NULL ORDER BY detected_at ASC, id ASC`,
        )
        .all() as ConflictRow[]
      const out: ConflictDTO[] = rows.map((r) => ({
        id: r.id,
        tableName: r.table_name,
        recordId: r.record_id,
        detectedAt: r.detected_at,
        remoteDeviceId: r.remote_device_id,
        localData: store.knows(r.table_name)
          ? store.snapshotCamel(r.table_name, r.record_id)
          : null,
        remoteData: remoteDataOf(r.remote_payload),
      }))
      return { ok: true, data: out }
    } catch (err) {
      log.error('[sync:conflicts:list]', err)
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── sync:conflicts:count ────────────────────────────────────────────────────
  ipcMain.handle('sync:conflicts:count', (): IpcResponse<number> => {
    try {
      const raw = getRawSqlite()
      const row = raw
        .prepare(`SELECT COUNT(*) AS n FROM "sync_conflicts" WHERE resolved_at IS NULL`)
        .get() as { n: number }
      return { ok: true, data: row?.n ?? 0 }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── sync:conflicts:resolve ──────────────────────────────────────────────────
  ipcMain.handle('sync:conflicts:resolve', (_e, input: unknown): IpcResponse<{ ok: true }> => {
    const parsed = ResolveSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    // Resolution re-enqueues the winner; that needs an active vault (unlocked) so the op can
    // be encrypted and its clock bumped. Refuse rather than silently lose the resolution.
    if (!isSyncWriteEnabled()) {
      return {
        ok: false,
        error: { code: SYNC_NOT_READY, message: 'Unlock the vault before resolving conflicts.' },
      }
    }
    try {
      const raw = getRawSqlite()
      const store = new SqliteSyncStore(raw)
      const conflict = raw
        .prepare(
          `SELECT id, table_name, record_id, remote_clock, remote_payload, remote_device_id, detected_at
           FROM "sync_conflicts" WHERE id = ? AND resolved_at IS NULL`,
        )
        .get(parsed.data.conflictId) as ConflictRow | undefined
      if (!conflict) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Conflict not found or resolved' },
        }
      }
      const { table_name: table, record_id: recordId } = conflict
      if (!store.knows(table)) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: `unknown table ${table}` } }
      }

      const remoteClock = JSON.parse(conflict.remote_clock) as VectorClock
      // Merge the losing side's clock in BEFORE the resolving enqueue, so the new op's clock
      // dominates both conflicting versions and converges on the next sync (§5.3).
      mergeRemoteClock(table, recordId, remoteClock)

      const winningData =
        parsed.data.winner === 'remote'
          ? remoteDataOf(conflict.remote_payload)
          : store.snapshotCamel(table, recordId)
      const isDelete =
        winningData === null ||
        (typeof winningData.deletedAt === 'number' && winningData.deletedAt !== null)

      const now = Date.now()
      store.transaction(() => {
        if (isDelete) {
          store.remove(table, recordId, now)
        } else {
          // Validate the winning row before persisting (§19.2) — never write an unvalidated row.
          store.upsert(table, store.validate(table, winningData))
        }
        // Resolve every outstanding conflict for this record, not just the chosen row.
        raw
          .prepare(
            `UPDATE "sync_conflicts" SET resolved_at = ? WHERE table_name = ? AND record_id = ? AND resolved_at IS NULL`,
          )
          .run(now, table, recordId)
        store.audit({
          event: 'sync.conflict.resolved',
          tableName: table,
          recordId,
          detail: `resolved in favor of ${parsed.data.winner}`,
          createdAt: now,
        })
      })

      // Re-enqueue the winner so it propagates (clock now dominates both sides).
      enqueueSyncOp(table, recordId, isDelete ? 'delete' : 'upsert', isDelete ? null : winningData)
      return { ok: true, data: { ok: true } }
    } catch (err) {
      log.error('[sync:conflicts:resolve]', err)
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
