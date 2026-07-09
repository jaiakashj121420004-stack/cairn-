// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { ensureSqlJs, makeTestDb, seedAnalyticsFixtures } from './_fixtures'
import * as schema from '../../../electron/db/schema'
import {
  getAccountLadder,
  getPhaseTrend,
  getCostAnalysis,
  getFailureCauses,
  getDaysToFailureHistogram,
  getPatternInsights,
} from '../../../electron/services/analytics/phases'

beforeAll(ensureSqlJs)

describe('phases.getAccountLadder', () => {
  it('returns both seeded accounts', () => {
    const { db, ids } = makeTestDb()
    const ladder = getAccountLadder(db)
    expect(ladder.length).toBe(2)
    const byId = new Map(ladder.map((r) => [r.id, r]))
    const acc1 = byId.get(ids.accountId)
    const acc2 = byId.get(ids.accountId2)
    if (!acc1 || !acc2) throw new Error('test: seeded accounts missing from ladder')
    expect(acc1.status).toBe('active')
    expect(acc2.status).toBe('failed')
  })
})

describe('phases.getPhaseTrend', () => {
  it('one month per start date', () => {
    const { db } = makeTestDb()
    const pts = getPhaseTrend(db)
    expect(pts.length).toBeGreaterThan(0)
  })

  it('a "passed" account counts toward phase-1, phase-2, and funded rates', () => {
    // The status enum is active|passed|failed|paused|retired — 'passed' is the
    // completed-the-ladder terminal state. The prior code compared against a
    // nonexistent 'funded' status, which pinned every rate to 0. This account
    // sits alone in its own month bucket so all three rates must be 100%.
    const { db, ids } = makeTestDb()
    const ts = Date.UTC(2026, 0, 1)
    db.insert(schema.accounts)
      .values({
        id: 'passed-acct-1',
        displayName: 'Passed',
        templateId: null,
        propFirmId: ids.propFirmId,
        stepCount: 2,
        currentPhase: 1, // proves status alone drives the rate, not currentPhase
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
        startDate: Date.UTC(2026, 7, 1), // 2026-08 — its own month bucket
        status: 'passed',
        endDate: null,
        endReason: null,
        peakEquityCents: 5_000_000,
        currentEquityCents: 5_400_000,
        notes: null,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      })
      .run()

    const aug = getPhaseTrend(db).find((p) => p.month === '2026-08')
    if (!aug) throw new Error('test: expected a 2026-08 trend bucket')
    expect(aug.sampleSize).toBe(1)
    expect(aug.fundedRate).toBe(10000)
    expect(aug.phase1PassRate).toBe(10000)
    expect(aug.phase2PassRate).toBe(10000)
  })
})

describe('phases.getCostAnalysis', () => {
  it('includes seeded challenge costs', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const c = getCostAnalysis(db)
    expect(c.accountCount).toBe(2)
    expect(c.totalSpentCents).toBe(30000 + 60000)
  })
})

describe('phases.getFailureCauses', () => {
  it('empty when failed account has no violations', () => {
    const { db } = makeTestDb()
    expect(getFailureCauses(db)).toEqual([])
  })
})

describe('phases.getDaysToFailureHistogram', () => {
  it('buckets the failed account', () => {
    const { db } = makeTestDb()
    const h = getDaysToFailureHistogram(db)
    const total = h.reduce((s, b) => s + b.count, 0)
    expect(total).toBe(1)
  })
})

describe('phases.getPatternInsights', () => {
  it('returns empty with insufficient data', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids) // only 12 trades
    const ins = getPatternInsights(db)
    // calm n=5 and urgent n=5 both < 10 → urgent-vs-calm skipped
    // first n=10, thirdplus n=0 → skipped
    // clean n=4, dirty n=8 → skipped
    expect(ins).toEqual([])
  })
})
