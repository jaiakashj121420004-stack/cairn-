import { describe, it, expect } from 'vitest'
import {
  INVALIDATION_CHIPS,
  INVALIDATION_MIN_CHARS,
} from '../../../src/features/pre-trade/constants/invalidation-chips'

describe('INVALIDATION_CHIPS', () => {
  it('contains exactly 8 chips', () => {
    expect(INVALIDATION_CHIPS).toHaveLength(8)
  })

  it('every chip label is ≥ INVALIDATION_MIN_CHARS characters (honesty gate)', () => {
    for (const chip of INVALIDATION_CHIPS) {
      expect(
        chip.label.length,
        `chip "${chip.id}" label is ${chip.label.length} chars — must be ≥ ${INVALIDATION_MIN_CHARS}`,
      ).toBeGreaterThanOrEqual(INVALIDATION_MIN_CHARS)
    }
  })

  it('all chip ids are unique', () => {
    const ids = INVALIDATION_CHIPS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all chip labels are unique (no duplicate text)', () => {
    const labels = INVALIDATION_CHIPS.map((c) => c.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('INVALIDATION_MIN_CHARS is 20', () => {
    expect(INVALIDATION_MIN_CHARS).toBe(20)
  })
})
