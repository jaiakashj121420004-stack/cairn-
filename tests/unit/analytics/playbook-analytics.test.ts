// @vitest-environment node
//
// Unit tests for the per-playbook expectancy analytics service.
// Uses sql.js so the SQL runs against a real SQLite engine.

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import initSqlJs from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import * as schema from '../../../electron/db/schema'
import { getByPlaybook } from '../../../electron/services/analytics/playbooks'
import type { AnalyticsFilter } from '../../../shared/types/index'

const MIGRATIONS_DIR = join(__dirname, '../../../electron/db/migrations')

function readMigration(tag: string) {
  return readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), 'utf-8')
}

const MIGRATIONS = [
  '0001_initial', '0002_v11', '0003_opened_at', '0004_consolidate_partials',
  '0005_dismissed_insights', '0006_notebook', '0007_notebook_account',
  '0008_external_ref', '0009_phase2', '0010_playbooks',
].map(readMigration)

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs()
})

const NOW = Date.UTC(2024, 0, 1)

const FIRM_ID    = '00000000-0000-0000-0000-0000000000f1'
const ACCOUNT_ID = '00000000-0000-0000-0000-0000000000a1'
const SETUP_A    = '00000000-0000-0000-0000-0000000000s1'
const SETUP_B    = '00000000-0000-0000-0000-0000000000s2'
const PAIR_ID    = '00000000-0000-0000-0000-0000000000p1'
const KZ_ID      = '00000000-0000-0000-0000-0000000000k1'

const FILTER: AnalyticsFilter = {
  accountIds:  [ACCOUNT_ID],
  dateFrom:    null,
  dateTo:      null,
  datePreset:  'all',
  mode:        'all',
  pairIds:     [],
  setupIds:    [],
  killzoneIds: [],
  cleanOnly:   false,
}

function makeDb() {
  const sqlite = new SQL.Database()
  for (const sql of MIGRATIONS) {
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const t = stmt.trim()
      if (t) sqlite.run(t)
    }
  }
  const db = drizzle(sqlite, { schema })

  db.insert(schema.propFirms).values({
    id: FIRM_ID, name: 'Firm', defaultStepCount: 1,
    notes: null, createdAt: NOW, updatedAt: NOW, deletedAt: null,
  }).run()
  db.insert(schema.accounts).values({
    id: ACCOUNT_ID, displayName: 'Acc', templateId: null, propFirmId: FIRM_ID,
    stepCount: 1, currentPhase: 1, accountSizeCents: 1_000_000, leverage: 100,
    dailyDrawdownType: 'percent_of_balance', dailyDrawdownValue: 500,
    totalDrawdownType: 'percent_of_balance', totalDrawdownValue: 1000,
    drawdownBasis: 'initial_balance', profitTargetPct: 1000,
    minTradingDays: null, maxTradingDays: null,
    weekendHoldingAllowed: 0, newsTradingAllowed: 1,
    consistencyRulePct: null, challengeCostCents: 0,
    startDate: NOW, status: 'active', endDate: null, endReason: null,
    peakEquityCents: 1_000_000, currentEquityCents: 1_000_000,
    notes: null, dailyTradeLimit: null, maxDailyLossPct: null,
    createdAt: NOW, updatedAt: NOW, deletedAt: null,
  }).run()

  for (const [id, name] of [[SETUP_A, 'ICT FVG'], [SETUP_B, 'ICT OB']]) {
    db.insert(schema.setups).values({
      id, name, category: 'ict', description: null,
      color: '#4CAF50', active: 1, displayOrder: 1,
      createdAt: NOW, updatedAt: NOW,
    }).run()
  }
  db.insert(schema.pairs).values({
    id: PAIR_ID, symbol: 'EURUSD', displayName: 'EUR/USD',
    assetClass: 'forex', pipDecimal: 4,
    pipValuePerStandardLotCents: 1000, correlatedWith: null,
    active: 1, displayOrder: 1, notes: null, createdAt: NOW, updatedAt: NOW,
  }).run()
  db.insert(schema.killzones).values({
    id: KZ_ID, name: 'London', startTimeUtc: '07:00', endTimeUtc: '10:00',
    color: '#4CAF50', active: 1, displayOrder: 1, notes: null,
    createdAt: NOW, updatedAt: NOW,
  }).run()

  return db
}

