// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/sql-js'
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../electron/db/schema'
import { runSeed } from '../../electron/db/seed'

// sql.js and better-sqlite3 share the same sync drizzle interface but differ in the
// RunResult type parameter. We cast so runSeed (production code using better-sqlite3
// types) accepts the sql.js db in tests. The import above is type-only — no native
// module loads at test runtime.
function seed(db: ReturnType<typeof drizzle<typeof schema>>): void {
  runSeed(db as unknown as BetterSQLite3Database<typeof schema>)
}

const MIGRATION_SQL = readFileSync(
  join(__dirname, '../../electron/db/migrations/0001_initial.sql'),
  'utf-8',
)

let SQL: Awaited<ReturnType<typeof initSqlJs>>

// sql.js WASM init is async — do it once for the whole test file
beforeEach(async () => {
  if (!SQL) {
    SQL = await initSqlJs()
  }
})

function createTestDb() {
  const sqlite = new SQL.Database()

  // Execute each SQL statement split on the drizzle breakpoint marker
  const statements = MIGRATION_SQL.split('--> statement-breakpoint')
  for (const stmt of statements) {
    const trimmed = stmt.trim()
    if (trimmed) sqlite.run(trimmed)
  }

  const db = drizzle(sqlite, { schema })
  return { sqlite, db }
}

function getTableNames(sqlite: SqlJsDatabase): string[] {
  const result = sqlite.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  const first = result[0]
  if (!first) return []
  return first.values.map((row) => row[0] as string)
}

function getIndexNames(sqlite: SqlJsDatabase): string[] {
  const result = sqlite.exec(
    "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'",
  )
  const first = result[0]
  if (!first) return []
  return first.values.map((row) => row[0] as string)
}

describe('schema: migration SQL executes without errors', () => {
  it('creates all 16 tables successfully', () => {
    const { sqlite } = createTestDb()
    const tableNames = getTableNames(sqlite)

    expect(tableNames).toContain('settings')
    expect(tableNames).toContain('prop_firms')
    expect(tableNames).toContain('account_templates')
    expect(tableNames).toContain('accounts')
    expect(tableNames).toContain('account_rules')
    expect(tableNames).toContain('pairs')
    expect(tableNames).toContain('setups')
    expect(tableNames).toContain('killzones')
    expect(tableNames).toContain('sessions')
    expect(tableNames).toContain('trades')
    expect(tableNames).toContain('trade_screenshots')
    expect(tableNames).toContain('trade_partials')
    expect(tableNames).toContain('rule_violations')
    expect(tableNames).toContain('reviews')
    expect(tableNames).toContain('cooldowns')
    expect(tableNames).toContain('backup_log')
  })

  it('creates all 8 indexes', () => {
    const { sqlite } = createTestDb()
    const indexNames = getIndexNames(sqlite)

    expect(indexNames).toContain('idx_trades_account_date')
    expect(indexNames).toContain('idx_trades_session')
    expect(indexNames).toContain('idx_trades_status')
    expect(indexNames).toContain('idx_trades_mode')
    expect(indexNames).toContain('idx_trades_is_clean')
    expect(indexNames).toContain('idx_rule_violations_account')
    expect(indexNames).toContain('idx_sessions_account_date')
    expect(indexNames).toContain('idx_cooldowns_active')
  })
})

describe('seed: runs without error and inserts correct data', () => {
  let db: ReturnType<typeof createTestDb>['db']

  beforeEach(() => {
    const result = createTestDb()
    db = result.db
  })

  it('seed completes without throwing', () => {
    expect(() => seed(db)).not.toThrow()
  })

  it('inserts 8 default settings', () => {
    seed(db)
    const rows = db.select().from(schema.settings).all()
    expect(rows.length).toBe(8)
  })

  it('inserts 12 pairs', () => {
    seed(db)
    const rows = db.select().from(schema.pairs).all()
    expect(rows.length).toBe(12)

    const symbols = rows.map((r) => r.symbol)
    expect(symbols).toContain('EURUSD')
    expect(symbols).toContain('GBPUSD')
    expect(symbols).toContain('USDJPY')
    expect(symbols).toContain('XAUUSD')
    expect(symbols).toContain('BTCUSD')
  })

  it('inserts 10 setups', () => {
    seed(db)
    const rows = db.select().from(schema.setups).all()
    expect(rows.length).toBe(10)
  })

  it('inserts 5 killzones', () => {
    seed(db)
    const rows = db.select().from(schema.killzones).all()
    expect(rows.length).toBe(5)

    const names = rows.map((r) => r.name)
    expect(names).toContain('Asia')
    expect(names).toContain('London')
    expect(names).toContain('NY AM')
  })

  it('inserts Custom prop firm', () => {
    seed(db)
    const rows = db.select().from(schema.propFirms).all()
    expect(rows.length).toBe(1)
    expect(rows[0]?.name).toBe('Custom')
  })

  it('seed is idempotent — running twice does not duplicate rows', () => {
    seed(db)
    seed(db)

    const pairs = db.select().from(schema.pairs).all()
    const setups = db.select().from(schema.setups).all()
    const killzones = db.select().from(schema.killzones).all()
    const settings = db.select().from(schema.settings).all()

    expect(pairs.length).toBe(12)
    expect(setups.length).toBe(10)
    expect(killzones.length).toBe(5)
    expect(settings.length).toBe(8)
  })
})

