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
  /**
   * Persist a record's FULL vector clock to the durable `sync_clocks` table. Called inside
   * the page transaction by the pull/merge path so the durable clock and the applied row
   * commit atomically (docs/sync-protocol.md §3). The write path persists its own bumped
   * clock the same way (see `enqueue.ts`).
   */
  setClock(tableName: string, recordId: string, clock: VectorClock): void
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

/** Decrypted `accounts` row. Money columns are integer cents (§2.5); extras passthrough. */
const accountRowSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string(),
    propFirmId: z.string().min(1),
    stepCount: z.number().int(),
    currentPhase: z.number().int(),
    accountSizeCents: z.number().int(),
    leverage: z.number().int(),
    dailyDrawdownType: z.string().min(1),
    dailyDrawdownValue: z.number().int(),
    totalDrawdownType: z.string().min(1),
    totalDrawdownValue: z.number().int(),
    drawdownBasis: z.string().min(1),
    profitTargetPct: z.number().int(),
    weekendHoldingAllowed: z.number().int(),
    newsTradingAllowed: z.number().int(),
    challengeCostCents: z.number().int(),
    startDate: z.number().int(),
    status: z.string().min(1),
    peakEquityCents: z.number().int(),
    currentEquityCents: z.number().int(),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .passthrough()

/** Decrypted `sessions` row (the daily-bias plan). */
const sessionRowSchema = z
  .object({
    id: z.string().min(1),
    accountId: z.string().min(1),
    sessionDate: z.string().min(1),
    dailyBias: z.string().min(1),
    dailyBiasReason: z.string(),
    h4Bias: z.string().min(1),
    h4BiasReason: z.string(),
    h1Bias: z.string().min(1),
    h1BiasReason: z.string(),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .passthrough()

/** Decrypted `playbooks` row. `defaultRiskPct` is integer basis points (§2.5). */
const playbookRowSchema = z
  .object({
    id: z.string().min(1),
    accountId: z.string().min(1),
    name: z.string().min(1),
    setupId: z.string().min(1),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
    version: z.number().int(),
  })
  .passthrough()

/** Decrypted `notebook_entries` row. */
const notebookRowSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    content: z.string(),
    pinned: z.number().int(),
    version: z.number().int(),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .passthrough()

/** Decrypted `trade_partials` row. All money/pip columns are integer-encoded (§2.5/§19.5). */
const tradePartialRowSchema = z
  .object({
    id: z.string().min(1),
    tradeId: z.string().min(1),
    closePercentBps: z.number().int(),
    exitPrice: z.number().int(),
    exitTime: z.number().int(),
    createdAt: z.number().int(),
  })
  .passthrough()

const TABLE_SPECS: Readonly<Record<string, TableSpec>> = {
  trades: {
    sqlName: 'trades',
    rowSchema: tradeRowSchema,
    columnMap: columnMapOf(schema.trades),
    softDelete: true,
  },
  accounts: {
    sqlName: 'accounts',
    rowSchema: accountRowSchema,
    columnMap: columnMapOf(schema.accounts),
    softDelete: true,
  },
  sessions: {
    sqlName: 'sessions',
    rowSchema: sessionRowSchema,
    columnMap: columnMapOf(schema.sessions),
    softDelete: true,
  },
  playbooks: {
    sqlName: 'playbooks',
    rowSchema: playbookRowSchema,
    columnMap: columnMapOf(schema.playbooks),
    softDelete: true,
  },
  notebook_entries: {
    sqlName: 'notebook_entries',
    rowSchema: notebookRowSchema,
    columnMap: columnMapOf(schema.notebookEntries),
    softDelete: true,
  },
  trade_partials: {
    sqlName: 'trade_partials',
    rowSchema: tradePartialRowSchema,
    columnMap: columnMapOf(schema.tradePartials),
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

  /**
   * The current local row in the camelCase shape the sync envelope uses (the inverse of
   * {@link snapshotRaw}'s snake_case columns), or null if absent. Conflict resolution
   * re-enqueues the winning side, so it must speak the same camelCase vocabulary the row
   * was originally encrypted in — otherwise another device would quarantine it.
   */
  snapshotCamel(table: string, recordId: string): Record<string, unknown> | null {
    const spec = TABLE_SPECS[table]
    if (!spec) throw new Error(`unknown syncable table: ${table}`)
    const raw = this.snapshotRaw(table, recordId)
    if (raw === null) return null
    const colToField: Record<string, string> = {}
    for (const [field, col] of Object.entries(spec.columnMap)) colToField[col] = field
    const out: Record<string, unknown> = {}
    for (const [col, val] of Object.entries(raw)) {
      const field = colToField[col]
      if (field !== undefined) out[field] = val
    }
    return out
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

  setClock(tableName: string, recordId: string, clock: VectorClock): void {
    this.db
      .prepare(
        `INSERT INTO "sync_clocks" (table_name, record_id, clock, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(table_name, record_id) DO UPDATE SET clock = excluded.clock, updated_at = excluded.updated_at`,
      )
      .run(tableName, recordId, JSON.stringify(clock), Date.now())
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
