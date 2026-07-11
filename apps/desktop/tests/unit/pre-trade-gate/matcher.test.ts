// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { matchFillToPlan } from '../../../electron/services/pre-trade-gate/matcher'
import type { PendingPlan } from '../../../electron/services/pre-trade-gate/matcher'

// Prices are ticks = round(price × 10^(pipDecimal+1)); 10 ticks = 1 pip.
const ENTRY = 10_850 // 1.0850 on a 4-decimal pair

function plan(overrides: Partial<PendingPlan> & Pick<PendingPlan, 'id'>): PendingPlan {
  return {
    direction: 'long',
    breachAck: 0,
    intendedEntry: ENTRY,
    createdAt: 1000,
    expiresAt: 1000 + 300_000,
    ...overrides,
  }
}

describe('matchFillToPlan', () => {
  const fill = { direction: 'long', entryPriceTicks: ENTRY, eventTimeMs: 2000 }

  it('matches a compliant plan within tolerance → clean', () => {
    const m = matchFillToPlan(fill, [plan({ id: 'p1' })], 5)
    expect(m).toEqual({ plan: expect.objectContaining({ id: 'p1' }), outcome: 'clean' })
  })

  it('matches within the price tolerance band (5 pips = 50 ticks)', () => {
    const m = matchFillToPlan({ ...fill, entryPriceTicks: ENTRY + 50 }, [plan({ id: 'p1' })], 5)
    expect(m?.outcome).toBe('clean')
  })

  it('rejects a compliant plan when entry drift exceeds tolerance', () => {
    const m = matchFillToPlan({ ...fill, entryPriceTicks: ENTRY + 60 }, [plan({ id: 'p1' })], 5)
    expect(m).toBeNull()
  })

  it('does not match an expired plan', () => {
    const m = matchFillToPlan({ ...fill, eventTimeMs: 999_999_999 }, [plan({ id: 'p1' })], 5)
    expect(m).toBeNull()
  })

  it('does not match a plan of the opposite direction', () => {
    const m = matchFillToPlan(fill, [plan({ id: 'p1', direction: 'short' })], 5)
    expect(m).toBeNull()
  })

  it('matches an acknowledged-breach intent (no level check) → breach_ack', () => {
    const m = matchFillToPlan(fill, [plan({ id: 'b1', breachAck: 1, intendedEntry: null })], 5)
    expect(m).toEqual({ plan: expect.objectContaining({ id: 'b1' }), outcome: 'breach_ack' })
  })

  it('prefers a compliant plan over an acknowledged-breach intent', () => {
    const m = matchFillToPlan(
      fill,
      [plan({ id: 'b1', breachAck: 1, intendedEntry: null }), plan({ id: 'p1' })],
      5,
    )
    expect(m?.outcome).toBe('clean')
    expect(m?.plan.id).toBe('p1')
  })

  it('prefers the newest matching compliant plan', () => {
    const m = matchFillToPlan(
      fill,
      [plan({ id: 'old', createdAt: 1000 }), plan({ id: 'new', createdAt: 1500 })],
      5,
    )
    expect(m?.plan.id).toBe('new')
  })

  it('returns null when there are no plans', () => {
    expect(matchFillToPlan(fill, [], 5)).toBeNull()
  })
})
