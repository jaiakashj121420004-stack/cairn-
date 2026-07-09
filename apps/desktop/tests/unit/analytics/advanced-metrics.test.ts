// @vitest-environment node
//
// Unit + property tests for electron/services/analytics/advanced-metrics.ts.
//
// Hand-computed fixtures verify exact formulas (Sharpe, Sortino, max
// drawdown, recovery factor, Kelly %, SQN, day consistency, extremes, hold
// time). Fast-check properties guard the invariants the module's doc
// comments promise: non-negativity, clamping, and scale-invariance /
// scale-linearity under a uniform positive P&L multiplier.

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  computeAdvancedMetrics,
  getAvgHoldMinutes,
  getDayConsistency,
  getExtremes,
  getKellyPct,
  getMaxDrawdown,
  getRecoveryFactor,
  getSharpeRatio,
  getSortinoRatio,
  getSqn,
  getStdDevR,
  type AdvancedMetricsTradeInput,
} from '../../../electron/services/analytics/advanced-metrics'

const UTC = 'UTC'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function row(overrides: Partial<AdvancedMetricsTradeInput> = {}): AdvancedMetricsTradeInput {
  return {
    pnlCents: null,
    pnlR: null,
    exitTime: null,
    durationMinutes: null,
    ...overrides,
  }
}

/** One trade landing on UTC calendar day `dayIndex` (0-based from 2024-01-01). */
function dayTrade(dayIndex: number, pnlCents: number, pnlR = pnlCents): AdvancedMetricsTradeInput {
  return row({ pnlCents, pnlR, exitTime: Date.UTC(2024, 0, 1 + dayIndex, 12, 0, 0) })
}

/** One trade at a distinct, strictly increasing instant (one calendar day
 * apart) — for max-drawdown ordering/duration tests. Daily spacing (rather
 * than arbitrary ms steps) keeps `durationDays` hand-computations exact. */
function tradeAt(index: number, pnlCents: number): AdvancedMetricsTradeInput {
  return row({ pnlCents, pnlR: pnlCents, exitTime: Date.UTC(2024, 0, 1) + index * 86_400_000 })
}

function invariantResult(
  a: { value: number | null; sufficient: boolean },
  b: { value: number | null; sufficient: boolean },
): boolean {
  if (a.sufficient !== b.sufficient) return false
  if (a.value === null || b.value === null) return a.value === null && b.value === null
  // Small tolerance for decimal.js's iterative sqrt vs. the algebraically
  // exact k-cancellation — see module doc comment on population stddev.
  return Math.abs(a.value - b.value) <= 1
}

// ─── 1 & 2. Sharpe / Sortino ──────────────────────────────────────────────────

describe('getSharpeRatio', () => {
  it('insufficient with fewer than 10 trading days', () => {
    const rows = Array.from({ length: 9 }, (_, i) => dayTrade(i, 100))
    const r = getSharpeRatio(rows, 1_000_000, UTC)
    expect(r.sufficient).toBe(false)
    expect(r.value).toBeNull()
  })

  it('single trading day is insufficient regardless of trade count', () => {
    const rows = [dayTrade(0, 500), dayTrade(0, -200), dayTrade(0, 300)]
    const r = getSharpeRatio(rows, 1_000_000, UTC)
    expect(r.sufficient).toBe(false)
    expect(r.value).toBeNull()
  })

  it('becomes sufficient at exactly 10 trading days', () => {
    const rows = Array.from({ length: 10 }, (_, i) => dayTrade(i, i % 2 === 0 ? 100 : -50))
    expect(getSharpeRatio(rows, 1_000_000, UTC).sufficient).toBe(true)
  })

  it('exact Sharpe from two known daily returns (hand-computed)', () => {
    // startingBalanceCents = 1,000,000. Five days at +50,000 (return 0.05),
    // five days at -30,000 (return -0.03).
    //   mean = (5*0.05 + 5*-0.03) / 10 = 0.01
    //   population stdDev = sqrt(mean((r-mean)^2)) = 0.04 (exact)
    //   Sharpe = (0.01/0.04) * sqrt(252) = 0.25 * sqrt(252) = 3.968626...
    //   *100 rounded = 397
    const rows: AdvancedMetricsTradeInput[] = []
    for (let i = 0; i < 10; i++) {
      rows.push(dayTrade(i, i % 2 === 0 ? 50_000 : -30_000))
    }
    const r = getSharpeRatio(rows, 1_000_000, UTC)
    expect(r.sufficient).toBe(true)
    expect(r.value).toBe(397)
  })

  it('null when starting balance is zero or negative', () => {
    const rows = Array.from({ length: 10 }, (_, i) => dayTrade(i, 100))
    expect(getSharpeRatio(rows, 0, UTC)).toEqual({ value: null, sufficient: false })
    expect(getSharpeRatio(rows, -100, UTC)).toEqual({ value: null, sufficient: false })
  })

  it('sufficient but null when daily returns have zero variance', () => {
    const rows = Array.from({ length: 10 }, (_, i) => dayTrade(i, 1_000))
    const r = getSharpeRatio(rows, 1_000_000, UTC)
    expect(r.sufficient).toBe(true)
    expect(r.value).toBeNull()
  })
})

