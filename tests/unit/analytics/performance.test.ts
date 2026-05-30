// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  ensureSqlJs,
  makeTestDb,
  seedAnalyticsFixtures,
  seedSingleTrade,
  seedTradeRow,
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
import { buildContext } from '../../../electron/services/rules-engine/context-builder'
import { tradingDayKey } from '../../../electron/services/time/trading-day'
import * as schema from '../../../electron/db/schema'
import type { AnalyticsFilter } from '../../../shared/types/index'

/** The app's default day-bucketing timezone (see CLAUDE.md §14 #16). */
const NY = 'America/New_York'

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
    expect(getDailyHeatmap(db, BASE_FILTER, NY)).toEqual([])
  })

  it('aggregates per day, sums match totals', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const cells = getDailyHeatmap(db, BASE_FILTER, NY)
    const total = cells.reduce((s, c) => s + c.pnlCents, 0)
    const tradeSum = cells.reduce((s, c) => s + c.tradeCount, 0)
    expect(total).toBe(EXPECTED.netPnlCents)
    expect(tradeSum).toBe(EXPECTED.tradeCount)
  })

  it('winCount per day matches wins from TRADES_12', () => {
    const { db, ids } = makeTestDb()
    seedAnalyticsFixtures(db, ids)
    const cells = getDailyHeatmap(db, BASE_FILTER, NY)

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
    const cells = getDailyHeatmap(db, BASE_FILTER, NY)
    for (const c of cells) {
      expect(typeof c.winCount).toBe('number')
      expect(c.winCount).toBeGreaterThanOrEqual(0)
      expect(c.winCount).toBeLessThanOrEqual(c.tradeCount)
    }
  })

  it('buckets a trade by exit_time in the configured timezone, not UTC (near local midnight)', () => {
    const { db, ids } = makeTestDb()
    // Apr 21 02:00 UTC == Apr 20 22:00 America/New_York (EDT, UTC-4).
    const ts = Date.UTC(2026, 3, 21, 2, 0, 0)
    seedTradeRow(db, ids, { createdAt: ts, exitTime: ts, pnlCents: -5000, pnlR: -100 })

    const nyCells = getDailyHeatmap(db, BASE_FILTER, NY)
    expect(nyCells.map((c) => c.date)).toEqual(['2026-04-20'])

    // The same instant under UTC would fall on the 21st — proves the tz is honoured.
    const utcCells = getDailyHeatmap(db, BASE_FILTER, 'UTC')
    expect(utcCells.map((c) => c.date)).toEqual(['2026-04-21'])
  })

  it('keeps a trade in its exit_time cell when the row is later edited (updated_at bumped)', () => {
    const { db, ids } = makeTestDb()
    const exitTs = Date.UTC(2026, 3, 20, 18, 0, 0) // Apr 20 14:00 EDT → New York Apr 20
    const id = seedTradeRow(db, ids, { createdAt: exitTs, updatedAt: exitTs, exitTime: exitTs })

    const before = getDailyHeatmap(db, BASE_FILTER, NY)
    expect(before.map((c) => c.date)).toEqual(['2026-04-20'])

    // Simulate editing the trade five days later: only updated_at changes.
    db.update(schema.trades)
      .set({ updatedAt: Date.UTC(2026, 3, 25, 12, 0, 0) })
      .where(eq(schema.trades.id, id))
      .run()

    const after = getDailyHeatmap(db, BASE_FILTER, NY)
    expect(after.map((c) => c.date)).toEqual(['2026-04-20'])
  })

  it('agrees with the rules engine on which day a trade belongs to', () => {
    const { db, ids } = makeTestDb()
    // A trade that is "tomorrow" in UTC but "today" in New York.
    const ts = Date.UTC(2026, 3, 21, 2, 0, 0)
    seedTradeRow(db, ids, { createdAt: ts, exitTime: ts })

    const cells = getDailyHeatmap(db, BASE_FILTER, NY)
    expect(cells.length).toBe(1)
    const cell = cells[0]
    if (!cell) throw new Error('test: expected exactly one heatmap cell')

    // The rules engine buckets the same trade into "today" for `now === ts`,
    // using the same timezone-aware day key — calendar and rules engine agree.
    const ctx = buildContext(db, ids.accountId, { now: ts })
    expect(ctx.timeZone).toBe(NY)
    expect(ctx.tradesToday.length).toBe(1)
    expect(cell.date).toBe(tradingDayKey(ts, ctx.timeZone))
  })

  it('excludes trades with null exit_time so they never create a phantom day', () => {
    const { db, ids } = makeTestDb()
    const day = Date.UTC(2026, 3, 20, 15, 0, 0)
    // An open trade (no exit yet) and a bad-data closed trade missing its exit_time.
    seedTradeRow(db, ids, { createdAt: day, exitTime: null, status: 'open', pnlCents: null, pnlR: null })
    seedTradeRow(db, ids, { createdAt: day, exitTime: null, status: 'closed' })

    expect(getDailyHeatmap(db, BASE_FILTER, NY)).toEqual([])
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
