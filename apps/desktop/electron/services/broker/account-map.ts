/**
 * Broker → Cairn account bindings (Wave 4 — docs/broker-integration.md §4/§6).
 *
 * Pure persistence over the `broker_account_map` table: no Electron, no time read
 * beyond an injected/`Date.now` clock, so the ingest path and tests share it. The
 * table is PER-DEVICE configuration and is deliberately NOT synced (see the schema
 * note on `brokerAccountMap` and the exclusion comment in `services/sync/store.ts`).
 *
 * The binding is the ONLY thing that lets a live fill resolve to a Cairn account —
 * an unbound `(broker, brokerAccountId)` stays unmapped and creates no trade. Cairn
 * never guesses an account (CLAUDE.md §14 #39).
 */

import { and, eq, isNull } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import * as schema from '../../db/schema'
import type { CairnDb } from '../../db/index'
import type { BrokerAccountMapEntry, BrokerKind } from '@cairn/shared-types'

function toEntry(row: typeof schema.brokerAccountMap.$inferSelect): BrokerAccountMapEntry {
  return {
    id: row.id,
    broker: row.broker as BrokerKind,
    brokerAccountId: row.brokerAccountId,
    cairnAccountId: row.cairnAccountId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** All active (non-deleted) bindings, newest first. */
export function listBrokerAccountMap(db: CairnDb): BrokerAccountMapEntry[] {
  return db
    .select()
    .from(schema.brokerAccountMap)
    .where(isNull(schema.brokerAccountMap.deletedAt))
    .all()
    .map(toEntry)
}

/** The active binding for one broker account, or null if unbound. */
export function findBrokerAccountBinding(
  db: CairnDb,
  broker: BrokerKind,
  brokerAccountId: string,
): BrokerAccountMapEntry | null {
  const row = db
    .select()
    .from(schema.brokerAccountMap)
    .where(
      and(
        eq(schema.brokerAccountMap.broker, broker),
        eq(schema.brokerAccountMap.brokerAccountId, brokerAccountId),
        isNull(schema.brokerAccountMap.deletedAt),
      ),
    )
    .get()
  return row ? toEntry(row) : null
}

/**
 * Bind (or re-bind) a broker account to a Cairn account. If an active binding for
 * the same `(broker, brokerAccountId)` exists it is updated in place (editing the
 * target); otherwise a fresh row is inserted. Idempotent on `(broker, brokerAccountId)`.
 */
export function setBrokerAccountMap(
  db: CairnDb,
  broker: BrokerKind,
  brokerAccountId: string,
  cairnAccountId: string,
  nowMs: number = Date.now(),
): BrokerAccountMapEntry {
  const existing = findBrokerAccountBinding(db, broker, brokerAccountId)
  if (existing) {
    db.update(schema.brokerAccountMap)
      .set({ cairnAccountId, updatedAt: nowMs })
      .where(eq(schema.brokerAccountMap.id, existing.id))
      .run()
    return { ...existing, cairnAccountId, updatedAt: nowMs }
  }
  const id = uuidv7()
  db.insert(schema.brokerAccountMap)
    .values({
      id,
      broker,
      brokerAccountId,
      cairnAccountId,
      createdAt: nowMs,
      updatedAt: nowMs,
      deletedAt: null,
    })
    .run()
  return { id, broker, brokerAccountId, cairnAccountId, createdAt: nowMs, updatedAt: nowMs }
}

/**
 * Remove a binding (soft-delete). A later {@link setBrokerAccountMap} for the same
 * broker account inserts a fresh row — the partial unique index ignores the tombstone.
 */
export function deleteBrokerAccountMap(
  db: CairnDb,
  broker: BrokerKind,
  brokerAccountId: string,
  nowMs: number = Date.now(),
): void {
  db.update(schema.brokerAccountMap)
    .set({ deletedAt: nowMs, updatedAt: nowMs })
    .where(
      and(
        eq(schema.brokerAccountMap.broker, broker),
        eq(schema.brokerAccountMap.brokerAccountId, brokerAccountId),
        isNull(schema.brokerAccountMap.deletedAt),
      ),
    )
    .run()
}
