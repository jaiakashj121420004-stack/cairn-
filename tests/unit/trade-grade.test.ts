// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { gradeTrade, countRulesBroken, type TradeGradeInput } from '../../src/lib/trade-grade'

const base: TradeGradeInput = {
  rrRatio: 200,
  followedPlanExactly: 1,
  rulesBrokenCount: 0,
  pnlR: 200,
}

describe('gradeTrade', () => {
  it('returns null for an unclosed trade (no R outcome)', () => {
    expect(gradeTrade({ ...base, pnlR: null })).toBeNull()
  })

  it('a textbook winner grades A (100)', () => {
    const g = gradeTrade(base)
    expect(g).toEqual({ letter: 'A', score: 100 })
  })

  it('a disciplined loss still grades A (process over outcome)', () => {
    // plan followed, clean, RR 2.0, but lost: 35+30+20+0 = 85 → A
    const g = gradeTrade({ ...base, pnlR: -100 })
    expect(g?.score).toBe(85)
    expect(g?.letter).toBe('A')
  })

  it('a rule-breaking, plan-ignoring winner grades F', () => {
    // not followed, 1 rule broken, RR 1.0, win: 0+20+0+15 = 35 → F
    const g = gradeTrade({
      rrRatio: 100,
      followedPlanExactly: 0,
      rulesBrokenCount: 1,
      pnlR: 150,
    })
    expect(g?.score).toBe(35)
    expect(g?.letter).toBe('F')
  })

  it('break-even outcome earns partial outcome credit', () => {
    // plan followed, clean, RR 2.0, break-even: 35+30+20+7 = 92 → A
    expect(gradeTrade({ ...base, pnlR: 0 })?.score).toBe(92)
  })

  it('each broken rule costs 10 points, floored at 0', () => {
    expect(gradeTrade({ ...base, rulesBrokenCount: 1 })?.score).toBe(90) // 35+20+20+15
    expect(gradeTrade({ ...base, rulesBrokenCount: 3 })?.score).toBe(70) // 35+0+20+15
    expect(gradeTrade({ ...base, rulesBrokenCount: 9 })?.score).toBe(70) // floor at 0 for the rules term
  })

  it('planned RR tiers: ≥2.0 → +20, ≥1.5 → +10, else +0', () => {
    expect(gradeTrade({ ...base, rrRatio: 200 })?.score).toBe(100)
    expect(gradeTrade({ ...base, rrRatio: 150 })?.score).toBe(90)
    expect(gradeTrade({ ...base, rrRatio: 100 })?.score).toBe(80)
  })

  it('letter bands map correctly at the boundaries', () => {
    // Construct scores at each boundary via rulesBrokenCount on the base (100).
    expect(gradeTrade({ ...base, rulesBrokenCount: 0 })?.letter).toBe('A') // 100
    expect(gradeTrade({ ...base, rulesBrokenCount: 1 })?.letter).toBe('A') // 90
    expect(gradeTrade({ ...base, rulesBrokenCount: 3, pnlR: -100 })?.letter).toBe('C') // 35+0+20+0=55
  })

  // ── Properties ────────────────────────────────────────────────────────────
  it('property: grade is always one of A–F for any closed trade', () => {
    fc.assert(
      fc.property(
        fc.record({
          rrRatio: fc.integer({ min: 0, max: 1000 }),
          followedPlanExactly: fc.constantFrom(0, 1, null),
          rulesBrokenCount: fc.integer({ min: 0, max: 12 }),
          pnlR: fc.integer({ min: -500, max: 500 }),
        }),
        (input) => {
          const g = gradeTrade(input)
          return g !== null && ['A', 'B', 'C', 'D', 'F'].includes(g.letter) && g.score >= 0 && g.score <= 100
        },
      ),
      { numRuns: 500 },
    )
  })

  it('property: following the plan never lowers the score', () => {
    fc.assert(
      fc.property(
        fc.record({
          rrRatio: fc.integer({ min: 0, max: 400 }),
          rulesBrokenCount: fc.integer({ min: 0, max: 5 }),
          pnlR: fc.integer({ min: -300, max: 300 }),
        }),
        (partial) => {
          const followed = gradeTrade({ ...partial, followedPlanExactly: 1 })?.score ?? 0
          const notFollowed = gradeTrade({ ...partial, followedPlanExactly: 0 })?.score ?? 0
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
