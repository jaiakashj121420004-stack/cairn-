// @vitest-environment node
import { drizzle } from 'drizzle-orm/sql-js'
import initSqlJs from 'sql.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { v7 as uuidv7 } from 'uuid'
import * as schema from '../../../electron/db/schema'
import type { CairnDb } from '../../../electron/db/index'

const MIGRATIONS = [
  readFileSync(join(__dirname, '../../../electron/db/migrations/0001_initial.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../../electron/db/migrations/0002_v11.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../../electron/db/migrations/0003_opened_at.sql'), 'utf-8'),
  readFileSync(
    join(__dirname, '../../../electron/db/migrations/0004_consolidate_partials.sql'),
    'utf-8',
  ),
  readFileSync(
    join(__dirname, '../../../electron/db/migrations/0005_dismissed_insights.sql'),
    'utf-8',
  ),
  readFileSync(join(__dirname, '../../../electron/db/migrations/0006_notebook.sql'), 'utf-8'),
  readFileSync(
    join(__dirname, '../../../electron/db/migrations/0007_notebook_account.sql'),
    'utf-8',
  ),
  readFileSync(join(__dirname, '../../../electron/db/migrations/0008_external_ref.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../../electron/db/migrations/0009_phase2.sql'), 'utf-8'),
]

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null

export async function ensureSqlJs(): Promise<void> {
  if (!SQL) SQL = await initSqlJs()
}

export interface FixtureIds {
  propFirmId: string
  accountId: string
  accountId2: string
  pairId1: string // EURUSD
  pairId2: string // GBPUSD
  setupId1: string // FVG
  setupId2: string // OB
  killzoneId1: string // London
  killzoneId2: string // NY
}

export interface TestDbBundle {
  db: CairnDb
  raw: unknown
  ids: FixtureIds
}

/**
 * Create an empty in-memory DB with schema + a minimal set of reference rows
 * (2 accounts, 2 pairs, 2 setups, 2 killzones, 1 prop firm).
 *
 * No trades, no rule violations.
 */
