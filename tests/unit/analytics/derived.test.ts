// @vitest-environment node
//
// Unit + property-based tests for electron/services/analytics/derived.ts
//
// All five pure functions are tested:
//   1. getTimeOfDayHeatmap
//   2. getDowSummary
//   3. getExpectancyWithSpark
//   4. getProfitFactorR          ← fast-check property: scale-invariant
//   5. getRDistributionPure
//
// Plus getExpectancyWithSpark's fast-check property:
//   if all R outcomes equal x, expectancyR === x regardless of count.

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  getTimeOfDayHeatmap,
  getDowSummary,
  getExpectancyWithSpark,
  getProfitFactorR,
  getRDistributionPure,
  type TradeRowForDerived,
} from '../../../electron/services/analytics/derived'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function row(
  pnlR: number | null,
  pnlCents = 0,
  exitTime: number | null = Date.UTC(2024, 0, 15, 10, 0, 0), // Mon 10:00 UTC
): TradeRowForDerived {
  return { pnlR, pnlCents, exitTime }
}

/** Build a UTC timestamp for a specific weekday/hour in 2024. */
function tsAt(isoDate: string, hourUtc: number): number {
  return new Date(`${isoDate}T${String(hourUtc).padStart(2, '0')}:00:00Z`).getTime()
}

const UTC = 'UTC'

// ─── 1. getTimeOfDayHeatmap ───────────────────────────────────────────────────

describe('getTimeOfDayHeatmap', () => {
  it('returns empty array for no input', () => {
    expect(getTimeOfDayHeatmap([], UTC)).toEqual([])
  })

  it('skips rows with null exitTime or null pnlR', () => {
    const rows = [row(100, 0, null), row(null, 0, tsAt('2024-01-15', 10))]
    expect(getTimeOfDayHeatmap(rows, UTC)).toEqual([])
  })

  it('groups correctly by dow and hour in UTC', () => {
    // 2024-01-15 is a Monday (dow=1), 10:00 UTC
    const cells = getTimeOfDayHeatmap(
      [row(200, 0, tsAt('2024-01-15', 10)), row(100, 0, tsAt('2024-01-15', 10))],
      UTC,
    )
    expect(cells).toHaveLength(1)
    expect(cells[0].dow).toBe(1)        // Monday
    expect(cells[0].hour).toBe(10)
    expect(cells[0].n).toBe(2)
    // expectancyR = (200 + 100) / 2 = 150, rounded
    expect(cells[0].expectancyR).toBe(150)
  })

  it('produces distinct cells for different hours', () => {
    const rows = [
      row(100, 0, tsAt('2024-01-15', 9)),   // Mon 09:00
      row(200, 0, tsAt('2024-01-15', 14)),  // Mon 14:00
    ]
    const cells = getTimeOfDayHeatmap(rows, UTC)
    expect(cells).toHaveLength(2)
    const hours = cells.map((c) => c.hour).sort((a, b) => a - b)
    expect(hours).toEqual([9, 14])
  })
})

// ─── 2. getDowSummary ─────────────────────────────────────────────────────────

describe('getDowSummary', () => {
  it('returns empty array for no input', () => {
    expect(getDowSummary([], UTC)).toEqual([])
  })

  it('skips rows with null exitTime', () => {
    expect(getDowSummary([row(100, 0, null)], UTC)).toEqual([])
  })

  it('aggregates P&L and win rate per day', () => {
    // Both trades on Monday (2024-01-15)
    const rows = [
      row(200, 500, tsAt('2024-01-15', 10)),
      row(-100, -300, tsAt('2024-01-15', 14)),
    ]
    const result = getDowSummary(rows, UTC)
    expect(result).toHaveLength(1)
    const mon = result[0]
    expect(mon.dow).toBe(1)
    expect(mon.n).toBe(2)
    expect(mon.netPnlCents).toBe(200)                     // 500 + (−300)
    expect(mon.winRateBps).toBe(5000)                     // 1/2 = 50%
    // expectancyR = (200 + (−100)) / 2 = 50
    expect(mon.expectancyR).toBe(50)
  })

  it('sorts ascending by dow', () => {
    const rows = [
      row(100, 0, tsAt('2024-01-19', 10)), // Fri = 5
      row(100, 0, tsAt('2024-01-15', 10)), // Mon = 1
    ]
    const result = getDowSummary(rows, UTC)
    expect(result.map((r) => r.dow)).toEqual([1, 5])
  })
})

// ─── 3. getExpectancyWithSpark ────────────────────────────────────────────────

