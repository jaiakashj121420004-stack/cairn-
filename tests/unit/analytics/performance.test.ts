// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import {
  ensureSqlJs,
  makeTestDb,
  seedAnalyticsFixtures,
  seedSingleTrade,
  EXPECTED,
  TRADES_12,
} from './_fixtures'
import {
  getTotals,
  getEquityCurve,
  getRDistribution,
  getStreaks,
  getDailyHeatmap,
  getMaxDrawdownCents,
} from '../../../electron/services/analytics/performance'
import type { AnalyticsFilter } from '../../../shared/types/index'

beforeAll(ensureSqlJs)

const BASE_FILTER: AnalyticsFilter = {
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

describe('performance.getTotals', () => {
  it('returns zeroes on empty dataset', () => {
    const { db } = makeTestDb()
    const t = getTotals(db, BASE_FILTER)
    expect(t.tradeCount).toBe(0)
    expect(t.winRateBps).toBe(0)
    expect(t.profitFactor).toBe(0)
    expect(t.netPnlCents).toBe(0)
  })

  it('matches single-trade exactly', () => {
    const { db, ids } = makeTestDb()
    seedSingleTrade(db, ids)
    const spec = TRADES_12[0]
    if (!spec) throw new Error('test: TRADES_12 is empty')
    const t = getTotals(db, BASE_FILTER)
    expect(t.tradeCount).toBe(1)
    expect(t.winCount).toBe(spec.pnlR > 0 ? 1 : 0)
    expect(t.lossCount).toBe(spec.pnlR < 0 ? 1 : 0)
    expect(t.totalR).toBe(spec.pnlR)
    expect(t.netPnlCents).toBe(spec.pnlCents)
  })

  it('matches known 12-trade dataset', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const t = getTotals(db, BASE_FILTER)
    expect(t.tradeCount).toBe(EXPECTED.tradeCount)
    expect(t.winCount).toBe(EXPECTED.winCount)
    expect(t.lossCount).toBe(EXPECTED.lossCount)
    expect(t.winRateBps).toBe(EXPECTED.winRateBps)
    expect(t.expectancyR).toBe(EXPECTED.expectancyR)
    expect(t.totalR).toBe(EXPECTED.totalR)
    expect(t.netPnlCents).toBe(EXPECTED.netPnlCents)
    expect(t.profitFactor).toBe(EXPECTED.profitFactor)
    expect(t.avgWinCents).toBe(EXPECTED.avgWinCents)
    expect(t.avgLossCents).toBe(EXPECTED.avgLossCents)
  })

  it('respects cleanOnly filter', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const t = getTotals(db, { ...BASE_FILTER, cleanOnly: true })
    expect(t.tradeCount).toBe(EXPECTED.cleanCount)
    expect(t.netPnlCents).toBe(EXPECTED.cleanNetPnlCents)
  })
})

describe('performance.getEquityCurve', () => {
  it('empty on empty dataset', () => {
    const { db } = makeTestDb()
    expect(getEquityCurve(db, BASE_FILTER)).toEqual([])
  })

  it('cumulative sums match dataset', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const curve = getEquityCurve(db, BASE_FILTER)
    expect(curve.length).toBe(12)
    const lastPoint = curve[curve.length - 1]
    if (!lastPoint) throw new Error('test: equity curve is empty')
    expect(lastPoint.cumCents).toBe(EXPECTED.netPnlCents)
    expect(lastPoint.cumR).toBe(EXPECTED.totalR)
  })
})

describe('performance.getRDistribution', () => {
  it('empty on empty', () => {
    const { db } = makeTestDb()
    expect(getRDistribution(db, BASE_FILTER)).toEqual([])
  })

  it('bucket counts sum to tradeCount', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const dist = getRDistribution(db, BASE_FILTER)
    const sum = dist.reduce((s, b) => s + b.count, 0)
    expect(sum).toBe(EXPECTED.tradeCount)
  })
})

describe('performance.getStreaks', () => {
  it('none on empty', () => {
    const { db } = makeTestDb()
    const s = getStreaks(db, BASE_FILTER)
    expect(s.currentKind).toBe('none')
    expect(s.currentLen).toBe(0)
  })

  it('finds longest win and loss streaks', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const s = getStreaks(db, BASE_FILTER)
    expect(s.longestWin).toBe(EXPECTED.longestWin)
    expect(s.longestLoss).toBe(EXPECTED.longestLoss)
    expect(s.currentKind).toBe(EXPECTED.currentStreakKind)
    expect(s.currentLen).toBe(EXPECTED.currentStreakLen)
  })
})

describe('performance.getDailyHeatmap', () => {
  it('empty on empty', () => {
    const { db } = makeTestDb()
    expect(getDailyHeatmap(db, BASE_FILTER)).toEqual([])
  })

  it('aggregates per day, sums match totals', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const cells = getDailyHeatmap(db, BASE_FILTER)
    const total = cells.reduce((s, c) => s + c.pnlCents, 0)
    const tradeSum = cells.reduce((s, c) => s + c.tradeCount, 0)
    expect(total).toBe(EXPECTED.netPnlCents)
    expect(tradeSum).toBe(EXPECTED.tradeCount)
  })

  it('winCount per day matches wins from TRADES_12', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const cells = getDailyHeatmap(db, BASE_FILTER)

    // dayIdx 0 has T1 (win) + T2 (loss) → winCount 1
    const day0 = cells.find((c) => c.date.endsWith('-20'))
    expect(day0?.winCount).toBe(1)

    // dayIdx 1 has T3 (win only) → winCount 1
    const day1 = cells.find((c) => c.date.endsWith('-21'))
    expect(day1?.winCount).toBe(1)

    // dayIdx 2 has T4 (loss) + T5 (win) → winCount 1
    const day2 = cells.find((c) => c.date.endsWith('-22'))
    expect(day2?.winCount).toBe(1)

    // total winCount across all days must equal EXPECTED.winCount
    const totalWins = cells.reduce((s, c) => s + c.winCount, 0)
    expect(totalWins).toBe(EXPECTED.winCount)
  })

  it('each cell has the winCount field', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const cells = getDailyHeatmap(db, BASE_FILTER)
    for (const c of cells) {
      expect(typeof c.winCount).toBe('number')
      expect(c.winCount).toBeGreaterThanOrEqual(0)
      expect(c.winCount).toBeLessThanOrEqual(c.tradeCount)
    }
  })
})

describe('performance.getMaxDrawdownCents', () => {
  it('returns 0 for empty curve', () => {
    expect(getMaxDrawdownCents([])).toBe(0)
  })
  it('detects peak-to-trough', () => {
    const dd = getMaxDrawdownCents([
      { t: 1, cumCents: 100, cumR: 0 },
      { t: 2, cumCents: 200, cumR: 0 },
      { t: 3, cumCents: 50, cumR: 0 },
    ])
    expect(dd).toBe(150)
  })
})