export function makeTestDb(): TestDbBundle {
  if (!SQL) throw new Error('Call await ensureSqlJs() in beforeAll first')
  const sqlite = new SQL.Database()
  for (const migration of MIGRATIONS) {
    for (const stmt of migration.split('--> statement-breakpoint')) {
      const t = stmt.trim()
      if (t) sqlite.run(t)
    }
  }
  const drizzleDb = drizzle(sqlite, { schema })
  const db = drizzleDb as unknown as CairnDb

  const ids: FixtureIds = {
    propFirmId: uuidv7(),
    accountId: uuidv7(),
    accountId2: uuidv7(),
    pairId1: uuidv7(),
    pairId2: uuidv7(),
    setupId1: uuidv7(),
    setupId2: uuidv7(),
    killzoneId1: uuidv7(),
    killzoneId2: uuidv7(),
  }

  const ts = Date.UTC(2026, 0, 1)

  db.insert(schema.propFirms)
    .values({
      id: ids.propFirmId,
      name: 'TestFirm',
      defaultStepCount: 2,
      notes: null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
    })
    .run()

  db.insert(schema.pairs)
    .values([
      {
        id: ids.pairId1,
        symbol: 'EURUSD',
        displayName: 'EUR / USD',
        assetClass: 'forex',
        pipDecimal: 4,
        pipValuePerStandardLotCents: 1000,
        correlatedWith: null,
        active: 1,
        displayOrder: 1,
        notes: null,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: ids.pairId2,
        symbol: 'GBPUSD',
        displayName: 'GBP / USD',
        assetClass: 'forex',
        pipDecimal: 4,
        pipValuePerStandardLotCents: 1000,
        correlatedWith: null,
        active: 1,
        displayOrder: 2,
        notes: null,
        createdAt: ts,
        updatedAt: ts,
      },
    ])
    .run()

  db.insert(schema.setups)
    .values([
      {
        id: ids.setupId1,
        name: 'FVG',
        category: 'ict',
        description: null,
        color: '#aaa',
        active: 1,
        displayOrder: 1,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: ids.setupId2,
        name: 'OB',
        category: 'ict',
        description: null,
        color: '#bbb',
        active: 1,
        displayOrder: 2,
        createdAt: ts,
        updatedAt: ts,
      },
    ])
    .run()

  db.insert(schema.killzones)
    .values([
      {
        id: ids.killzoneId1,
        name: 'London',
        startTimeUtc: '07:00',
        endTimeUtc: '10:00',
        color: '#aaa',
        active: 1,
        displayOrder: 1,
        notes: null,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: ids.killzoneId2,
        name: 'NY',
        startTimeUtc: '12:00',
        endTimeUtc: '15:00',
        color: '#bbb',
        active: 1,
        displayOrder: 2,
        notes: null,
        createdAt: ts,
        updatedAt: ts,
      },
    ])
    .run()

  db.insert(schema.accounts)
    .values([
      {
        id: ids.accountId,
        displayName: 'A1 Active',
        templateId: null,
        propFirmId: ids.propFirmId,
        stepCount: 2,
        currentPhase: 1,
        accountSizeCents: 5_000_000,
        leverage: 30,
        dailyTradeLimit: null,
        dailyDrawdownType: 'percent_of_balance',
        dailyDrawdownValue: 400,
        totalDrawdownType: 'percent_of_balance',
        totalDrawdownValue: 800,
        drawdownBasis: 'initial_balance',
        profitTargetPct: 800,
        minTradingDays: null,
        maxTradingDays: null,
        weekendHoldingAllowed: 0,
        newsTradingAllowed: 0,
        consistencyRulePct: null,
        challengeCostCents: 30000,
        startDate: Date.UTC(2026, 3, 1),
        status: 'active',
        endDate: null,
        endReason: null,
        peakEquityCents: 5_000_000,
        currentEquityCents: 5_085_000,
        notes: null,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      },
      {
        id: ids.accountId2,
        displayName: 'A2 Failed',
        templateId: null,
        propFirmId: ids.propFirmId,
        stepCount: 2,
        currentPhase: 2,
        accountSizeCents: 10_000_000,
        leverage: 30,
        dailyTradeLimit: null,
        dailyDrawdownType: 'percent_of_balance',
        dailyDrawdownValue: 400,
        totalDrawdownType: 'percent_of_balance',
        totalDrawdownValue: 800,
        drawdownBasis: 'initial_balance',
        profitTargetPct: 800,
        minTradingDays: null,
        maxTradingDays: null,
        weekendHoldingAllowed: 0,
        newsTradingAllowed: 0,
        consistencyRulePct: null,
        challengeCostCents: 60000,
        startDate: Date.UTC(2026, 1, 1),
        status: 'failed',
        endDate: Date.UTC(2026, 1, 20),
        endReason: 'daily_dd_breach',
        peakEquityCents: 10_000_000,
        currentEquityCents: 9_200_000,
        notes: null,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      },
    ])
    .run()

  return { db, raw: sqlite, ids }
}

// ── Deterministic 12-trade fixture ───────────────────────────────────────────

/**
 * Trade spec used by seedAnalyticsFixtures. Each row is hand-picked so totals
 * are computable by hand — see EXPECTED below.
 *
 * Dates: 2026-04 onwards. We use explicit UTC timestamps so strftime agrees
 * with our mental model.
 */
export interface TradeSpec {
  dayIdx: number // day offset from base date (0-based)
  hour: number // UTC hour for createdAt + updatedAt
  pair: 1 | 2
  setup: 1 | 2
  killzone: 1 | 2
  direction: 'long' | 'short'
  pnlR: number // ×100
  pnlCents: number
  slPips: number // tenths
  rrRatio: number // ×100
  isClean: 0 | 1
  rulesBroken: string[]
  mssConfirmed: 0 | 1
  dxyAligned: 0 | 1 | null
  smtConfirmed: 0 | 1 | null
  preCalmScore: number
  preUrgencyScore: number
  preNeedScore: number
  revengeFlag: 0 | 1
}