describe('getSortinoRatio', () => {
  it('exact Sortino from the same two-return fixture as Sharpe (hand-computed)', () => {
    // Downside deviation vs 0 target over the five -0.03 days only:
    //   sqrt(mean((-0.03)^2)) = 0.03 (exact, all five identical)
    //   Sortino = (0.01/0.03) * sqrt(252) = (1/3) * 15.874507866... = 5.291502...
    //   *100 rounded = 529
    const rows: AdvancedMetricsTradeInput[] = []
    for (let i = 0; i < 10; i++) {
      rows.push(dayTrade(i, i % 2 === 0 ? 50_000 : -30_000))
    }
    const r = getSortinoRatio(rows, 1_000_000, UTC)
    expect(r.sufficient).toBe(true)
    expect(r.value).toBe(529)
  })

  it('null when there are no negative days (still sufficient)', () => {
    const rows = Array.from({ length: 10 }, (_, i) => dayTrade(i, 100 + i))
    const r = getSortinoRatio(rows, 1_000_000, UTC)
    expect(r.sufficient).toBe(true)
    expect(r.value).toBeNull()
  })

  it('insufficient with fewer than 10 trading days', () => {
    const rows = Array.from({ length: 5 }, (_, i) => dayTrade(i, i % 2 === 0 ? 100 : -100))
    expect(getSortinoRatio(rows, 1_000_000, UTC).sufficient).toBe(false)
  })
})

// ─── 3 & 4. Max drawdown / recovery factor ───────────────────────────────────

describe('getMaxDrawdown', () => {
  it('insufficient with no closed trades', () => {
    expect(getMaxDrawdown([], 10_000)).toEqual({ value: null, sufficient: false })
  })

  it('zero drawdown when cumulative P&L never falls from its peak', () => {
    const rows = [tradeAt(0, 100), tradeAt(1, 50), tradeAt(2, 200)]
    const r = getMaxDrawdown(rows, 10_000)
    expect(r.sufficient).toBe(true)
    expect(r.value).toEqual({ peakToTroughCents: 0, pctOfPeakBps: 0, durationDays: 0 })
  })

  it('hand-computed peak-to-trough, % of peak, and duration', () => {
    // cum: 100, 150, 70, 30, 230 -> peak 150 (day1) -> trough 30 (day3)
    // dd = 150 - 30 = 120. base = startingBalance(10000) + peak(150) = 10150.
    // pctOfPeakBps = round(120/10150 * 10000) = 118. duration = day3-day1 = 2 days.
    const rows = [
      tradeAt(0, 100),
      tradeAt(1, 50),
      tradeAt(2, -80),
      tradeAt(3, -40),
      tradeAt(4, 200),
    ]
    const r = getMaxDrawdown(rows, 10_000)
    expect(r.sufficient).toBe(true)
    expect(r.value).toEqual({ peakToTroughCents: 120, pctOfPeakBps: 118, durationDays: 2 })
  })

  it('a drawdown starting from the very first trade is still measured', () => {
    // No trade ever goes positive: peak stays at the implicit 0 baseline.
    const rows = [tradeAt(0, -50), tradeAt(1, -30)]
    const r = getMaxDrawdown(rows, 10_000)
    expect(r.value?.peakToTroughCents).toBe(80)
  })

  it('is order-independent of input array order (sorts by exitTime internally)', () => {
    const a = tradeAt(0, 100)
    const b = tradeAt(1, -80)
    const c = tradeAt(2, 50)
    expect(getMaxDrawdown([c, a, b], 10_000)).toEqual(getMaxDrawdown([a, b, c], 10_000))
  })
})

