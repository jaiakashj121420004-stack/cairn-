// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { computeTradeGrade, countRulesBroken } from '../../electron/services/trade-grade'
import type { TradeGradeInput } from '../../electron/services/trade-grade'

// Perfect textbook trade: plan followed, no rules broken, R outcome met, not tilted
const base: TradeGradeInput = {
  followedPlanExactly: 1,
  rulesBrokenCount: 0,
  pnlR: 200, // R × 100
  rrRatio: 200, // planned R × 100
  preUrgencyScore: 3,
}

describe('computeTradeGrade', () => {
  it('returns null for an unclosed trade (pnlR is null)', () => {
    expect(computeTradeGrade({ ...base, pnlR: null })).toBeNull()
  })

  // ── Five grade branches ────────────────────────────────────────────────────

  it('A: perfect textbook winner (60+20+15 = 95)', () => {
    const g = computeTradeGrade(base)
    expect(g?.score).toBe(95)
    expect(g?.letter).toBe('A')
  })

  it('A: clean-on-tilt bonus pushes score to 100 when urgency ≥ 8', () => {
    // 60+20+15+5 = 100
    const g = computeTradeGrade({ ...base, preUrgencyScore: 8 })
    expect(g?.score).toBe(100)
    expect(g?.letter).toBe('A')
  })

  it('B: disciplined loss — plan followed, R not met (60+20 = 80)', () => {
    const g = computeTradeGrade({ ...base, pnlR: -100 })
    expect(g?.score).toBe(80)
    expect(g?.letter).toBe('B')
  })

  it('C: not followed, 1 rule broken, R met (60+0+15−5 = 70 → C)', () => {
    // 60 + 0 (plan not followed) + 15 (R met) - 5 (1 rule) = 70 → C (≥60 but <75)
    const g = computeTradeGrade({ ...base, followedPlanExactly: 0, rulesBrokenCount: 1 })
    expect(g?.score).toBe(70)
    expect(g?.letter).toBe('C')
  })

  it('C: plan followed but rulesBrokenCount > 0 loses the plan bonus (60+0+15−5 = 70 → C)', () => {
    // plan+clean bonus requires BOTH conditions; one rule broken forfeits it
    const g = computeTradeGrade({ ...base, rulesBrokenCount: 1 })
    expect(g?.score).toBe(70)
    expect(g?.letter).toBe('C')
  })

  it('C band: 60+0+15−15 = 60', () => {
    // not followed, 3 rules broken, R met: 60+0+15−15 = 60 → C
    const g = computeTradeGrade({ ...base, followedPlanExactly: 0, rulesBrokenCount: 3 })
    expect(g?.score).toBe(60)
    expect(g?.letter).toBe('C')
  })

  it('D: not followed, 3 rules broken, R not met (60+0+0−15 = 45)', () => {
    const g = computeTradeGrade({ ...base, followedPlanExactly: 0, rulesBrokenCount: 3, pnlR: -50 })
    expect(g?.score).toBe(45)
    expect(g?.letter).toBe('D')
  })

  it('F: 5 rules broken, R not met, not followed (60+0+0−25 = 35)', () => {
    const g = computeTradeGrade({
      followedPlanExactly: 0,
      rulesBrokenCount: 5,
      pnlR: -100,
      rrRatio: 200,
      preUrgencyScore: 3,
    })
    expect(g?.score).toBe(35)
    expect(g?.letter).toBe('F')
  })

  // ── Band boundary checks ───────────────────────────────────────────────────

  it('letter bands: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 45, F < 45', () => {
    // Score 70: not followed, 1 rule broken, R met → C (≥60 but <75)
    expect(
      computeTradeGrade({ ...base, rulesBrokenCount: 1, followedPlanExactly: 0 })?.letter,
    ).toBe('C') // 70
    // Score 80: disciplined loss (60+20) → B (≥75)
    expect(computeTradeGrade({ ...base, pnlR: -100 })?.letter).toBe('B') // 80
    // Score 95: perfect textbook → A (≥90)
    expect(computeTradeGrade(base)?.letter).toBe('A') // 95
    // Score exactly 45 → D
    expect(
      computeTradeGrade({ ...base, followedPlanExactly: 0, rulesBrokenCount: 3, pnlR: -50 })
        ?.letter,
    ).toBe('D') // 45
    // Score 40 → F (< 45)
    expect(
      computeTradeGrade({ ...base, followedPlanExactly: 0, rulesBrokenCount: 4, pnlR: -50 })
        ?.letter,
    ).toBe('F') // 60+0+0−20=40
  })

  // ── tilt bonus specifics ───────────────────────────────────────────────────

  it('clean-on-tilt bonus requires BOTH urgency ≥ 8 AND zero rules broken', () => {
    // urgency 8 but 1 rule broken → no bonus
    const withRules = computeTradeGrade({ ...base, preUrgencyScore: 9, rulesBrokenCount: 1 })
    // urgency 7 and clean → no bonus
    const notTilted = computeTradeGrade({ ...base, preUrgencyScore: 7, rulesBrokenCount: 0 })
    // urgency 8 and clean → bonus
    const tilted = computeTradeGrade({ ...base, preUrgencyScore: 8, rulesBrokenCount: 0 })

    expect((tilted?.score ?? 0) - (notTilted?.score ?? 0)).toBe(5)
    expect(withRules?.score).toBe(70) // 60+0+15−5
  })

  // ── Properties ────────────────────────────────────────────────────────────

  it('property: grade letter is always A–F for any closed trade', () => {
    fc.assert(
      fc.property(
        fc.record({
          followedPlanExactly: fc.constantFrom(0, 1, null),
          rulesBrokenCount: fc.integer({ min: 0, max: 20 }),
          pnlR: fc.integer({ min: -500, max: 500 }),
          rrRatio: fc.integer({ min: 50, max: 1000 }),
          preUrgencyScore: fc.integer({ min: 1, max: 10 }),
        }),
        (input) => {
          const g = computeTradeGrade(input)
          return g !== null && ['A', 'B', 'C', 'D', 'F'].includes(g.letter)
        },
      ),
      { numRuns: 500 },
    )
  })

  it('property: following the plan (with no rules broken) never lowers the score', () => {
    fc.assert(
      fc.property(
        fc.record({
          rulesBrokenCount: fc.constant(0),
          pnlR: fc.integer({ min: -300, max: 300 }),
          rrRatio: fc.integer({ min: 50, max: 500 }),
          preUrgencyScore: fc.integer({ min: 1, max: 10 }),
        }),
        (partial) => {
          const followed = computeTradeGrade({ ...partial, followedPlanExactly: 1 })?.score ?? 0
          const notFollowed = computeTradeGrade({ ...partial, followedPlanExactly: 0 })?.score ?? 0
          return followed >= notFollowed
        },
      ),
      { numRuns: 300 },
    )
  })
})

describe('countRulesBroken', () => {
  it('returns 0 for null or empty', () => {
    expect(countRulesBroken(null)).toBe(0)
    expect(countRulesBroken('[]')).toBe(0)
  })
  it('counts array elements', () => {
    expect(countRulesBroken('["no_sl_widening","require_killzone"]')).toBe(2)
  })
  it('returns 0 for malformed JSON', () => {
    expect(countRulesBroken('{not json')).toBe(0)
    expect(countRulesBroken('"a string"')).toBe(0)
  })
})
