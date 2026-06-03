// @vitest-environment node
//
// Unit + property tests for MAE/MFE auto-compute (roadmap Wave 3 item 7).

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { computeMaeMfe, type MaeMfeInput } from '../../electron/services/mae-mfe'
import type { PriceCandle } from '../../shared/types/index'

function candle(high: string, low: string, ts = 0): PriceCandle {
  return { ts, high, low }
}

// ─── Hand-computed fixtures ─────────────────────────────────────────────────

describe('computeMaeMfe — hand-computed long fixture', () => {
  // entry 1.08500, sl 1.08400 → risk_per_unit = 0.00100
  // candles (high, low):
  //   1.08600 / 1.08450 → adverse 0.00050  favourable 0.00100
  //   1.08700 / 1.08380 → adverse 0.00120  favourable 0.00200  (low pierces SL)
  //   1.08550 / 1.08500 → adverse 0.00000  favourable 0.00050
  // max adverse = 0.00120 → MAE = 1.20 R ;  max favourable = 0.00200 → MFE = 2.00 R
  const input: MaeMfeInput = {
    entryPrice: '1.08500',
    slPrice: '1.08400',
    direction: 'long',
    candles: [
      candle('1.08600', '1.08450'),
      candle('1.08700', '1.08380'),
      candle('1.08550', '1.08500'),
    ],
  }

  it('MAE = 120 (1.20R)', () => {
    expect(computeMaeMfe(input)?.maeR).toBe(120)
  })

  it('MFE = 200 (2.00R)', () => {
    expect(computeMaeMfe(input)?.mfeR).toBe(200)
  })

  it('max adverse price distance = "0.0012"', () => {
    expect(computeMaeMfe(input)?.maePriceDistance).toBe('0.0012')
  })

  it('max favourable price distance = "0.002"', () => {
    expect(computeMaeMfe(input)?.mfePriceDistance).toBe('0.002')
  })
})

describe('computeMaeMfe — hand-computed short fixture', () => {
  // entry 1.27300, sl 1.27400 → risk_per_unit = 0.00100
  //   1.27350 / 1.27200 → adverse 0.00050  favourable 0.00100
  //   1.27280 / 1.27100 → adverse 0.00000  favourable 0.00200
  // max adverse = 0.00050 → MAE = 0.50R ;  max favourable = 0.00200 → MFE = 2.00R
  const input: MaeMfeInput = {
    entryPrice: '1.27300',
    slPrice: '1.27400',
    direction: 'short',
    candles: [candle('1.27350', '1.27200'), candle('1.27280', '1.27100')],
  }

  it('MAE = 50 (0.50R)', () => {
    expect(computeMaeMfe(input)?.maeR).toBe(50)
  })

  it('MFE = 200 (2.00R)', () => {
    expect(computeMaeMfe(input)?.mfeR).toBe(200)
  })
})

// ─── Deterministic edge cases ───────────────────────────────────────────────

describe('computeMaeMfe — returns null (no guessing)', () => {
  const base: Omit<MaeMfeInput, 'candles'> = {
    entryPrice: '1.08500',
    slPrice: '1.08400',
    direction: 'long',
  }

  it('empty price series → null', () => {
    expect(computeMaeMfe({ ...base, candles: [] })).toBeNull()
  })

  it('zero risk (entry == sl) → null', () => {
    expect(
      computeMaeMfe({
        ...base,
        slPrice: '1.08500',
        candles: [candle('1.08600', '1.08400')],
      }),
    ).toBeNull()
  })

  it('non-finite entry price → null', () => {
    expect(
      computeMaeMfe({ ...base, entryPrice: 'NaN', candles: [candle('1.086', '1.084')] }),
    ).toBeNull()
  })

  it('malformed candle value → null (whole series untrusted)', () => {
    expect(computeMaeMfe({ ...base, candles: [candle('1.086', 'abc')] })).toBeNull()
  })

  it('empty-string price → null', () => {
    expect(computeMaeMfe({ ...base, slPrice: '', candles: [candle('1.086', '1.084')] })).toBeNull()
  })
})

describe('computeMaeMfe — zero excursion is computed, not null', () => {
  it('single candle exactly at entry → MAE 0, MFE 0 (a series WAS present)', () => {
    const r = computeMaeMfe({
      entryPrice: '1.08500',
      slPrice: '1.08400',
      direction: 'long',
      candles: [candle('1.08500', '1.08500')],
    })
    expect(r).not.toBeNull()
    expect(r?.maeR).toBe(0)
    expect(r?.mfeR).toBe(0)
    expect(r?.maePriceDistance).toBe('0')
    expect(r?.mfePriceDistance).toBe('0')
  })
})

// ─── Property-based tests ───────────────────────────────────────────────────