describe('getRecoveryFactor', () => {
  it('hand-computed: net profit 230 / max drawdown 120 = 1.9166... -> 192', () => {
    const rows = [
      tradeAt(0, 100),
      tradeAt(1, 50),
      tradeAt(2, -80),
      tradeAt(3, -40),
      tradeAt(4, 200),
    ]
    const dd = getMaxDrawdown(rows, 10_000)
    const r = getRecoveryFactor(rows, dd)
    expect(r.sufficient).toBe(true)
    expect(r.value).toBe(192)
  })

  it('null when max drawdown is zero (all gains, nothing to recover from)', () => {
    const rows = [tradeAt(0, 100), tradeAt(1, 50)]
    const dd = getMaxDrawdown(rows, 10_000)
    const r = getRecoveryFactor(rows, dd)
    expect(dd.value?.peakToTroughCents).toBe(0)
    expect(r).toEqual({ value: null, sufficient: true })
  })

  it('insufficient when the underlying drawdown is insufficient', () => {
    const r = getRecoveryFactor([], { value: null, sufficient: false })
    expect(r).toEqual({ value: null, sufficient: false })
  })
})

// ─── 5. Kelly % ────────────────────────────────────────────────────────────────

describe('getKellyPct', () => {
  it('null when there are no losses', () => {
    const rows = [row({ pnlCents: 100 }), row({ pnlCents: 200 })]
    expect(getKellyPct(rows)).toEqual({ value: null, sufficient: false })
  })

  it('null when there are no wins', () => {
    const rows = [row({ pnlCents: -100 }), row({ pnlCents: -200 })]
    expect(getKellyPct(rows)).toEqual({ value: null, sufficient: false })
  })

  it('hand-computed: 3 wins @200, 2 losses @100 -> Kelly 40%', () => {
    // winRate=0.6, avgWin=200, avgLoss=100, payoff=2
    // kelly = 0.6 - 0.4/2 = 0.4 -> 4000 bps
    const rows = [
      row({ pnlCents: 200 }),
      row({ pnlCents: 200 }),
      row({ pnlCents: 200 }),
      row({ pnlCents: -100 }),
      row({ pnlCents: -100 }),
    ]
    expect(getKellyPct(rows)).toEqual({ value: 4000, sufficient: true })
  })

  it('break-even trades are excluded from the win/loss counts', () => {
    const withBreakEven = [
      row({ pnlCents: 200 }),
      row({ pnlCents: 200 }),
      row({ pnlCents: 200 }),
      row({ pnlCents: -100 }),
      row({ pnlCents: -100 }),
      row({ pnlCents: 0 }),
      row({ pnlCents: 0 }),
    ]
    const withoutBreakEven = [
      row({ pnlCents: 200 }),
      row({ pnlCents: 200 }),
      row({ pnlCents: 200 }),
      row({ pnlCents: -100 }),
      row({ pnlCents: -100 }),
    ]
    expect(getKellyPct(withBreakEven)).toEqual(getKellyPct(withoutBreakEven))
  })

  it('clamps extreme negative Kelly to -100%', () => {
    // 1 win of 1 cent, 9 losses of 1000 cents: kelly = 0.1 - 900 = -899.9 -> clamp -10000
    const rows = [
      row({ pnlCents: 1 }),
      ...Array.from({ length: 9 }, () => row({ pnlCents: -1000 })),
    ]
    expect(getKellyPct(rows)).toEqual({ value: -10_000, sufficient: true })
  })
})

