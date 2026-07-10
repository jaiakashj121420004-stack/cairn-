// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/sql-js'
import initSqlJs from 'sql.js'
import * as schema from '../../../electron/db/schema'
import {
  DEMO_ACCOUNT_ID,
  removeDemoData,
  seedDemoData,
} from '../../../electron/services/demo/demo-seed'
import type { CairnDb } from '../../../electron/db/index'

const MIGRATIONS_DIR = join(__dirname, '../../../electron/db/migrations')
const ACCOUNT_SIZE_CENTS = 5_000_000

interface JournalEntry {
  idx: number
  tag: string
}

// Journal-driven migration load (reads meta/_journal.json rather than a hardcoded
// list) so this test can never drift behind a new migration.
function loadMigrations(): string[] {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf-8'),
  ) as { entries: JournalEntry[] }
  return [...journal.entries]
    .sort((a, b) => a.idx - b.idx)
    .map((e) => readFileSync(join(MIGRATIONS_DIR, `${e.tag}.sql`), 'utf-8'))
}

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null

beforeAll(async () => {
  SQL = await initSqlJs()
})

function freshDb(): CairnDb {
  if (!SQL) throw new Error('sql.js not initialized')
  const sqlite = new SQL.Database()
  for (const migration of loadMigrations()) {
    for (const stmt of migration.split('--> statement-breakpoint')) {
      const t = stmt.trim()
      if (t) sqlite.run(t)
    }
  }
  return drizzle(sqlite, { schema }) as unknown as CairnDb
}

describe('demo-seed', () => {
  it('seeds a self-contained demo account with closed trades, phases and rules', () => {
    const db = freshDb()
    const { accountId } = seedDemoData(db)
    expect(accountId).toBe(DEMO_ACCOUNT_ID)

    const account = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, DEMO_ACCOUNT_ID))
      .get()
    expect(account).toBeTruthy()
    expect(account?.status).toBe('active')

    const trades = db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.accountId, DEMO_ACCOUNT_ID))
      .all()
    expect(trades.length).toBeGreaterThanOrEqual(20)
    for (const t of trades) {
      expect(t.status).toBe('closed')
      expect(t.pnlCents).not.toBeNull()
      expect(Number.isInteger(t.pnlCents)).toBe(true)
      expect(Number.isInteger(t.pnlR)).toBe(true)
    }

    const phases = db
      .select()
      .from(schema.accountPhases)
      .where(eq(schema.accountPhases.accountId, DEMO_ACCOUNT_ID))
      .all()
    expect(phases.length).toBe(2)

    const rules = db
      .select()
      .from(schema.accountRules)
      .where(eq(schema.accountRules.accountId, DEMO_ACCOUNT_ID))
      .all()
    expect(rules.length).toBeGreaterThan(10)
  })

  it('records equity as account size plus net P&L', () => {
    const db = freshDb()
    seedDemoData(db)
    const account = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, DEMO_ACCOUNT_ID))
      .get()
    const trades = db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.accountId, DEMO_ACCOUNT_ID))
      .all()
    const net = trades.reduce((sum, t) => sum + (t.pnlCents ?? 0), 0)
    expect(account?.currentEquityCents).toBe(ACCOUNT_SIZE_CENTS + net)
    expect(account?.peakEquityCents).toBeGreaterThanOrEqual(ACCOUNT_SIZE_CENTS)
  })

  it('drives P&L through the production calculator: TP wins profit, SL losses lose', () => {
    const db = freshDb()
    seedDemoData(db)
    const trades = db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.accountId, DEMO_ACCOUNT_ID))
      .all()
    const wins = trades.filter((t) => t.exitReason === 'tp')
    const losses = trades.filter((t) => t.exitReason === 'sl')
    expect(wins.length).toBeGreaterThan(0)
    expect(losses.length).toBeGreaterThan(0)
    for (const w of wins) expect(w.pnlCents ?? 0).toBeGreaterThan(0)
    for (const l of losses) expect(l.pnlCents ?? 0).toBeLessThan(0)
  })

  it('is idempotent — re-seeding does not duplicate rows', () => {
    const db = freshDb()
    seedDemoData(db)
    const firstTrades = db.select().from(schema.trades).all().length
    const firstAccounts = db.select().from(schema.accounts).all().length
    seedDemoData(db)
    expect(db.select().from(schema.trades).all().length).toBe(firstTrades)
    expect(db.select().from(schema.accounts).all().length).toBe(firstAccounts)
  })

  it('removeDemoData wipes every demo row but preserves reference data', () => {
    const db = freshDb()
    seedDemoData(db)
    removeDemoData(db)

    expect(db.select().from(schema.accounts).all().length).toBe(0)
    expect(db.select().from(schema.trades).all().length).toBe(0)
    expect(db.select().from(schema.sessions).all().length).toBe(0)
    expect(db.select().from(schema.accountRules).all().length).toBe(0)
    expect(db.select().from(schema.accountPhases).all().length).toBe(0)
    expect(db.select().from(schema.playbooks).all().length).toBe(0)
    expect(db.select().from(schema.notebookEntries).all().length).toBe(0)

    // Reference/seed data is untouched.
    expect(db.select().from(schema.pairs).all().length).toBeGreaterThan(0)
    expect(db.select().from(schema.setups).all().length).toBeGreaterThan(0)
    expect(db.select().from(schema.killzones).all().length).toBeGreaterThan(0)
  })
})
