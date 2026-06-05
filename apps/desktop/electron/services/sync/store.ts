/**
 * Local-SQLite side-effects for the pull/merge path (docs/sync-protocol.md §7.4, §4–5).
 *
 * The pull engine (pull.ts) decides *what* to do with each op (apply / ignore / conflict
 * / quarantine); this module performs the *effects* — upserting rows, writing tombstones,
 * recording conflicts and quarantines, appending audit entries, and advancing the pull
 * cursor — all inside ONE transaction per pull response.
 *
 * Effects run over the raw better-sqlite3 handle (synchronous, transaction-friendly) so
 * the whole apply is a single atomic unit and so tests can drive it against an in-memory
 * database without standing up the full Electron app. The camelCase→snake_case column
 * mapping is derived from the Drizzle schema (`getTableColumns`), so adding sync columns
 * later needs no change here.
 */
import { getTableColumns } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '../../db/schema'
import type { VectorClock } from '@cairn/sync-protocol'
import type DatabaseType from 'better-sqlite3'

/** Scalar value better-sqlite3 can bind to a prepared statement. */
type SqlBindValue = number | string | bigint | Uint8Array | null

/** Why an op could not be applied and was set aside (docs/sync-protocol.md §7.4, §8). */
export type QuarantineReason = 'DECRYPT_FAILED' | 'SCHEMA_INVALID'

/** A conflict to retain for the UI to resolve (docs/sync-protocol.md §5). */
export interface ConflictRecord {
  readonly tableName: string
  readonly recordId: string
  readonly localClock: VectorClock
  readonly remoteClock: VectorClock
  /** Canonical envelope plaintext of the local side (provisional-losing side preserved verbatim). */
  readonly localPayload: string
  /** Canonical envelope plaintext of the remote side. */
  readonly remotePayload: string
  readonly remoteOpId: number
  readonly remoteDeviceId: string
  readonly detectedAt: number
}

/** A quarantined op + the raw bytes we could not apply (preserved, never discarded). */
export interface QuarantineRecord {
  readonly tableName: string
  readonly recordId: string
  readonly remoteOpId: number
  readonly remoteDeviceId: string
  readonly reason: QuarantineReason
  readonly detail: string
  readonly payloadCiphertext: string
  readonly createdAt: number
}

/** One audit-log line (docs/sync-protocol.md §7.4 — quarantines are never silent). */
export interface AuditRecord {
  readonly event: string
  readonly tableName: string | null
  readonly recordId: string | null
  readonly detail: string
  readonly createdAt: number
}

/** The DB effects the pull engine drives. All mutating calls run inside {@link transaction}. */
export interface SyncLocalStore {
  /** True if `table` is a registered syncable table this client can apply. */
  knows(table: string): boolean
  /**
   * Validate a decrypted row against the table's schema, returning the parsed row.
   * @throws ZodError if the row does not match — the pull path turns this into a quarantine.
   */
  validate(table: string, data: unknown): Record<string, unknown>
  /** The current local row (raw snake_case columns), or null if absent — used to retain the local side of a conflict. */
  snapshotRaw(table: string, recordId: string): Record<string, unknown> | null
  /** INSERT-OR-REPLACE the row (known columns only; unknown keys ignored for forward-compat). */
  upsert(table: string, data: Record<string, unknown>): void
  /** Apply a delete tombstone: soft-delete the row if the table supports it, else hard-delete. */
  remove(table: string, recordId: string, updatedAt: number): void
  recordConflict(c: ConflictRecord): void
  quarantine(q: QuarantineRecord): void
  audit(a: AuditRecord): void
  /** Advance the persisted pull cursor (the global op id we have applied up to). */
  setCursor(lastOpId: number): void
  /** The persisted pull cursor, or 0 on first sync. */
  getCursor(): number
  /** Run `fn` inside one SQLite transaction. Rolls back if `fn` throws. */
  transaction(fn: () => void): void
}

// ── Table registry ───────────────────────────────────────────────────────────
//
// Each syncable table declares a Zod schema for its decrypted row and a field→column
// map. Schemas are deliberately strict on the columns they name (so a malformed op is
// caught and quarantined) and permissive about extra keys (`.passthrough()`), so a row
// written by a newer client version validates here and the unknown columns are simply
// not applied.

interface TableSpec {
  readonly sqlName: string
  readonly rowSchema: z.ZodType<Record<string, unknown>>
  /** Drizzle field name → SQL column name. */
  readonly columnMap: Readonly<Record<string, string>>
  /** Whether the table has a `deleted_at` column (soft-delete) vs hard-delete. */
  readonly softDelete: boolean
}

function columnMapOf(table: Parameters<typeof getTableColumns>[0]): Record<string, string> {
  const cols = getTableColumns(table)
  const map: Record<string, string> = {}
  for (const [field, col] of Object.entries(cols)) {
    map[field] = (col as { name: string }).name
  }
  return map
}