// ─── 6. SQN ────────────────────────────────────────────────────────────────────

describe('getSqn', () => {
  it('insufficient with fewer than 10 rated trades', () => {
    const rows = Array.from({ length: 9 }, () => row({ pnlR: 100 }))
    expect(getSqn(rows)).toEqual({ value: null, sufficient: false })
  })

  it('sufficient but null when all R outcomes are equal (zero stddev)', () => {
    const rows = Array.from({ length: 10 }, () => row({ pnlR: 150 }))
    const r = getSqn(rows)
    expect(r.sufficient).toBe(true)
    expect(r.value).toBeNull()
  })

  it('hand-computed: 5 trades @2R, 5 trades @-1R -> SQN 1.05', () => {
    // mean = 50, population stdDev = 150 (exact), n=10
    // SQN = sqrt(10) * 50/150 = sqrt(10)/3 = 1.054092... -> *100 = 105
    const rows = [
      ...Array.from({ length: 5 }, () => row({ pnlR: 200 })),
      ...Array.from({ length: 5 }, () => row({ pnlR: -100 })),
    ]
    const r = getSqn(rows)
    expect(r.sufficient).toBe(true)
    expect(r.value).toBe(105)
  })

  it('ignores trades with a null pnlR when counting the sample', () => {
    const rows = [
      ...Array.from({ length: 10 }, () => row({ pnlR: 100 })),
      ...Array.from({ length: 5 }, () => row({ pnlR: null })),
    ]
    // Still degenerate (all rated values equal 100) — sufficient, null value.
    const r = getSqn(rows)
    expect(r.sufficient).toBe(true)
    expect(r.value).toBeNull()
  })
})

// ─── 7. Day consistency ────────────────────────────────────────────────────────

describe('getDayConsistency', () => {
  it('null when there is no gross profit', () => {
    expect(getDayConsistency([], UTC)).toEqual({ value: null, sufficient: false })
    const allLosses = [dayTrade(0, -100), dayTrade(1, -200)]
    expect(getDayConsistency(allLosses, UTC)).toEqual({ value: null, sufficient: false })
  })

  it('a single profitable day is sufficient — unlike Sharpe — but reads as 0% consistent', () => {
    // 100% of the (only) gross profit is concentrated in the one day it has.
    const r = getDayConsistency([dayTrade(0, 500)], UTC)
    expect(r).toEqual({ value: 0, sufficient: true })
  })

  it('hand-computed: profitable days 100/300/100 (loss day ignored) -> 40% consistency', () => {
    // grossProfit = 100+300+100 = 500, largest = 300
    // consistency = 1 - 300/500 = 0.4 -> 4000 bps
    const rows = [dayTrade(0, 100), dayTrade(1, -500), dayTrade(2, 300), dayTrade(3, 100)]
    expect(getDayConsistency(rows, UTC)).toEqual({ value: 4000, sufficient: true })
  })
})

// ─── 8. Extremes & shape ──────────────────────────────────────────────────────

describe('getExtremes', () => {
  it('null for whichever side has no trades', () => {
    const onlyWins = [row({ pnlCents: 100, pnlR: 10 })]
    expect(getExtremes(onlyWins).largestLoss).toEqual({ value: null, sufficient: false })
    const onlyLosses = [row({ pnlCents: -100, pnlR: -10 })]
    expect(getExtremes(onlyLosses).largestWin).toEqual({ value: null, sufficient: false })
  })

  it('hand-computed: picks the largest-magnitude win and loss with their R', () => {
    const rows = [
      row({ pnlCents: 500, pnlR: 50 }),
      row({ pnlCents: -300, pnlR: -30 }),
      row({ pnlCents: 1200, pnlR: 120 }),
      row({ pnlCents: -900, pnlR: -90 }),
      row({ pnlCents: 100, pnlR: 10 }),
    ]
    const { largestWin, largestLoss } = getExtremes(rows)
    expect(largestWin).toEqual({ value: { cents: 1200, r: 120 }, sufficient: true })
    expect(largestLoss).toEqual({ value: { cents: -900, r: -90 }, sufficient: true })
  })
})

