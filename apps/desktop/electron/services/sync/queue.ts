/**
 * SQLite-backed {@link SyncQueue} over the `sync_queue` table (docs/sync-protocol.md
 * §2.3). Reads oldest-first, deletes by id after the server acks. Kept behind the
 * {@link SyncQueue} interface so the push engine can be tested with an in-memory fake.
 */
import { asc, inArray } from 'drizzle-orm'
import { syncQueue } from '../../db/schema'
import type { QueueRow, SyncQueue } from './types'
import type { CairnDb } from '../../db/index'

/** Coerce the stored op_type into the narrow union, defaulting unknown values to 'upsert'. */
function asOpType(raw: string): QueueRow['opType'] {
  return raw === 'delete' ? 'delete' : 'upsert'
}

export class SqliteSyncQueue implements SyncQueue {
  constructor(private readonly db: CairnDb) {}

  take(limit: number): readonly QueueRow[] {
    const rows = this.db
      .select()
      .from(syncQueue)
      .orderBy(asc(syncQueue.createdAt), asc(syncQueue.id))
      .limit(limit)
      .all()

    return rows.map((r) => ({
      id: r.id,
      tableName: r.tableName,
      recordId: r.recordId,
      opType: asOpType(r.opType),
      payload: r.payload,
      createdAt: r.createdAt,
    }))
  }

  remove(ids: readonly number[]): void {
    if (ids.length === 0) return
    this.db
      .delete(syncQueue)
      .where(inArray(syncQueue.id, [...ids]))
      .run()
  }

  size(): number {
    return this.db.select().from(syncQueue).all().length
  }
}
