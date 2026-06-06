// @vitest-environment node
//
// Integration test: MAE/MFE storage through the shared import committer.
// Verifies that a candidate carrying a price series populates the
// mae_pips / mfe_pips columns (tenths-of-pip), and that a candidate with no
// series leaves them null — no interpolation, no guessing.

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import initSqlJs from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import { eq } from 'drizzle-orm'
import * as schema from '../../electron/db/schema'
import { commitCandidates } from '../../electron/services/import-adapters/_shared/committer'
import type { ImportCandidate, PriceCandle } from '../../shared/types/index'

const MIGRATIONS = [
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
  '0011_sync',
  '0012_sync_merge',
  '0013_sync_clocks',
].map((t) => readFileSync(join(__dirname, `../../electron/db/migrations/${t}.sql`), 'utf-8'))

const PROP_FIRM_ID = '00000000-0000-0000-0000-000000000001'
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000002'
const SETUP_ID = '00000000-0000-0000-0000-000000000003'
const EURUSD_PAIR_ID = '00000000-0000-0000-0000-000000000004'

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs()
})

function makeDb() {
  const sqlite = new SQL.Database()
  for (const sql of MIGRATIONS) {
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const t = stmt.trim()
      if (t) sqlite.run(t)
    }
  }
  const db = drizzle(sqlite, { schema })
  const now = Date.UTC(2024, 0, 1)

  db.insert(schema.propFirms)
    .values({
      id: PROP_FIRM_ID,
      name: 'Test Firm',
      defaultStepCount: 1,
      notes: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run()

  db.insert(schema.accounts)
    .values({
      id: ACCOUNT_ID,
      displayName: 'Demo',
      templateId: null,
      propFirmId: PROP_FIRM_ID,
      stepCount: 1,
      currentPhase: 1,
      accountSizeCents: 1_000_000,
      leverage: 100,
      dailyDrawdownType: 'percent_of_balance',
      dailyDrawdownValue: 500,
      totalDrawdownType: 'percent_of_balance',
      totalDrawdownValue: 1000,
      drawdownBasis: 'initial_balance',
      profitTargetPct: 1000,
      minTradingDays: null,
      maxTradingDays: null,
      weekendHoldingAllowed: 0,
      newsTradingAllowed: 1,
      consistencyRulePct: null,
      challengeCostCents: 10000,
      startDate: now,
      status: 'active',
      endDate: null,
      endReason: null,
      peakEquityCents: 1_000_000,
      currentEquityCents: 1_000_000,
      notes: null,
      dailyTradeLimit: null,
      maxDailyLossPct: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run()

  db.insert(schema.setups)
    .values({
      id: SETUP_ID,
      name: 'ICT OB',
      category: 'ict',
      description: null,
      color: '#4CAF50',
      active: 1,
      displayOrder: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  db.insert(schema.pairs)
    .values({
      id: EURUSD_PAIR_ID,
      symbol: 'EURUSD',
      displayName: 'EUR/USD',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 1000,
      correlatedWith: null,
      active: 1,
      displayOrder: 1,
      notes: null,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return db
}

const PAIR_DETAIL = new Map([
  [EURUSD_PAIR_ID, { id: EURUSD_PAIR_ID, pipDecimal: 4, pipValuePerStandardLotCents: 1000 }],
])
const ACCOUNT = { id: ACCOUNT_ID, accountSizeCents: 1_000_000 }
const OPTS = {
  accountId: ACCOUNT_ID,
  defaultSetupId: SETUP_ID,
  brokerSource: 'tradingview',
  nowMs: Date.UTC(2024, 0, 2),
}

// Long fixture matching the unit test: entry 1.08500, sl 1.08400 (risk 0.00100).
// max adverse 0.00120 → 1.20R → 120 tenths ;  max favourable 0.00200 → 2.00R → 200 tenths.
const SERIES: PriceCandle[] = [
  { ts: 1, high: '1.08600', low: '1.08450' },
  { ts: 2, high: '1.08700', low: '1.08380' },
  { ts: 3, high: '1.08550', low: '1.08500' },
]

function candidate(overrides: Partial<ImportCandidate> = {}): ImportCandidate {
  return {
    externalRef: 'tv_trade_1',
    brokerTradeId: '1',
    symbol: 'EURUSD',
    pairId: EURUSD_PAIR_ID,
    direction: 'long',
    entryTime: Date.UTC(2024, 0, 1, 9, 35),
    entryPrice: '1.08500',
    exitTime: Date.UTC(2024, 0, 1, 12, 0),
    exitPrice: '1.08700',
    stopLoss: '1.08400',
    takeProfit: '1.08700',
    volumeLots: '0.10',
    pnlAmount: '20.00',
    commission: '0.00',
    swap: '0.00',
    status: 'closed',
    partialExits: [],
    ...overrides,
  }
}

function readTrade(db: ReturnType<typeof makeDb>) {
  return db
    .select({
      maePips: schema.trades.maePips,
      mfePips: schema.trades.mfePips,
      slPips: schema.trades.slPips,
    })
    .from(schema.trades)
    .where(eq(schema.trades.externalRef, 'tv_trade_1'))
    .get()
}

describe('committer — MAE/MFE storage', () => {
  it('stores mae_pips / mfe_pips (tenths) when a price series is present', () => {
    const db = makeDb()
    const res = commitCandidates(
      db,
      [candidate({ priceSeries: SERIES })],
      OPTS,
      PAIR_DETAIL,
      ACCOUNT,
    )
    expect(res.imported).toBe(1)

    const trade = readTrade(db)
    expect(trade?.maePips).toBe(120)
    expect(trade?.mfePips).toBe(200)
  })

  it('stored MAE/MFE pip-tenths divided by sl_pips equals the R multiple', () => {
    const db = makeDb()
    commitCandidates(db, [candidate({ priceSeries: SERIES })], OPTS, PAIR_DETAIL, ACCOUNT)
    const trade = readTrade(db)
    expect(trade?.slPips).toBe(100) // |1.08500 − 1.08400| × 10^5
    expect((trade?.maePips ?? 0) / (trade?.slPips ?? 1)).toBeCloseTo(1.2, 5) // 1.20R
    expect((trade?.mfePips ?? 0) / (trade?.slPips ?? 1)).toBeCloseTo(2.0, 5) // 2.00R
  })

  it('leaves mae_pips / mfe_pips null when no price series is present', () => {
    const db = makeDb()
    commitCandidates(db, [candidate()], OPTS, PAIR_DETAIL, ACCOUNT)
    const trade = readTrade(db)
    expect(trade?.maePips).toBeNull()
    expect(trade?.mfePips).toBeNull()
  })

  it('leaves them null when a series is present but there is no stop-loss', () => {
    const db = makeDb()
    commitCandidates(
      db,
      [candidate({ stopLoss: null, priceSeries: SERIES })],
      OPTS,
      PAIR_DETAIL,
      ACCOUNT,
    )
    const trade = readTrade(db)
    expect(trade?.maePips).toBeNull()
    expect(trade?.mfePips).toBeNull()
  })

  it('leaves them null when the series is empty', () => {
    const db = makeDb()
    commitCandidates(db, [candidate({ priceSeries: [] })], OPTS, PAIR_DETAIL, ACCOUNT)
    const trade = readTrade(db)
    expect(trade?.maePips).toBeNull()
    expect(trade?.mfePips).toBeNull()
  })
})