describe('getStdDevR', () => {
  it('insufficient with fewer than 2 rated trades', () => {
    expect(getStdDevR([row({ pnlR: 100 })])).toEqual({ value: null, sufficient: false })
    expect(getStdDevR([])).toEqual({ value: null, sufficient: false })
  })

  it('hand-computed: R values 0 and 100 -> population stdDev 50', () => {
    const r = getStdDevR([row({ pnlR: 0 }), row({ pnlR: 100 })])
    expect(r).toEqual({ value: 50, sufficient: true })
  })
})

describe('getAvgHoldMinutes', () => {
  it('hand-computed: winners [10,20,30] -> 20, losers [100,200] -> 150', () => {
    const rows = [
      row({ pnlCents: 100, durationMinutes: 10 }),
      row({ pnlCents: 100, durationMinutes: 20 }),
      row({ pnlCents: 100, durationMinutes: 30 }),
      row({ pnlCents: -100, durationMinutes: 100 }),
      row({ pnlCents: -100, durationMinutes: 200 }),
    ]
    const { winners, losers } = getAvgHoldMinutes(rows)
    expect(winners).toEqual({ value: 20, sufficient: true })
    expect(losers).toEqual({ value: 150, sufficient: true })
  })

  it('insufficient independently for whichever side has no duration data', () => {
    const onlyWinners = [row({ pnlCents: 100, durationMinutes: 15 })]
    const { winners, losers } = getAvgHoldMinutes(onlyWinners)
    expect(winners.sufficient).toBe(true)
    expect(losers).toEqual({ value: null, sufficient: false })
  })

  it('excludes rows with a missing duration', () => {
    const rows = [
      row({ pnlCents: 100, durationMinutes: 10 }),
      row({ pnlCents: 100, durationMinutes: null }),
    ]
    expect(getAvgHoldMinutes(rows).winners).toEqual({ value: 10, sufficient: true })
  })
})

// ─── Aggregator ────────────────────────────────────────────────────────────────

describe('computeAdvancedMetrics', () => {
  it('wires every sub-metric onto the correct field', () => {
    const rows = [
      tradeAt(0, 100),
      tradeAt(1, 50),
      tradeAt(2, -80),
      tradeAt(3, -40),
      tradeAt(4, 200),
    ]
    const full = computeAdvancedMetrics(rows, 10_000, UTC)
    const dd = getMaxDrawdown(rows, 10_000)

    expect(full.maxDrawdown).toEqual(dd)
    expect(full.recoveryFactorX100).toEqual(getRecoveryFactor(rows, dd))
    expect(full.kellyPctBps).toEqual(getKellyPct(rows))
    expect(full.sqnX100).toEqual(getSqn(rows))
    expect(full.dayConsistencyBps).toEqual(getDayConsistency(rows, UTC))
    expect(full.largestWin).toEqual(getExtremes(rows).largestWin)
    expect(full.largestLoss).toEqual(getExtremes(rows).largestLoss)
    expect(full.stddevRX100).toEqual(getStdDevR(rows))
    expect(full.avgHoldMinutesWinners).toEqual(getAvgHoldMinutes(rows).winners)
    expect(full.avgHoldMinutesLosers).toEqual(getAvgHoldMinutes(rows).losers)
  })

  it('returns a fully insufficient/null shape for an empty account', () => {
    const full = computeAdvancedMetrics([], 1_000_000, UTC)
    expect(full.sharpeRatioX100).toEqual({ value: null, sufficient: false })
    expect(full.sortinoRatioX100).toEqual({ value: null, sufficient: false })
    expect(full.maxDrawdown).toEqual({ value: null, sufficient: false })
    expect(full.recoveryFactorX100).toEqual({ value: null, sufficient: false })
    expect(full.kellyPctBps).toEqual({ value: null, sufficient: false })
    expect(full.sqnX100).toEqual({ value: null, sufficient: false })
    expect(full.dayConsistencyBps).toEqual({ value: null, sufficient: false })
    expect(full.largestWin).toEqual({ value: null, sufficient: false })
    expect(full.largestLoss).toEqual({ value: null, sufficient: false })
    expect(full.stddevRX100).toEqual({ value: null, sufficient: false })
    expect(full.avgHoldMinutesWinners).toEqual({ value: null, sufficient: false })
    expect(full.avgHoldMinutesLosers).toEqual({ value: null, sufficient: false })
  })
})