/** Decrypted `trades` row (camelCase, matching the Drizzle row enqueued on write). */
const tradeRowSchema = z
  .object({
    id: z.string().min(1),
    accountId: z.string().min(1),
    pairId: z.string().min(1),
    setupId: z.string().min(1),
    mode: z.string().min(1),
    direction: z.string().min(1),
    status: z.string().min(1),
    entryPrice: z.number().int(),
    stopLossPrice: z.number().int(),
    takeProfitPrice: z.number().int(),
    slPips: z.number().int(),
    rrRatio: z.number().int(),
    lotSize: z.number().int(),
    riskAmountCents: z.number().int(),
    riskPctBps: z.number().int(),
    plannedInvalidation: z.string(),
    mssConfirmed: z.number().int(),
    htfBiasAligned: z.number().int(),
    preCalmScore: z.number().int(),
    preUrgencyScore: z.number().int(),
    preNeedScore: z.number().int(),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .passthrough()

const TABLE_SPECS: Readonly<Record<string, TableSpec>> = {
  trades: {
    sqlName: 'trades',
    rowSchema: tradeRowSchema,
    columnMap: columnMapOf(schema.trades),
    softDelete: true,
  },
}

/** The set of table names this client knows how to apply. Exposed for diagnostics/tests. */
export const SYNCABLE_TABLES: readonly string[] = Object.keys(TABLE_SPECS)

/** Whether `table` is a registered syncable table this client can apply. */
export function isSyncableTable(table: string): boolean {
  return table in TABLE_SPECS
}

/**
 * Validate a decrypted row against its table's Zod schema, returning the parsed row.
 * The single source of validation shared by {@link SqliteSyncStore} and tests.
 * @throws ZodError on mismatch (the pull path turns this into a quarantine).
 */
export function validateSyncRow(table: string, data: unknown): Record<string, unknown> {
  const spec = TABLE_SPECS[table]
  if (!spec) throw new Error(`unknown syncable table: ${table}`)
  return spec.rowSchema.parse(data)
}

const PULL_CURSOR_KEY = 'pull_last_op_id'

export class SqliteSyncStore implements SyncLocalStore {
  constructor(private readonly db: DatabaseType.Database) {}

  knows(table: string): boolean {
    return isSyncableTable(table)
  }

  validate(table: string, data: unknown): Record<string, unknown> {
    return validateSyncRow(table, data)
  }

  snapshotRaw(table: string, recordId: string): Record<string, unknown> | null {
    const spec = TABLE_SPECS[table]
    if (!spec) throw new Error(`unknown syncable table: ${table}`)
    const row = this.db.prepare(`SELECT * FROM "${spec.sqlName}" WHERE "id" = ?`).get(recordId) as
      | Record<string, unknown>
      | undefined
    return row ?? null
  }

  upsert(table: string, data: Record<string, unknown>): void {
    const spec = TABLE_SPECS[table]
    if (!spec) throw new Error(`unknown syncable table: ${table}`)

    // Only write keys that map to a real column; ignore unknown (newer-client) keys.
    const fields = Object.keys(data).filter((k) => k in spec.columnMap)
    if (fields.length === 0) return
    const sqlCols = fields.map((f) => spec.columnMap[f] as string)
    const placeholders = fields.map(() => '?').join(', ')
    const colList = sqlCols.map((c) => `"${c}"`).join(', ')
    // INSERT … ON CONFLICT DO UPDATE, NOT INSERT OR REPLACE: REPLACE deletes the existing
    // row first, which would cascade/break child FKs (a trade's screenshots, partials,
    // rule_violations). An upsert updates in place and leaves the rowid + children intact.
    const setClause = sqlCols
      .filter((c) => c !== 'id')
      .map((c) => `"${c}" = excluded."${c}"`)
      .join(', ')
    const conflict =
      setClause.length > 0
        ? `ON CONFLICT("id") DO UPDATE SET ${setClause}`
        : `ON CONFLICT("id") DO NOTHING`
    const stmt = `INSERT INTO "${spec.sqlName}" (${colList}) VALUES (${placeholders}) ${conflict}`
    const values = fields.map((f) => data[f] as SqlBindValue)
    this.db.prepare(stmt).run(...values)
  }

  remove(table: string, recordId: string, updatedAt: number): void {
    const spec = TABLE_SPECS[table]
    if (!spec) throw new Error(`unknown syncable table: ${table}`)
    if (spec.softDelete) {
      this.db
        .prepare(`UPDATE "${spec.sqlName}" SET "deleted_at" = ?, "updated_at" = ? WHERE "id" = ?`)
        .run(updatedAt, updatedAt, recordId)
    } else {
      this.db.prepare(`DELETE FROM "${spec.sqlName}" WHERE "id" = ?`).run(recordId)
    }
  }

  recordConflict(c: ConflictRecord): void {
    this.db
      .prepare(
        `INSERT INTO "sync_conflicts"
           (table_name, record_id, local_clock, remote_clock, local_payload, remote_payload,
            remote_op_id, remote_device_id, detected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        c.tableName,
        c.recordId,
        JSON.stringify(c.localClock),
        JSON.stringify(c.remoteClock),
        c.localPayload,
        c.remotePayload,
        c.remoteOpId,
        c.remoteDeviceId,
        c.detectedAt,
      )
  }

  quarantine(q: QuarantineRecord): void {
    this.db
      .prepare(
        `INSERT INTO "sync_quarantine"
           (table_name, record_id, remote_op_id, remote_device_id, reason, detail,
            payload_ciphertext, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        q.tableName,
        q.recordId,
        q.remoteOpId,
        q.remoteDeviceId,
        q.reason,
        q.detail,
        q.payloadCiphertext,
        q.createdAt,
      )
  }

  audit(a: AuditRecord): void {
    this.db
      .prepare(
        `INSERT INTO "sync_audit" (event, table_name, record_id, detail, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(a.event, a.tableName, a.recordId, a.detail, a.createdAt)
  }

  setCursor(lastOpId: number): void {
    this.db
      .prepare(
        `INSERT INTO "sync_state" (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(PULL_CURSOR_KEY, lastOpId)
  }

  getCursor(): number {
    const row = this.db
      .prepare(`SELECT value FROM "sync_state" WHERE key = ?`)
      .get(PULL_CURSOR_KEY) as { value: number } | undefined
    return row?.value ?? 0
  }

  transaction(fn: () => void): void {
    this.db.transaction(fn)()
  }
}
