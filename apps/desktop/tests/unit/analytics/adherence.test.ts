// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import {
  ensureSqlJs,
  makeTestDb,
  seedAnalyticsFixtures,
  seedBlockedViolations,
  EXPECTED,
} from './_fixtures'
import {
  getAdherenceScore,
  getCleanVsDirty,
  getTopRulesBroken,
  getRuleBreakImpact,
  getBlockedCount,
  getAdherenceTrendWeekly,
} from '../../../electron/services/analytics/adherence'
import type { AnalyticsFilter } from '../../../shared/types/index'

beforeAll(ensureSqlJs)

const F: AnalyticsFilter = {
  accountIds: 'all',
  dateFrom: null,
  dateTo: null,
  datePreset: 'all',
  mode: 'all',
  pairIds: [],
  setupIds: [],
  killzoneIds: [],
  cleanOnly: false,
}

describe('adherence.getAdherenceScore', () => {
  it('zero on empty', () => {
    const { db } = makeTestDb()
    const s = getAdherenceScore(db, F)
    expect(s.cleanCount).toBe(0)
    expect(s.dirtyCount).toBe(0)
    expect(s.scoreBps).toBe(0)
    expect(s.prevScoreBps).toBeNull()
  })

  it('matches known dataset', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const s = getAdherenceScore(db, F)
    expect(s.cleanCount).toBe(EXPECTED.cleanCount)
    expect(s.dirtyCount).toBe(EXPECTED.dirtyCount)
    expect(s.scoreBps).toBe(Math.round((4 / 12) * 10000))
  })
})

describe('adherence.getCleanVsDirty', () => {
  it('matches known dataset', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const c = getCleanVsDirty(db, F)
    expect(c.clean.tradeCount).toBe(EXPECTED.cleanCount)
    expect(c.clean.winRateBps).toBe(EXPECTED.cleanWinRateBps)
    expect(c.clean.expectancyR).toBe(EXPECTED.cleanExpectancyR)
    expect(c.clean.netPnlCents).toBe(EXPECTED.cleanNetPnlCents)
    expect(c.dirty.tradeCount).toBe(EXPECTED.dirtyCount)
    expect(c.dirty.winRateBps).toBe(EXPECTED.dirtyWinRateBps)
    expect(c.dirty.expectancyR).toBe(EXPECTED.dirtyExpectancyR)
    expect(c.dirty.netPnlCents).toBe(EXPECTED.dirtyNetPnlCents)
    expect(c.avgPnlDiffCents).toBe(EXPECTED.cleanAvgPnlCents - EXPECTED.dirtyAvgPnlCents)
  })
})

describe('adherence.getTopRulesBroken / getRuleBreakImpact', () => {
  it('empty on empty', () => {
    const { db } = makeTestDb()
    expect(getTopRulesBroken(db, F)).toEqual([])
    expect(getRuleBreakImpact(db, F)).toEqual([])
  })

  it('counts match fixture rule counts', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const rows = getTopRulesBroken(db, F)
    const byKey = new Map(rows.map((r) => [r.ruleKey, r.count]))
    for (const [key, count] of Object.entries(EXPECTED.ruleCounts)) {
      expect(byKey.get(key)).toBe(count)
    }
  })

  it('impact order is worst (most negative) first', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const rows = getRuleBreakImpact(db, F)
    for (let i = 1; i < rows.length; i++) {
      const cur = rows[i]
      const prev = rows[i - 1]
      if (!cur || !prev) throw new Error('test: rows array shorter than expected')
      expect(cur.netPnlCents).toBeGreaterThanOrEqual(prev.netPnlCents)
    }
  })
})

describe('adherence.getBlockedCount', () => {
  it('counts blocked rows and projects avoided pnl', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    seedBlockedViolations(db, ids, 3)
    const b = getBlockedCount(db, F)
    expect(b.blockedCount).toBe(3)
    // dirty avg is -625 cents; projected avoided = 3 * 625 = 1875
    expect(b.projectedAvoidedCents).toBe(3 * Math.abs(EXPECTED.dirtyAvgPnlCents))
  })
})

describe('adherence.getAdherenceTrendWeekly', () => {
  it('empty on empty', () => {
    const { db } = makeTestDb()
    expect(getAdherenceTrendWeekly(db, F)).toEqual([])
  })

  it('returns weekly buckets summing to totals', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const rows = getAdherenceTrendWeekly(db, F)
    expect(rows.length).toBeGreaterThan(0)
    const totalClean = rows.reduce((s, r) => s + r.cleanCount, 0)
    const total = rows.reduce((s, r) => s + r.totalCount, 0)
    expect(totalClean).toBe(EXPECTED.cleanCount)
    expect(total).toBe(EXPECTED.tradeCount)
  })
})
