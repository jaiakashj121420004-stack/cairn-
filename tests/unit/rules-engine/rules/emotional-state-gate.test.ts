// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/emotional-state-gate'
import { makeContext, makeDraft } from '../_helpers'

describe('emotional_state_gate', () => {
  it('passes when scores within limits', () => {
    const ctx = makeContext({
      tradeInProgress: makeDraft({ preUrgencyScore: 5, preNeedScore: 4 }),
    })
    expect(rule.evaluate(ctx, { maxUrgency: 7, maxNeed: 6 }).passed).toBe(true)
  })

  it('warns when urgency exceeds threshold (overrideable)', () => {
    const ctx = makeContext({
      tradeInProgress: makeDraft({ preUrgencyScore: 9, preNeedScore: 4 }),
    })
    const r = rule.evaluate(ctx, { maxUrgency: 7, maxNeed: 6 })
    expect(r.passed).toBe(false)
    expect(r.severity).toBe('warning')
    expect(r.canOverride).toBe(true)
  })

  it('edge: equal to threshold passes (strict greater-than)', () => {
    const ctx = makeContext({
      tradeInProgress: makeDraft({ preUrgencyScore: 7, preNeedScore: 6 }),
    })
    expect(rule.evaluate(ctx, { maxUrgency: 7, maxNeed: 6 }).passed).toBe(true)
  })
})