export const TRADES_12: TradeSpec[] = [
  // T1: clean win
  {
    dayIdx: 0,
    hour: 10,
    pair: 1,
    setup: 1,
    killzone: 1,
    direction: 'long',
    pnlR: 200,
    pnlCents: 20000,
    slPips: 100,
    rrRatio: 200,
    isClean: 1,
    rulesBroken: [],
    mssConfirmed: 1,
    dxyAligned: 1,
    smtConfirmed: null,
    preCalmScore: 8,
    preUrgencyScore: 3,
    preNeedScore: 2,
    revengeFlag: 0,
  },
  // T2: dirty loss (same day as T1 — second trade of the day)
  {
    dayIdx: 0,
    hour: 14,
    pair: 1,
    setup: 1,
    killzone: 1,
    direction: 'long',
    pnlR: -100,
    pnlCents: -10000,
    slPips: 100,
    rrRatio: 200,
    isClean: 0,
    rulesBroken: ['require_htf_bias_logged'],
    mssConfirmed: 1,
    dxyAligned: 0,
    smtConfirmed: 0,
    preCalmScore: 4,
    preUrgencyScore: 8,
    preNeedScore: 8,
    revengeFlag: 0,
  },
  // T3: clean win (big R)
  {
    dayIdx: 1,
    hour: 10,
    pair: 2,
    setup: 2,
    killzone: 2,
    direction: 'short',
    pnlR: 300,
    pnlCents: 30000,
    slPips: 100,
    rrRatio: 300,
    isClean: 1,
    rulesBroken: [],
    mssConfirmed: 1,
    dxyAligned: 1,
    smtConfirmed: 1,
    preCalmScore: 9,
    preUrgencyScore: 2,
    preNeedScore: 2,
    revengeFlag: 0,
  },
  // T4: dirty loss — multiple rules
  {
    dayIdx: 2,
    hour: 10,
    pair: 1,
    setup: 1,
    killzone: 1,
    direction: 'long',
    pnlR: -100,
    pnlCents: -10000,
    slPips: 100,
    rrRatio: 200,
    isClean: 0,
    rulesBroken: ['max_risk_per_trade', 'require_htf_bias_logged'],
    mssConfirmed: 1,
    dxyAligned: 0,
    smtConfirmed: 0,
    preCalmScore: 3,
    preUrgencyScore: 9,
    preNeedScore: 9,
    revengeFlag: 0,
  },
  // T5: dirty win — entered before MSS (same day as T4)
  {
    dayIdx: 2,
    hour: 14,
    pair: 1,
    setup: 2,
    killzone: 2,
    direction: 'long',
    pnlR: 100,
    pnlCents: 10000,
    slPips: 100,
    rrRatio: 100,
    isClean: 0,
    rulesBroken: ['entered_before_mss'],
    mssConfirmed: 0,
    dxyAligned: 0,
    smtConfirmed: null,
    preCalmScore: 5,
    preUrgencyScore: 5,
    preNeedScore: 5,
    revengeFlag: 0,
  },
  // T6: dirty loss — entered before MSS
  {
    dayIdx: 3,
    hour: 10,
    pair: 2,
    setup: 1,
    killzone: 1,
    direction: 'short',
    pnlR: -100,
    pnlCents: -10000,
    slPips: 100,
    rrRatio: 200,
    isClean: 0,
    rulesBroken: ['entered_before_mss'],
    mssConfirmed: 0,
    dxyAligned: 0,
    smtConfirmed: 0,
    preCalmScore: 3,
    preUrgencyScore: 9,
    preNeedScore: 9,
    revengeFlag: 0,
  },
  // T7: clean win
  {
    dayIdx: 4,
    hour: 10,
    pair: 1,
    setup: 1,
    killzone: 1,
    direction: 'long',
    pnlR: 200,
    pnlCents: 20000,
    slPips: 100,
    rrRatio: 200,
    isClean: 1,
    rulesBroken: [],
    mssConfirmed: 1,
    dxyAligned: 1,
    smtConfirmed: null,
    preCalmScore: 9,
    preUrgencyScore: 2,
    preNeedScore: 2,
    revengeFlag: 0,
  },
  // T8: dirty win — sl moved
  {
    dayIdx: 5,
    hour: 10,
    pair: 1,
    setup: 1,
    killzone: 1,
    direction: 'long',
    pnlR: 150,
    pnlCents: 15000,
    slPips: 100,
    rrRatio: 200,
    isClean: 0,
    rulesBroken: ['sl_moved_against'],
    mssConfirmed: 1,
    dxyAligned: null,
    smtConfirmed: null,
    preCalmScore: 6,
    preUrgencyScore: 6,
    preNeedScore: 6,
    revengeFlag: 0,
  },
  // T9: dirty loss — max trades
  {
    dayIdx: 6,
    hour: 10,
    pair: 2,
    setup: 2,
    killzone: 2,
    direction: 'short',
    pnlR: -100,
    pnlCents: -10000,
    slPips: 100,
    rrRatio: 200,
    isClean: 0,
    rulesBroken: ['max_trades_per_day'],
    mssConfirmed: 1,
    dxyAligned: 0,
    smtConfirmed: 0,
    preCalmScore: 3,
    preUrgencyScore: 9,
    preNeedScore: 9,
    revengeFlag: 0,
  },
  // T10: clean win
  {
    dayIdx: 7,
    hour: 10,
    pair: 1,
    setup: 2,
    killzone: 1,
    direction: 'long',
    pnlR: 200,
    pnlCents: 20000,
    slPips: 100,
    rrRatio: 200,
    isClean: 1,
    rulesBroken: [],
    mssConfirmed: 1,
    dxyAligned: 1,
    smtConfirmed: 1,
    preCalmScore: 8,
    preUrgencyScore: 3,
    preNeedScore: 3,
    revengeFlag: 0,
  },
  // T11: dirty loss — revenge trade
  {
    dayIdx: 8,
    hour: 10,
    pair: 2,
    setup: 1,
    killzone: 2,
    direction: 'short',
    pnlR: -100,
    pnlCents: -10000,
    slPips: 100,
    rrRatio: 200,
    isClean: 0,
    rulesBroken: ['revenge_trade'],
    mssConfirmed: 1,
    dxyAligned: 0,
    smtConfirmed: 0,
    preCalmScore: 2,
    preUrgencyScore: 10,
    preNeedScore: 10,
    revengeFlag: 1,
  },
  // T12: dirty win — sl moved
  {
    dayIdx: 9,
    hour: 10,
    pair: 1,
    setup: 1,
    killzone: 1,
    direction: 'long',
    pnlR: 200,
    pnlCents: 20000,
    slPips: 100,
    rrRatio: 200,
    isClean: 0,
    rulesBroken: ['sl_moved_against'],
    mssConfirmed: 1,
    dxyAligned: null,
    smtConfirmed: null,
    preCalmScore: 8,
    preUrgencyScore: 3,
    preNeedScore: 3,
    revengeFlag: 0,
  },
]

