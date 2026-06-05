/**
 * Encryption-on-write enqueue path (CLAUDE.md §18.6 step 1, docs/sync-protocol.md §2.3).
 *
 * Every IPC handler that mutates a syncable row calls {@link enqueueSyncOp} AFTER its DB
 * commit. The helper:
 *   (a) bumps this device's vector-clock component for the record,
 *   (b) wraps the row in a canonical-JSON sync envelope (clock + updatedAt + data),
 *   (c) appends one row to `sync_queue`.
 *
 * It is the ONLY way to enqueue — handlers never touch `sync_queue` directly, so the
 * clock bump and the queue insert can never drift apart.
 *
 * Encryption is deliberately deferred to push time (push.ts / serialize.ts), not done
 * here: the queue stores the plaintext envelope so a key rotation re-encrypts only the
 * queue, not the journal (docs/sync-protocol.md §2.3). "Encrypts with the data key"
 * from the step-1 spec is therefore satisfied at the push boundary, with the row's
 * `table:id` bound as AEAD associated data.
 *
 * Until a device is enrolled and the vault unlocked, no write context is registered and
 * {@link enqueueSyncOp} is a no-op — the offline-first app keeps working and `sync_queue`
 * stays empty on installs that never turn sync on (CLAUDE.md §2.4).
 */
import { syncQueue } from '../../db/schema'
import { buildEnvelope, serializeEnvelope } from './canonical'
import type { VectorClockCache } from './clock'
import type { CairnDb } from '../../db/index'
import type { SyncOpType } from '@cairn/sync-protocol'

/**
 * The session-scoped dependencies the enqueue path needs. Registered by the main
 * process once a device is enrolled and the vault is unlocked; cleared on logout/lock.
 */
export interface SyncWriteContext {
  /** The local DB the `sync_queue` lives in. */
  readonly db: CairnDb
  /** This device's vector-clock cache — bumped on each local write. */
  readonly clock: VectorClockCache
  /** Wall clock (injected for testability). */
  readonly now: () => number
  /** Optional sink for enqueue failures (defaults to silent). Enqueue never throws. */
  readonly onError?: (err: unknown) => void
}

let active: SyncWriteContext | null = null

/** Register the live write context (device enrolled + vault unlocked). `null` disables enqueue. */
export function setSyncWriteContext(ctx: SyncWriteContext | null): void {
  active = ctx
}

/** Whether sync writes are currently being captured. */
export function isSyncWriteEnabled(): boolean {
  return active !== null
}

/**
 * Enqueue one local mutation for sync. A no-op when sync is not enrolled.
 *
 * @param tableName logical/SQLite table the row lives in (e.g. `"trades"`).
 * @param recordId  the row's stable id.
 * @param opType    `"upsert"` for a create/update, `"delete"` for a (soft) delete.
 * @param row       the row's columns as a plain object for an upsert; `null` for a
 *   delete (the tombstone still carries clock + updatedAt, just no `data`).
 */
export function enqueueSyncOp(
  tableName: string,
  recordId: string,
  opType: SyncOpType,
  row: Record<string, unknown> | null,
): void {
  const ctx = active
  if (ctx === null) return

  // Best-effort: the local DB write is canonical (CLAUDE.md §2.4/§2.7). A failure to
  // enqueue must never propagate and break the user's mutation — it is logged and
  // swallowed; the op is re-captured on the next edit and reconciled on a full pull.
  try {
    const now = ctx.now()
    const clock = ctx.clock.bumpLocal(tableName, recordId)
    const envelope = buildEnvelope({
      opType,
      clock,
      updatedAt: now,
      data: opType === 'delete' ? undefined : (row ?? {}),
    })

    ctx.db
      .insert(syncQueue)
      .values({
        tableName,
        recordId,
        opType,
        payload: serializeEnvelope(envelope),
        createdAt: now,
      })
      .run()
  } catch (err) {
    ctx.onError?.(err)
  }
}
