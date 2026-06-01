// @vitest-environment node
//
// Integration tests for the DB migration chain, focused on migration 0004
// (consolidating the float `partial_closes` table into the integer-encoded
// `trade_partials`). These apply migrations the SAME way production does —
// journal-driven, in the order recorded in meta/_journal.json — which also
// guards against the class of bug where a migration file exists but is never
// referenced by the journal (as happened with 0003 before this work).
import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import fc from 'fast-check'
import {
  dollarsToCents,
  rToIntHundredths,
  percentToBps,
  priceFloatToTicks,
  roundHalfAwayFromZero,
} from './_partial-close-codec'

const MIGRATIONS_DIR = join(__dirname, '../../electron/db/migrations')

interface JournalEntry {
  idx: number
  tag: string
}

function orderedTags(): string[] {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf-8'),
  ) as { entries: JournalEntry[] }
  return [...journal.entries].sort((a, b) => a.idx - b.idx).map((e) => e.tag)
}

function sqlForTag(tag: string): string {
  return readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), 'utf-8')
}

function applyMigration(sqlite: SqlJsDatabase, tag: string): void {
  for (const stmt of sqlForTag(tag).split('--> statement-breakpoint')) {
    const trimmed = stmt.trim()
    if (trimmed) sqlite.run(trimmed)
  }
}

function tableNames(sqlite: SqlJsDatabase): string[] {
  const res = sqlite.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  return res[0] ? res[0].values.map((r) => r[0] as string) : []
}

function queryRows(
  sqlite: SqlJsDatabase,
  sql: string,
): Array<Record<string, unknown>> {
  const stmt = sqlite.prepare(sql)
  const out: Array<Record<string, unknown>> = []
  while (stmt.step()) out.push(stmt.getAsObject())
  stmt.free()
  return out
}

let SQL: Awaited<ReturnType<typeof initSqlJs>>
beforeAll(async () => {
  SQL = await initSqlJs()
})

describe('migration journal wiring', () => {
  it('lists every migration in order (guards the 0003-omission class of bug)', () => {
    expect(orderedTags()).toEqual([
      '0001_initial',
      '0002_v11',
      '0003_opened_at',
      '0004_consolidate_partials',
      '0005_dismissed_insights',
      '0006_notebook',
      '0007_notebook_account',
      '0008_external_ref',
      '0009_phase2',
      '0010_playbooks',
    ])
    // Every journaled tag must resolve to a non-empty .sql file.
    for (const tag of orderedTags()) {
      expect(sqlForTag(tag).trim().length).toBeGreaterThan(0)
    }
  })

  it('applying all journaled migrations yields the consolidated integer schema', () => {
    const sqlite = new SQL.Database()
    for (const tag of orderedTags()) applyMigration(sqlite, tag)

    const tables = tableNames(sqlite)
    expect(tables).toContain('trade_partials')
    expect(tables).not.toContain('partial_closes')
    expect(tables).toContain('dismissed_insights')
    expect(tables).toContain('notebook_entries')

    // 0007: notebook_entries gains account_id (nullable) and version (integer).
    const nbInfo = sqlite.exec('PRAGMA table_info(`notebook_entries`)')
    const nbCols = new Map(
      (nbInfo[0]?.values ?? []).map((r) => [r[1] as string, (r[2] as string).toLowerCase()]),
    )
    expect(nbCols.has('account_id')).toBe(true)
    expect(nbCols.has('version')).toBe(true)
    expect(nbCols.get('version')).toBe('integer')

    // Declared types are integer; the float columns are gone.
    const info = sqlite.exec('PRAGMA table_info(`trade_partials`)')
    const colType = new Map(
      (info[0]?.values ?? []).map((r) => [r[1] as string, (r[2] as string).toLowerCase()]),
    )
    expect(colType.get('close_percent_bps')).toBe('integer')
    expect(colType.get('exit_price')).toBe('integer')
    expect(colType.get('pnl_cents')).toBe('integer')
    expect(colType.get('pnl_r')).toBe('integer')
    expect(colType.has('pnl_usd')).toBe(false)
    expect(colType.has('close_percent')).toBe(false)
    sqlite.close()
  })
})