/** Base date for day-indexed trades: 2026-04-20 Monday 00:00 UTC. */
export const BASE_DATE_MS = Date.UTC(2026, 3, 20)

export function tradeTimestamp(spec: TradeSpec): number {
  return BASE_DATE_MS + spec.dayIdx * 86_400_000 + spec.hour * 3_600_000
}

export function seedTrades(
  db: CairnDb,
  ids: FixtureIds,
  specs: TradeSpec[],
  accountOverride?: string,
): string[] {
  const tradeIds: string[] = []
  const pair = (n: 1 | 2) => (n === 1 ? ids.pairId1 : ids.pairId2)
  const setup = (n: 1 | 2) => (n === 1 ? ids.setupId1 : ids.setupId2)
  const killzone = (n: 1 | 2) => (n === 1 ? ids.killzoneId1 : ids.killzoneId2)
  const accountId = accountOverride ?? ids.accountId

  for (const s of specs) {
    const t = tradeTimestamp(s)
    const id = uuidv7()
    tradeIds.push(id)

    db.insert(schema.trades)
      .values({
        id,
        accountId,
        sessionId: null,
        pairId: pair(s.pair),
        setupId: setup(s.setup),
        killzoneId: killzone(s.killzone),
        mode: 'live',
        direction: s.direction,
        status: 'closed',
        entryPrice: 10800,
        stopLossPrice: s.direction === 'long' ? 10790 : 10810,
        takeProfitPrice: s.direction === 'long' ? 10820 : 10780,
        slPips: s.slPips,
        rrRatio: s.rrRatio,
        lotSize: 50,
        riskAmountCents: 10000,
        riskPctBps: 100,
        plannedInvalidation: 'x',
        mssConfirmed: s.mssConfirmed,
        htfBiasAligned: 1,
        dxyAligned: s.dxyAligned,
        smtConfirmed: s.smtConfirmed,
        correlatedPairUsed: null,
        preCalmScore: s.preCalmScore,
        preUrgencyScore: s.preUrgencyScore,
        preNeedScore: s.preNeedScore,
        actualEntryPrice: null,
        actualEntryTime: null,
        exitPrice: null,
        // Closed trades carry an exit_time (the calendar buckets by it). Use the
        // trade timestamp so day-rollups stay deterministic.
        exitTime: t,
        exitReason: s.pnlR > 0 ? 'tp' : 'sl',
        pnlCents: s.pnlCents,
        pnlR: s.pnlR,
        pnlPctBps: Math.round((s.pnlCents * 10000) / 5_000_000),
        maxDrawdownDuringTradePctBps: null,
        maePips: null,
        mfePips: null,
        durationMinutes: null,
        followedPlanExactly: s.isClean ? 1 : 0,
        planChangesDescription: null,
        slMoved: s.rulesBroken.includes('sl_moved_against') ? 1 : 0,
        slMovedReason: null,
        tpMoved: 0,
        enteredBeforeMss: s.rulesBroken.includes('entered_before_mss') ? 1 : 0,
        revengeTradeFlag: s.revengeFlag,
        rulesBroken: JSON.stringify(s.rulesBroken),
        isClean: s.isClean,
        postCalmScore: null,
        whatIDidRight: null,
        whatIDidWrong: null,
        tags: null,
        brokerSource: null,
        brokerTradeId: null,
        importedAt: null,
        createdAt: t,
        updatedAt: t,
        deletedAt: null,
      })
      .run()

    for (const ruleKey of s.rulesBroken) {
      db.insert(schema.ruleViolations)
        .values({
          id: uuidv7(),
          accountId,
          tradeId: id,
          ruleKey,
          severity: 'blocking',
          outcome: 'logged_post_hoc',
          contextJson: '{}',
          createdAt: t,
        })
        .run()
    }
  }

  return tradeIds
}

