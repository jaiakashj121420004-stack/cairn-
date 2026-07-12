// @vitest-environment node
//
// Contract-spec derivation tests (multi-asset M2). Money-adjacent, so alongside
// known-instrument checks there is a property test pinning the exact formula.
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { STORED_UNITS_PER_PIP, derivePipValueFromTick } from '../../electron/services/pricing'

describe('derivePipValueFromTick', () => {
  it('matches known instrument contract specs exactly', () => {
    // EURUSD (pipDecimal 4): tick 0.0001 = 10 stored units, $10/tick → 1000c ($10/pip)
    expect(derivePipValueFromTick(10, 1000)).toBe(1000)
    // 5-digit EURUSD: tick 0.00001 = 1 stored unit, $1/tick → 1000c
    expect(derivePipValueFromTick(1, 100)).toBe(1000)
    // ES future (pipDecimal 2): tick 0.25 = 250 stored units, $12.50/tick → 50c per 0.01
    // point ⇒ 100 × $0.50 = $50/point
    expect(derivePipValueFromTick(250, 1250)).toBe(50)
  })

  it('returns 0 for a non-positive tick size (guards divide-by-zero)', () => {
    expect(derivePipValueFromTick(0, 1000)).toBe(0)
    expect(derivePipValueFromTick(-5, 1000)).toBe(0)
  })

  it('property: equals round-half-up(tickValueCents × 10 / tickSizeStored) for all positive inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 10_000_000 }),
        (tickSizeStored, tickValueCents) => {
          // Exact integer oracle for round-half-up of a/b (a,b > 0):
          //   floor((2a + b) / 2b), computed without any float division.
          const a = tickValueCents * STORED_UNITS_PER_PIP
          const num = 2 * a + tickSizeStored
          const den = 2 * tickSizeStored
          const expected = (num - (num % den)) / den
          expect(derivePipValueFromTick(tickSizeStored, tickValueCents)).toBe(expected)
        },
      ),
    )
  })
})