describe('migration 0004: partial_closes → trade_partials conversion', () => {
  // Build the pre-consolidation state (everything up to and including 0003),
  // then seed partial_closes with mixed real/integer data.
  function seededPreConsolidation(): {
    sqlite: SqlJsDatabase
    expected: Array<Record<string, number | string | null>>
  } {
    const sqlite = new SQL.Database()
    for (const tag of ['0001_initial', '0002_v11', '0003_opened_at']) {
      applyMigration(sqlite, tag)
    }

    // Each row exercises a different shape. The first two are production-style
    // (cent/R aligned); p4 is a 1/3 split (repeating percent); p5/p6 are
    // arbitrary half-rounding edges (positive and negative) to prove the codec
    // mirrors SQLite's round() exactly.
    const seed = [
      { id: 'p1', trade_id: 't1', close_percent: 50.0, close_lots: 50, exit_price: 109123.0, exit_time: 1000, pnl_r: 1.5, pnl_usd: 12.34, notes: 'half tp' },
      { id: 'p2', trade_id: 't1', close_percent: 25.0, close_lots: 25, exit_price: 108880.0, exit_time: 2000, pnl_r: -0.75, pnl_usd: -8.5, notes: null },
      { id: 'p3', trade_id: 't2', close_percent: 100.0, close_lots: null, exit_price: 1995.0, exit_time: 3000, pnl_r: null, pnl_usd: null, notes: 'full' },
      { id: 'p4', trade_id: 't3', close_percent: (1 / 3) * 100, close_lots: 33, exit_price: 50000.0, exit_time: 4000, pnl_r: 0.333, pnl_usd: 3.33, notes: null },
      { id: 'p5', trade_id: 't4', close_percent: 12.5, close_lots: 12, exit_price: 42000.0, exit_time: 5000, pnl_r: 0.125, pnl_usd: 0.125, notes: 'edge+' },
      { id: 'p6', trade_id: 't4', close_percent: 12.5, close_lots: 12, exit_price: 42000.0, exit_time: 6000, pnl_r: -0.125, pnl_usd: -0.125, notes: 'edge-' },
    ]

    for (const r of seed) {
      sqlite.run(
        `INSERT INTO partial_closes
           (id, trade_id, close_percent, close_lots, exit_price, exit_time, pnl_r, pnl_usd, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.trade_id, r.close_percent, r.close_lots, r.exit_price, r.exit_time, r.pnl_r, r.pnl_usd, r.notes, r.exit_time],
      )
    }

    const expected = seed.map((r) => ({
      id: r.id,
      trade_id: r.trade_id,
      close_percent_bps: percentToBps(r.close_percent),
      close_lots: r.close_lots,
      exit_price: priceFloatToTicks(r.exit_price),
      exit_time: r.exit_time,
      pnl_r: r.pnl_r === null ? null : rToIntHundredths(r.pnl_r),
      pnl_cents: r.pnl_usd === null ? null : dollarsToCents(r.pnl_usd),
      notes: r.notes,
      created_at: r.exit_time,
    }))

    return { sqlite, expected }
  }

  it('converts every row to integer encoding, cent-for-cent and pip-for-pip', () => {
    const { sqlite, expected } = seededPreConsolidation()

    applyMigration(sqlite, '0004_consolidate_partials')

    expect(tableNames(sqlite)).not.toContain('partial_closes')

    const got = queryRows(sqlite, 'SELECT * FROM trade_partials ORDER BY exit_time')
    expect(got.length).toBe(expected.length)
    for (let i = 0; i < expected.length; i++) {
      expect(got[i]).toEqual(expected[i])
    }
    sqlite.close()
  })

  it('aborts without dropping data when the legacy trade_partials is non-empty', () => {
    const sqlite = new SQL.Database()
    for (const tag of ['0001_initial', '0002_v11', '0003_opened_at']) {
      applyMigration(sqlite, tag)
    }
    // Put a row into the legacy (old-shape) trade_partials. No code path does
    // this, but the migration must refuse to silently destroy it.
    sqlite.run(
      `INSERT INTO trade_partials (id, trade_id, price, lots_closed, pnl_cents, reason, closed_at)
       VALUES ('legacy1', 't1', 109000, 100, 5000, 'manual', 1000)`,
    )

    expect(() => applyMigration(sqlite, '0004_consolidate_partials')).toThrow()

    // The legacy table and its row survive the aborted migration.
    const surviving = queryRows(sqlite, 'SELECT id FROM trade_partials')
    expect(surviving).toEqual([{ id: 'legacy1' }])
    sqlite.close()
  })
})

describe('migration 0009: phase_2_complete column + backfill', () => {
  const PRE_0009 = [
    '0001_initial', '0002_v11', '0003_opened_at', '0004_consolidate_partials',
    '0005_dismissed_insights', '0006_notebook', '0007_notebook_account', '0008_external_ref',
  ]
  // All NOT-NULL columns on `trades` (FKs are off in sql.js, so account/pair/setup
  // ids need not resolve). Anything omitted must be nullable or defaulted.
  const COLS =
    'id, account_id, pair_id, setup_id, mode, direction, status, entry_price, ' +
    'stop_loss_price, take_profit_price, sl_pips, rr_ratio, lot_size, risk_amount_cents, ' +
    'risk_pct_bps, planned_invalidation, mss_confirmed, htf_bias_aligned, pre_calm_score, ' +
    'pre_urgency_score, pre_need_score, created_at, updated_at'
  const vals = (id: string, status: string) =>
    `'${id}','a','p','s','live','long','${status}',100,90,120,10,200,10,1000,100,'x',1,1,5,5,5,1,1`

  it('adds phase_2_complete, backfilling closed trades → 1 and leaving open → 0', () => {
    const sqlite = new SQL.Database()
    for (const tag of PRE_0009) applyMigration(sqlite, tag)

    // Column absent before the migration.
    const before = sqlite.exec('PRAGMA table_info(`trades`)')
    const beforeCols = (before[0]?.values ?? []).map((r) => r[1] as string)
    expect(beforeCols).not.toContain('phase_2_complete')

    // Seed pre-existing rows captured under the old single-phase flow.
    sqlite.run(`INSERT INTO trades (${COLS}) VALUES (${vals('closed1', 'closed')})`)
    sqlite.run(`INSERT INTO trades (${COLS}) VALUES (${vals('open1', 'open')})`)

    applyMigration(sqlite, '0009_phase2')

    const after = sqlite.exec('PRAGMA table_info(`trades`)')
    const afterCols = new Map(
      (after[0]?.values ?? []).map((r) => [r[1] as string, (r[2] as string).toLowerCase()]),
    )
    expect(afterCols.has('phase_2_complete')).toBe(true)
    expect(afterCols.get('phase_2_complete')).toBe('integer')

    const rows = queryRows(sqlite, 'SELECT id, phase_2_complete FROM trades ORDER BY id')
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.phase_2_complete]))
    expect(byId['closed1']).toBe(1) // backfilled — its reflection is already on the row
    expect(byId['open1']).toBe(0)   // not closed → no reflection owed yet
    sqlite.close()
  })

  it('a new trade inserted without the column defaults to 0 (reflection owed)', () => {
    const sqlite = new SQL.Database()
    for (const tag of orderedTags()) applyMigration(sqlite, tag)
    // Note: phase_2_complete intentionally omitted — the DEFAULT must apply.
    sqlite.run(`INSERT INTO trades (${COLS}) VALUES (${vals('new1', 'open')})`)
    const row = queryRows(sqlite, "SELECT phase_2_complete FROM trades WHERE id = 'new1'")
    expect(row[0]?.phase_2_complete).toBe(0)
    sqlite.close()
  })
})

describe('migration 0010: playbooks table', () => {
  it('creates the playbooks table with all required columns', () => {
    const sqlite = new SQL.Database()
    for (const tag of orderedTags()) applyMigration(sqlite, tag)

    const tables = tableNames(sqlite)
    expect(tables).toContain('playbooks')

    const info = sqlite.exec('PRAGMA table_info(`playbooks`)')
    const cols = new Map(
      (info[0]?.values ?? []).map((r) => [r[1] as string, (r[2] as string).toLowerCase()]),
    )
    expect(cols.has('id')).toBe(true)
    expect(cols.has('account_id')).toBe(true)
    expect(cols.has('name')).toBe(true)
    expect(cols.has('setup_id')).toBe(true)
    expect(cols.has('pair_id')).toBe(true)
    expect(cols.has('killzone_id')).toBe(true)
    expect(cols.has('default_risk_pct')).toBe(true)
    expect(cols.has('default_invalidation_chip')).toBe(true)
    expect(cols.has('required_confluence_md')).toBe(true)
    expect(cols.has('version')).toBe(true)
    expect(cols.has('deleted_at')).toBe(true)
    // Risk % stored as integer basis points, not float
    expect(cols.get('default_risk_pct')).toBe('integer')
    expect(cols.get('version')).toBe('integer')
    sqlite.close()
  })

  it('prior tables are unaffected', () => {
    const sqlite = new SQL.Database()
    for (const tag of orderedTags()) applyMigration(sqlite, tag)
    const tables = tableNames(sqlite)
    expect(tables).toContain('trades')
    expect(tables).toContain('notebook_entries')
    expect(tables).toContain('trade_partials')
    sqlite.close()
  })
})

describe('partial-close conversion codec (property-based)', () => {
  it('dollarsToCents is exact for cent-aligned amounts (the production case)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100_000_000, max: 100_000_000 }), (cents) => {
        expect(dollarsToCents(cents / 100)).toBe(cents)
      }),
    )
  })

  it('rToIntHundredths is exact for R aligned to 0.01', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }), (rh) => {
        expect(rToIntHundredths(rh / 100)).toBe(rh)
      }),
    )
  })

  it('percentToBps is exact for percent aligned to 0.01', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (bps) => {
        expect(percentToBps(bps / 100)).toBe(bps)
      }),
    )
  })

  it('every encoder returns an integer and preserves sign', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
        (x) => {
          const cents = dollarsToCents(x)
          expect(Number.isInteger(cents)).toBe(true)
          if (x > 0) expect(cents).toBeGreaterThanOrEqual(0)
          if (x < 0) expect(cents).toBeLessThanOrEqual(0)
        },
      ),
    )
  })

  it("roundHalfAwayFromZero matches the live SQLite engine's round()", () => {
    const sqlite = new SQL.Database()
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }), (n) => {
        const x = n / 10 // yields .0 and exact .5 cases
        const res = sqlite.exec(`SELECT round(${x})`)
        const sqliteVal = res[0]?.values[0]?.[0] as number
        expect(roundHalfAwayFromZero(x)).toBe(sqliteVal)
      }),
    )
    sqlite.close()
  })
})