export function seedAnalyticsFixtures(db: CairnDb, ids: FixtureIds): string[] {
  return seedTrades(db, ids, TRADES_12, ids.accountId)
}

export function seedSingleTrade(db: CairnDb, ids: FixtureIds): string {
  const firstTrade = TRADES_12[0]
  if (!firstTrade) throw new Error('test fixtures: TRADES_12 is empty')
  const tradeIds = seedTrades(db, ids, [firstTrade], ids.accountId)
  const id = tradeIds[0]
  if (!id) throw new Error('test fixtures: seedTrades returned no ids')
  return id
}

export interface SeedTradeRowOpts {
  createdAt?: number
  updatedAt?: number
  /** `undefined` → defaults to createdAt; pass `null` explicitly for no exit. */
  exitTime?: number | null
  status?: 'planned' | 'open' | 'closed' | 'cancelled'
  pnlCents?: number | null
  pnlR?: number | null
  accountId?: string
}

/**
 * Insert a single trade with sensible defaults and targeted overrides. Used by
 * timezone / exit_time bucketing tests that need precise timestamps rather than
 * the day-indexed TRADES_12 fixture. Returns the new trade id.
 */
export function seedTradeRow(db: CairnDb, ids: FixtureIds, opts: SeedTradeRowOpts = {}): string {
  const createdAt = opts.createdAt ?? BASE_DATE_MS
  const id = uuidv7()
  db.insert(schema.trades)
    .values({
      id,
      accountId: opts.accountId ?? ids.accountId,
      sessionId: null,
      pairId: ids.pairId1,
      setupId: ids.setupId1,
      killzoneId: ids.killzoneId1,
      mode: 'live',
      direction: 'long',
      status: opts.status ?? 'closed',
      entryPrice: 10800,
      stopLossPrice: 10790,
      takeProfitPrice: 10820,
      slPips: 100,
      rrRatio: 200,
      lotSize: 50,
      riskAmountCents: 10000,
      riskPctBps: 100,
      plannedInvalidation: 'x',
      mssConfirmed: 1,
      htfBiasAligned: 1,
      dxyAligned: null,
      smtConfirmed: null,
      correlatedPairUsed: null,
      preCalmScore: 8,
      preUrgencyScore: 3,
      preNeedScore: 2,
      actualEntryPrice: null,
      actualEntryTime: null,
      exitPrice: null,
      exitTime: opts.exitTime === undefined ? createdAt : opts.exitTime,
      exitReason: null,
      pnlCents: opts.pnlCents === undefined ? 10000 : opts.pnlCents,
      pnlR: opts.pnlR === undefined ? 100 : opts.pnlR,
      pnlPctBps: null,
      maxDrawdownDuringTradePctBps: null,
      maePips: null,
      mfePips: null,
      durationMinutes: null,
      followedPlanExactly: null,
      planChangesDescription: null,
      slMoved: 0,
      slMovedReason: null,
      tpMoved: 0,
      enteredBeforeMss: 0,
      revengeTradeFlag: 0,
      rulesBroken: null,
      isClean: null,
      postCalmScore: null,
      whatIDidRight: null,
      whatIDidWrong: null,
      tags: null,
      brokerSource: null,
      brokerTradeId: null,
      importedAt: null,
      createdAt,
      updatedAt: opts.updatedAt ?? createdAt,
      deletedAt: null,
    })
    .run()
  return id
}