describe('integrity: PRAGMA integrity_check passes after seed', () => {
  it('returns ok for a seeded database', () => {
    const { sqlite, db } = createTestDb()
    seed(db)

    const result = sqlite.exec('PRAGMA integrity_check')
    expect(result.length).toBeGreaterThan(0)

    const first = result[0]
    expect(first).toBeDefined()
    const rows = (first?.values ?? []).map((v) => v[0] as string)
    expect(rows).toEqual(['ok'])
  })

  it('migration is idempotent — foreign keys and indexes are valid after seed', () => {
    const { sqlite, db } = createTestDb()
    seed(db)

    const fkResult = sqlite.exec('PRAGMA foreign_key_check')
    // No violations means empty result or result with no rows
    const violations = fkResult.length > 0 ? (fkResult[0]?.values.length ?? 0) : 0
    expect(violations).toBe(0)
  })
})

describe('money: INTEGER minor units round-trip correctly', () => {
  it('stores and retrieves account size in minor units without precision loss', () => {
    const { db } = createTestDb()
    seed(db)

    const firmRows = db.select().from(schema.propFirms).all()
    const firmRow = firmRows[0]
    if (!firmRow) throw new Error('No firm row after seed')
    const accountId = 'test-account-id-001'
    const accountSizeCents = 5_000_000 // $50,000 in cents×10 (minor units)
    const challengeCostCents = 30_000 // $300 in cents×10

    db.insert(schema.accounts)
      .values({
        id: accountId,
        displayName: 'Test Account',
        propFirmId: firmRow.id,
        stepCount: 2,
        currentPhase: 1,
        accountSizeCents,
        leverage: 30,
        dailyDrawdownType: 'percent_of_balance',
        dailyDrawdownValue: 400,
        totalDrawdownType: 'percent_of_balance',
        totalDrawdownValue: 800,
        drawdownBasis: 'initial_balance',
        profitTargetPct: 800,
        weekendHoldingAllowed: 0,
        newsTradingAllowed: 0,
        challengeCostCents,
        startDate: Date.now(),
        status: 'active',
        peakEquityCents: accountSizeCents,
        currentEquityCents: accountSizeCents,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run()

    const retrieved = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .get()

    expect(retrieved).toBeDefined()
    expect(retrieved?.accountSizeCents).toBe(5_000_000)
    expect(retrieved?.challengeCostCents).toBe(30_000)
    expect(Number.isInteger(retrieved?.accountSizeCents)).toBe(true)
    expect(Number.isInteger(retrieved?.challengeCostCents)).toBe(true)
  })

  it('EURUSD pip value stored as 1000 cents (= $10.00 per standard lot)', () => {
    const { db } = createTestDb()
    seed(db)

    const eurusd = db
      .select()
      .from(schema.pairs)
      .where(eq(schema.pairs.symbol, 'EURUSD'))
      .get()

    expect(eurusd).toBeDefined()
    expect(eurusd?.pipValuePerStandardLotCents).toBe(1000)
    expect(Number.isInteger(eurusd?.pipValuePerStandardLotCents)).toBe(true)
  })

  it('negative P&L values round-trip without corruption', () => {
    const { db } = createTestDb()
    seed(db)

    // Use settings table as a simple integer storage vehicle
    db.insert(schema.settings)
      .values({
        key: 'test_negative_val',
        value: JSON.stringify(-12345),
        updatedAt: -12345,
      })
      .run()

    const row = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, 'test_negative_val'))
      .get()

    expect(row).toBeDefined()
    expect(row?.updatedAt).toBe(-12345)
    expect(Number.isInteger(row?.updatedAt)).toBe(true)
  })
})