describe('getExpectancyWithSpark', () => {
  it('returns zeros and empty spark for empty input', () => {
    const result = getExpectancyWithSpark([])
    expect(result.expectancyR).toBe(0)
    expect(result.spark).toEqual([])
  })

  it('returns zeros for rows where pnlR is null', () => {
    const result = getExpectancyWithSpark([row(null), row(null)])
    expect(result.expectancyR).toBe(0)
    expect(result.spark).toEqual([])
  })

  it('computes correct expectancy', () => {
    // 200 + 100 + (-50) = 250; / 3 ≈ 83.33 → 83
    const rows = [row(200), row(100), row(-50)]
    const { expectancyR } = getExpectancyWithSpark(rows)
    expect(expectancyR).toBe(83)
  })

  it('sparkline has same length as input when ≤20 trades', () => {
    const rows = Array.from({ length: 10 }, () => row(100))
    const { spark } = getExpectancyWithSpark(rows)
    expect(spark).toHaveLength(10)
  })

  it('sparkline capped at 20 entries for >20 trades', () => {
    const rows = Array.from({ length: 30 }, () => row(100))
    const { spark } = getExpectancyWithSpark(rows)
    expect(spark).toHaveLength(20)
  })

  // Fast-check property: if all R outcomes equal x, expectancyR === x
  it('property: constant outcomes → expectancyR equals that outcome', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -500, max: 500 }),
        fc.integer({ min: 1, max: 50 }),
        (x, count) => {
          const rows: TradeRowForDerived[] = Array.from({ length: count }, () => row(x))
          const { expectancyR } = getExpectancyWithSpark(rows)
          return expectancyR === x
        },
      ),
      { numRuns: 500 },
    )
  })
})

// ─── 4. getProfitFactorR ──────────────────────────────────────────────────────

describe('getProfitFactorR', () => {
  it('returns infinite when no losing trades and wins exist', () => {
    const result = getProfitFactorR([row(100), row(200)])
    expect(result.infinite).toBe(true)
    expect(result.valueTimes100).toBe(0)
  })

  it('returns non-infinite zero when no trades at all', () => {
    const result = getProfitFactorR([])
    expect(result.infinite).toBe(false)
    expect(result.valueTimes100).toBe(0)
  })

  it('computes profit factor correctly', () => {
    // grossWin = 300, grossLoss = 100 → PF = 3.00
    const rows = [row(200), row(100), row(-100)]
    const result = getProfitFactorR(rows)
    expect(result.infinite).toBe(false)
    expect(result.valueTimes100).toBe(300)  // 3.00 × 100
    expect(result.grossWinR).toBe(300)
    expect(result.grossLossR).toBe(100)
  })

  it('profit factor < 1 when more loss than win', () => {
    const rows = [row(100), row(-200)]
    const result = getProfitFactorR(rows)
    expect(result.infinite).toBe(false)
    expect(result.valueTimes100).toBe(50)   // 0.50 × 100
  })

  // Fast-check property: scaling all R values by k > 0 → profit factor unchanged
  it('property: scale-invariant — multiplying all R by k leaves profit factor unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: -300, max: 300 }).filter((v) => v !== 0),
          { minLength: 2, maxLength: 20 },
        ),
        fc.integer({ min: 1, max: 10 }),
        (rValues, k) => {
          const base: TradeRowForDerived[] = rValues.map((v) => row(v))
          const scaled: TradeRowForDerived[] = rValues.map((v) => row(v * k))

          const pfBase = getProfitFactorR(base)
          const pfScaled = getProfitFactorR(scaled)

          // If both are infinite, they're equal
          if (pfBase.infinite && pfScaled.infinite) return true
          // If only one is infinite, skip (edge case with only wins)
          if (pfBase.infinite !== pfScaled.infinite) return true
          // Otherwise profit factor × 100 should be equal
          return pfBase.valueTimes100 === pfScaled.valueTimes100
        },
      ),
      { numRuns: 500 },
    )
  })
})

// ─── 5. getRDistributionPure ──────────────────────────────────────────────────

describe('getRDistributionPure', () => {
  it('returns empty for no input', () => {
    expect(getRDistributionPure([])).toEqual([])
  })

  it('buckets at 0.5R (50 hundredths)', () => {
    // pnlR: 75 → bucket [50,100); pnlR: 25 → bucket [0,50)
    const rows = [row(75), row(25), row(60)]
    const result = getRDistributionPure(rows)
    const low50 = result.find((b) => b.rLowHundredths === 50)
    const low0 = result.find((b) => b.rLowHundredths === 0)
    expect(low50?.count).toBe(2)  // 75, 60 both in [50,100)
    expect(low0?.count).toBe(1)   // 25 in [0,50)
  })

  it('negative values go into negative buckets', () => {
    const rows = [row(-75), row(-25)]
    const result = getRDistributionPure(rows)
    const negBucket = result.find((b) => b.rLowHundredths === -100)
    const negBucket2 = result.find((b) => b.rLowHundredths === -50)
    expect(negBucket?.count).toBe(1)  // -75 in [-100,-50)
    expect(negBucket2?.count).toBe(1) // -25 in [-50,0)
  })

  it('sorts ascending by bucket lower bound', () => {
    const rows = [row(100), row(-100), row(0)]
    const result = getRDistributionPure(rows)
    const lows = result.map((b) => b.rLowHundredths)
    expect(lows).toEqual([...lows].sort((a, b) => a - b))
  })

  it('rHighHundredths = rLowHundredths + 50', () => {
    const result = getRDistributionPure([row(100), row(-100)])
    for (const b of result) {
      expect(b.rHighHundredths).toBe(b.rLowHundredths + 50)
    }
  })
})