export function seedBlockedViolations(db: CairnDb, ids: FixtureIds, count: number): void {
  const baseTs = BASE_DATE_MS
  for (let i = 0; i < count; i++) {
    db.insert(schema.ruleViolations)
      .values({
        id: uuidv7(),
        accountId: ids.accountId,
        tradeId: null,
        ruleKey: 'max_trades_per_day',
        severity: 'blocking',
        outcome: 'blocked',
        contextJson: '{}',
        createdAt: baseTs + i * 1000,
      })
      .run()
  }
}

/**
 * Pre-computed expected values for the 12-trade fixture.
 * These are hand-derived; tests compare against these as the source of truth.
 */
export const EXPECTED = {
  // totals
  tradeCount: 12,
  winCount: 7,
  lossCount: 5,
  winRateBps: 5833, // round(7/12 × 10000) = 5833
  totalR: 850, // 200-100+300-100+100-100+200+150-100+200-100+200
  expectancyR: 71, // round(850/12) = 70.83 → 71
  netPnlCents: 85000, // 20-10+30-10+10-10+20+15-10+20-10+20 (×1000)
  sumWinCents: 135000, // 20+30+10+20+15+20+20 (×1000)
  sumLossCents: 50000, // 10+10+10+10+10 (×1000)
  profitFactor: 270, // 135000/50000 × 100
  avgWinCents: 19286, // round(135000/7)
  avgLossCents: -10000, // round(-50000/5)
  netPnlPctBps: 170, // round(85000/5000000 × 10000)

  // clean vs dirty
  cleanCount: 4,
  dirtyCount: 8,
  cleanTotalR: 900, // 200+300+200+200
  cleanNetPnlCents: 90000,
  cleanWinRateBps: 10000,
  cleanExpectancyR: 225, // 900/4
  cleanAvgPnlCents: 22500, // 90000/4
  dirtyTotalR: -50, // 100-100-100-100+150-100-100+200 = actually let me recompute
  // Dirty trades: T2(-100), T4(-100), T5(+100), T6(-100), T8(+150), T9(-100), T11(-100), T12(+200) = -100-100+100-100+150-100-100+200 = -50
  dirtyNetPnlCents: -5000, // -10-10+10-10+15-10-10+20 = -5 (×1000)
  dirtyWinRateBps: 3750, // 3/8
  dirtyExpectancyR: -6, // round(-50/8) = -6.25 → -6
  dirtyAvgPnlCents: -625, // -5000/8

  // streaks (in order T1..T12)
  currentStreakKind: 'win' as const,
  currentStreakLen: 1,
  longestWin: 2, // T7+T8
  longestLoss: 1,

  // rule breakdown
  ruleCounts: {
    require_htf_bias_logged: 2, // T2, T4
    max_risk_per_trade: 1, // T4
    entered_before_mss: 2, // T5, T6
    sl_moved_against: 2, // T8, T12
    max_trades_per_day: 1, // T9
    revenge_trade: 1, // T11
  },

  // by setup (FVG = setup1, OB = setup2)
  fvgTradeCount: 8, // T1,T2,T4,T6,T7,T8,T11,T12
  fvgTotalR: 350, // 200-100-100-100+200+150-100+200
  fvgNetPnlCents: 35000,
  fvgWinRateBps: 5000, // 4/8
  obTradeCount: 4, // T3,T5,T9,T10
  obTotalR: 500, // 300+100-100+200
  obNetPnlCents: 50000,
  obWinRateBps: 7500, // 3/4

  // comparisons
  withMssCount: 10, // all except T5, T6
  withoutMssCount: 2,
  withDxyCount: 4, // T1, T3, T7, T10
  withoutDxyCount: 6, // T2, T4, T5, T6, T9, T11 (not null, = 0)
  withSmtCount: 2, // T3, T10
  withoutSmtCount: 5, // T2, T4, T6, T9, T11

  // behavioral
  calmCount: 5, // urgency 1-4: T1(3), T3(2), T7(2), T10(3), T12(3)
  calmWinRateBps: 10000, // all wins
  calmTotalR: 1100, // 200+300+200+200+200
  neutralCount: 2, // urgency 5-7: T5(5), T8(6)
  neutralWinRateBps: 10000, // both wins
  urgentCount: 5, // urgency 8-10: T2(8), T4(9), T6(9), T9(9), T11(10)
  urgentWinRateBps: 0, // all losses
  urgentTotalR: -500,

  // post-loss (losses: T2, T4, T6, T9, T11; next-after each are all wins)
  firstAfterLossCount: 5, // T3, T5, T7, T10, T12
  firstAfterLossWinRateBps: 10000,
  firstAfterLossTotalR: 1000, // 300+100+200+200+200
  // second-after-loss (lag2 was loss AND lag1 was not loss)
  // T4 (lag2=T2 loss, lag1=T3 win), T6 (lag2=T4 loss, lag1=T5 win), T8 (lag2=T6 loss, lag1=T7 win), T11 (lag2=T9 loss, lag1=T10 win)
  secondAfterLossCount: 4,
  secondAfterLossWinRateBps: 2500, // T8 win; T4,T6,T11 loss
  revengeCount: 1, // T11
  revengeWinRateBps: 0,

  // trade # of day
  tradeNum1Count: 10, // days with single trade + first trade of 2-trade days
  tradeNum2Count: 2, // T2 (day 0), T5 (day 2)
  tradeNum3PlusCount: 0,
}