function insertClosedTrade(
  db: ReturnType<typeof makeDb>,
  id: string,
  setupId: string,
  pairId: string,
  killzoneId: string | null,
  pnlR: number,
) {
  db.insert(schema.trades).values({
    id,
    accountId:           ACCOUNT_ID,
    pairId,
    setupId,
    killzoneId,
    mode: 'live', direction: 'long', status: 'closed',
    entryPrice: 1_085_000, stopLossPrice: 1_084_000, takeProfitPrice: 1_087_000,
    slPips: 100, rrRatio: 200, lotSize: 10,
    riskAmountCents: 1000, riskPctBps: 100,
    plannedInvalidation: 'test',
    mssConfirmed: 1, htfBiasAligned: 1,
    preCalmScore: 7, preUrgencyScore: 3, preNeedScore: 2,
    pnlR,
    pnlCents:   pnlR > 0 ? 1000 : -1000,
    pnlPctBps:  pnlR > 0 ? 100  : -100,
    exitPrice:  1_087_000,
    exitTime:   NOW + 3600_000,
    exitReason: 'tp',
    phase2Complete: 1,
    createdAt: NOW, updatedAt: NOW,
  }).run()
}

describe('getByPlaybook', () => {
  it('returns empty array when no playbooks given', () => {
    const db = makeDb()
    expect(getByPlaybook(db, FILTER, [])).toEqual([])
  })

  it('returns empty array when playbook has no matching trades', () => {
    const db = makeDb()
    // No trades inserted
    const result = getByPlaybook(db, FILTER, [{
      id: 'pb-1', name: 'ICT FVG Long', pairId: PAIR_ID, setupId: SETUP_A, killzoneId: null,
    }])
    expect(result).toHaveLength(0)
  })

  it('matches by setup + pair + killzone and returns correct expectancy', () => {
    const db = makeDb()
    // 3 winning trades for the playbook
    insertClosedTrade(db, 't1', SETUP_A, PAIR_ID, KZ_ID,  200)
    insertClosedTrade(db, 't2', SETUP_A, PAIR_ID, KZ_ID,  100)
    insertClosedTrade(db, 't3', SETUP_A, PAIR_ID, KZ_ID, -100)
    // Noise: different setup — should NOT count
    insertClosedTrade(db, 't4', SETUP_B, PAIR_ID, KZ_ID, 300)

    const result = getByPlaybook(db, FILTER, [{
      id: 'pb-1', name: 'ICT FVG London', pairId: PAIR_ID, setupId: SETUP_A, killzoneId: KZ_ID,
    }])

    expect(result).toHaveLength(1)
    const row = result[0]
    expect(row?.playbookName).toBe('ICT FVG London')
    expect(row?.n).toBe(3)
    // wins: t1 (200) + t2 (100) = 2 wins out of 3 → win rate = 6666 bps
    expect(row?.winRateBps).toBeCloseTo(6667, -1)
    // expectancy = (200 + 100 - 100) / 3 = 200/3 ≈ 67 (integer-rounded)
    expect(row?.expectancyR).toBe(67)
  })

  it('playbook with no killzoneId matches trades with any killzone', () => {
    const db = makeDb()
    insertClosedTrade(db, 't1', SETUP_A, PAIR_ID, KZ_ID,    200)
    insertClosedTrade(db, 't2', SETUP_A, PAIR_ID, null,      100)  // no killzone

    const result = getByPlaybook(db, FILTER, [{
      id: 'pb-1', name: 'ICT FVG Any KZ', pairId: PAIR_ID, setupId: SETUP_A, killzoneId: null,
    }])
    // No killzone filter → matches both trades
    expect(result[0]?.n).toBe(2)
  })

  it('playbook with no pairId matches trades with any pair', () => {
    const db = makeDb()
    insertClosedTrade(db, 't1', SETUP_A, PAIR_ID, null, 200)

    const result = getByPlaybook(db, FILTER, [{
      id: 'pb-1', name: 'ICT FVG Any Pair', pairId: null, setupId: SETUP_A, killzoneId: null,
    }])
    expect(result[0]?.n).toBe(1)
  })

  it('omits playbooks whose trades are filtered out by the analytics filter', () => {
    const db = makeDb()
    insertClosedTrade(db, 't1', SETUP_A, PAIR_ID, null, 200)

    // Filter restricts to a different setup — playbook matches setup_a but filter excludes it
    const filteredSetupB: AnalyticsFilter = { ...FILTER, setupIds: [SETUP_B] }
    const result = getByPlaybook(db, filteredSetupB, [{
      id: 'pb-1', name: 'ICT FVG', pairId: PAIR_ID, setupId: SETUP_A, killzoneId: null,
    }])
    expect(result).toHaveLength(0)
  })
})
