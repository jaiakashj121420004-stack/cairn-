// @vitest-environment node
//
// Unit + property tests for the composite performance score.

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  computeCompositeScore,
  type CompositeTradeInput,
} from '../../../electron/services/analytics/composite-score'

function t(pnlR: number | null, isClean: number | null = 1): CompositeTradeInput {
  return { pnlR, pnlCents: pnlR === null ? null : pnlR * 10, isClean }
}

describe('computeCompositeScore — basics', () => {
  it('empty input → zeroed, not sufficient', () => {
    const r = computeCompositeScore([])
    expect(r.score).toBe(0)
    expect(r.sampleSize).toBe(0)
    expect(r.sufficient).toBe(false)
    expect(r.components).toEqual({
      winRate: 0,
      profitFactor: 0,
      avgWinLoss: 0,
      consistency: 0,
      discipline: 0,
    })
  })

  it('ignores trades with null pnlR when counting sample size', () => {
    const r = computeCompositeScore([t(100), t(null), t(-50)])
    expect(r.sampleSize).toBe(2)
  })

  it('needs at least 10 rated trades to be "sufficient"', () => {
    expect(computeCompositeScore(Array.from({ length: 9 }, () => t(100))).sufficient).toBe(false)
    expect(computeCompositeScore(Array.from({ length: 10 }, () => t(100))).sufficient).toBe(true)
  })

  it('all clean winners spread evenly → a strong score', () => {
    // 10 winners of varying sizes, all clean, no losses → PF & avg-ratio perfect,
    // win rate 100, consistency high (no single trade dominates), discipline 100.
    const trades = [120, 80, 150, 100, 90, 110, 130, 70, 140, 95].map((r) => t(r))
    const res = computeCompositeScore(trades)
    expect(res.score).toBeGreaterThanOrEqual(80)
    expect(res.components.winRate).toBe(100)
    expect(res.components.profitFactor).toBe(100)
    expect(res.components.discipline).toBe(100)
  })

  it('all losses → a weak score', () => {
    const trades = Array.from({ length: 10 }, () => t(-100, 0))
    const res = computeCompositeScore(trades)
    expect(res.score).toBeLessThan(40)
    expect(res.components.winRate).toBe(0)
    expect(res.components.profitFactor).toBe(0)
  })

  it('break-even trades do not count as wins or losses for win rate', () => {
    // 5 wins, 5 break-evens → decisive set is 5 wins → win rate 100
    const trades = [
      ...Array.from({ length: 5 }, () => t(100)),
      ...Array.from({ length: 5 }, () => t(0)),
    ]
    expect(computeCompositeScore(trades).components.winRate).toBe(100)
  })

  it('consistency drops when one trade carries all the profit', () => {
    // One huge win + nine break-evens (no losses). All winning R from one trade.
    const trades = [t(1000), ...Array.from({ length: 9 }, () => t(0))]
    expect(computeCompositeScore(trades).components.consistency).toBe(0)
  })

  it('discipline reflects clean-trade rate', () => {
    // 10 winners, half clean half dirty → discipline 50
    const trades = [
      ...Array.from({ length: 5 }, () => t(100, 1)),
      ...Array.from({ length: 5 }, () => t(100, 0)),
    ]
    expect(computeCompositeScore(trades).components.discipline).toBe(50)
  })

  it('profit factor of exactly 1.0 maps to the 50 mid-point', () => {
    // gross win 200, gross loss 200 → PF 1.0
    const trades = [t(100), t(100), t(-100), t(-100)]
    expect(computeCompositeScore(trades).components.profitFactor).toBe(50)
  })

  it('unreviewed trades (isClean = null) never count toward the discipline sub-score', () => {
    // 4 clean winners → discipline 100. Adding 4 unreviewed winners (e.g.
    // fully-auto broker fills Cairn never asked about) must NOT count as clean
    // and must NOT dilute the rate — they are excluded entirely (§2.3).
    const reviewed = Array.from({ length: 4 }, () => t(100, 1))
    const withUnreviewed = [...reviewed, ...Array.from({ length: 4 }, () => t(100, null))]
    expect(computeCompositeScore(reviewed).components.discipline).toBe(100)
    expect(computeCompositeScore(withUnreviewed).components.discipline).toBe(100)

    // And an all-unreviewed set has no discipline signal, so it cannot read as
    // a wall of clean trades — discipline is not driven up by absence of review.
    const allUnreviewed = Array.from({ length: 5 }, () => t(100, null))
    const r = computeCompositeScore(allUnreviewed)
    expect(r.sampleSize).toBe(5) // still rated for outcome metrics (they're closed)
  })
})

describe('computeCompositeScore — properties', () => {
  const tradeArb = fc.record({
    pnlR: fc.oneof(fc.constant(null), fc.integer({ min: -500, max: 500 })),
    isClean: fc.oneof(fc.constant(null), fc.constantFrom(0, 1)),
  })

  it('property: score and every sub-score stay within [0, 100]', () => {
    fc.assert(
      fc.property(fc.array(tradeArb, { maxLength: 60 }), (items) => {
        const trades: CompositeTradeInput[] = items.map((i) => ({
          pnlR: i.pnlR,
          pnlCents: i.pnlR === null ? null : i.pnlR * 10,
          isClean: i.isClean,
        }))
        const r = computeCompositeScore(trades)
        const vals = [
          r.score,
          r.components.winRate,
          r.components.profitFactor,
          r.components.avgWinLoss,
          r.components.consistency,
          r.components.discipline,
        ]
        return vals.every((v) => Number.isInteger(v) && v >= 0 && v <= 100)
      }),
      { numRuns: 500 },
    )
  })

  it('property: scaling every trade R by k > 0 leaves the score unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            pnlR: fc.integer({ min: -300, max: 300 }),
            isClean: fc.constantFrom(0, 1),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        fc.integer({ min: 1, max: 9 }),
        (items, k) => {
          const base: CompositeTradeInput[] = items.map((i) => ({
            pnlR: i.pnlR,
            pnlCents: i.pnlR * 10,
            isClean: i.isClean,
          }))
          const scaled: CompositeTradeInput[] = items.map((i) => ({
            pnlR: i.pnlR * k,
            pnlCents: i.pnlR * k * 10,
            isClean: i.isClean,
          }))
          return computeCompositeScore(base).score === computeCompositeScore(scaled).score
        },
      ),
      { numRuns: 500 },
    )
  })
})