/** Price in 1e-5 ticks → 5-dp decimal string. */
function ticksToStr(ticks: number): string {
  return (ticks / 100_000).toFixed(5)
}

const directionArb = fc.constantFrom<'long' | 'short'>('long', 'short')

describe('computeMaeMfe — properties', () => {
  it('MAE ≥ 0 and MFE ≥ 0 for any valid series (R and price distance)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100_000, max: 200_000 }), // entry ticks
        fc.integer({ min: 1, max: 50_000 }), // |risk| ticks (non-zero)
        fc.boolean(), // sl above or below entry
        directionArb,
        fc.array(
          fc.record({
            low: fc.integer({ min: 80_000, max: 220_000 }),
            span: fc.integer({ min: 0, max: 40_000 }), // high = low + span ≥ low
          }),
          { minLength: 1, maxLength: 30 },
        ),
        (entryTicks, riskTicks, slAbove, direction, rawCandles) => {
          const slTicks = slAbove ? entryTicks + riskTicks : entryTicks - riskTicks
          const candles = rawCandles.map((c) =>
            candle(ticksToStr(c.low + c.span), ticksToStr(c.low)),
          )
          const r = computeMaeMfe({
            entryPrice: ticksToStr(entryTicks),
            slPrice: ticksToStr(slTicks),
            direction,
            candles,
          })
          expect(r).not.toBeNull()
          if (!r) return
          expect(r.maeR).toBeGreaterThanOrEqual(0)
          expect(r.mfeR).toBeGreaterThanOrEqual(0)
          expect(parseFloat(r.maePriceDistance)).toBeGreaterThanOrEqual(0)
          expect(parseFloat(r.mfePriceDistance)).toBeGreaterThanOrEqual(0)
        },
      ),
    )
  })

  it('a stopped-out trade has MAE ≥ 1R (≥ 100)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 120_000, max: 200_000 }), // entry ticks
        fc.integer({ min: 1, max: 50_000 }), // risk ticks
        directionArb,
        fc.array(
          fc.record({
            low: fc.integer({ min: 80_000, max: 220_000 }),
            span: fc.integer({ min: 0, max: 40_000 }),
          }),
          { maxLength: 20 },
        ),
        (entryTicks, riskTicks, direction, otherRaw) => {
          // Place the stop one risk-distance from entry, then add a candle whose
          // extreme reaches the stop → adverse excursion ≥ risk → MAE ≥ 1R.
          const slTicks = direction === 'long' ? entryTicks - riskTicks : entryTicks + riskTicks

          const others = otherRaw.map((c) => candle(ticksToStr(c.low + c.span), ticksToStr(c.low)))
          const touchingCandle =
            direction === 'long'
              ? candle(ticksToStr(entryTicks), ticksToStr(slTicks)) // low touches SL
              : candle(ticksToStr(slTicks), ticksToStr(entryTicks)) // high touches SL

          const r = computeMaeMfe({
            entryPrice: ticksToStr(entryTicks),
            slPrice: ticksToStr(slTicks),
            direction,
            candles: [...others, touchingCandle],
          })
          expect(r).not.toBeNull()
          expect(r?.maeR).toBeGreaterThanOrEqual(100)
        },
      ),
    )
  })

  it('R is consistent with the price distance: maeR ≈ maeDistance/risk×100', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100_000, max: 200_000 }),
        fc.integer({ min: 1, max: 50_000 }),
        directionArb,
        fc.array(
          fc.record({
            low: fc.integer({ min: 80_000, max: 220_000 }),
            span: fc.integer({ min: 0, max: 40_000 }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (entryTicks, riskTicks, direction, rawCandles) => {
          const slTicks = direction === 'long' ? entryTicks - riskTicks : entryTicks + riskTicks
          const candles = rawCandles.map((c) =>
            candle(ticksToStr(c.low + c.span), ticksToStr(c.low)),
          )
          const r = computeMaeMfe({
            entryPrice: ticksToStr(entryTicks),
            slPrice: ticksToStr(slTicks),
            direction,
            candles,
          })
          expect(r).not.toBeNull()
          if (!r) return
          const riskPrice = riskTicks / 100_000
          const expectedMaeR = Math.round((parseFloat(r.maePriceDistance) / riskPrice) * 100)
          const expectedMfeR = Math.round((parseFloat(r.mfePriceDistance) / riskPrice) * 100)
          // Allow ±1 for half-up rounding boundary differences vs float recompute.
          expect(Math.abs(r.maeR - expectedMaeR)).toBeLessThanOrEqual(1)
          expect(Math.abs(r.mfeR - expectedMfeR)).toBeLessThanOrEqual(1)
        },
      ),
    )
  })
})
