// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { ensureSqlJs, makeTestDb, seedAnalyticsFixtures } from './_fixtures'
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