// ─── Fast-check properties ─────────────────────────────────────────────────────

describe('advanced-metrics — properties', () => {
  it('property: max drawdown is non-negative and bounded by gross P&L magnitude', () => {
    // dd_j = peak_j - cum_j. peak_j <= grossProfit (a running max of a prefix
    // of the positive contributions) and cum_j >= -grossLossAbs (a prefix sum
    // bounded below by the total negative contribution), so
    // dd_j <= grossProfit + grossLossAbs always — a provable, universal bound.
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -2000, max: 2000 }), { maxLength: 40 }), (pnls) => {
        const rows = pnls.map((v, i) => tradeAt(i, v))
        const dd = getMaxDrawdown(rows, 1_000_000)
        if (!dd.sufficient || dd.value === null) return pnls.length === 0

        const grossProfit = pnls.filter((v) => v > 0).reduce((a, b) => a + b, 0)
        const grossLossAbs = pnls.filter((v) => v < 0).reduce((a, b) => a - b, 0)
        return (
          dd.value.peakToTroughCents >= 0 &&
          dd.value.peakToTroughCents <= grossProfit + grossLossAbs
        )
      }),
      { numRuns: 500 },
    )
  })

  it('property: scaling all P&L by k>0 scales max-drawdown cents linearly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -2000, max: 2000 }), { maxLength: 40 }),
        fc.integer({ min: 1, max: 9 }),
        (pnls, k) => {
          const base = getMaxDrawdown(
            pnls.map((v, i) => tradeAt(i, v)),
            1_000_000,
          )
          const scaled = getMaxDrawdown(
            pnls.map((v, i) => tradeAt(i, v * k)),
            1_000_000,
          )
          if (base.value === null || scaled.value === null) return pnls.length === 0
          return scaled.value.peakToTroughCents === base.value.peakToTroughCents * k
        },
      ),
      { numRuns: 500 },
    )
  })

  it('property: Kelly % always stays within the [-100%, 100%] clamp', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -5000, max: 5000 }), { maxLength: 40 }), (pnls) => {
        const rows = pnls.map((v) => row({ pnlCents: v }))
        const kelly = getKellyPct(rows)
        return kelly.value === null || (kelly.value >= -10_000 && kelly.value <= 10_000)
      }),
      { numRuns: 500 },
    )
  })

  it('property: scaling all P&L by k>0 leaves Sharpe/Sortino/SQN/day-consistency invariant', () => {
    fc.assert(
      fc.property(
        // Exactly 15 distinct trading days (one trade each) so Sharpe/Sortino
        // (needs 10+ days) and SQN (needs 10+ trades) are structurally able to
        // be "sufficient" regardless of which random values land — whether
        // they end up sufficient is then purely a function of the values,
        // which is identical on both sides of the scale by construction.
        fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 15, maxLength: 15 }),
        fc.integer({ min: 1, max: 9 }),
        (values, k) => {
          const base = values.map((v, i) => dayTrade(i, v, v))
          const scaled = values.map((v, i) => dayTrade(i, v * k, v * k))

          return (
            invariantResult(
              getSharpeRatio(base, 1_000_000, UTC),
              getSharpeRatio(scaled, 1_000_000, UTC),
            ) &&
            invariantResult(
              getSortinoRatio(base, 1_000_000, UTC),
              getSortinoRatio(scaled, 1_000_000, UTC),
            ) &&
            invariantResult(getSqn(base), getSqn(scaled)) &&
            invariantResult(getDayConsistency(base, UTC), getDayConsistency(scaled, UTC))
          )
        },
      ),
      { numRuns: 300 },
    )
  })
})
