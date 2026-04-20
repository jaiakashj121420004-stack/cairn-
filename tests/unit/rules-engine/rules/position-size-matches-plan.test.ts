// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/position-size-matches-plan'
import { makeContext, makeDraft } from '../_helpers'

describe('position_size_matches_plan', () => {
  it('passes when actual equals plan', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft({ lotSize: 50, plannedLotSize: 50 }) })
    const result = rule.evaluate(ctx, { tolerancePct: 5 })
    expect(result.passed).toBe(true)
  })

  it('warns when actual deviates beyond tolerance', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft({ lotSize: 80, plannedLotSize: 50 }) })
    const result = rule.evaluate(ctx, { tolerancePct: 5 })
    expect(result.passed).toBe(false)
    expect(result.severity).toBe('warning')
  })

  it('edge: plannedLotSize unknown → passes', () => {
    const draft = makeDraft({ plannedLotSize: undefined })
    const ctx = makeContext({ tradeInProgress: draft })
    const result = rule.evaluate(ctx, { tolerancePct: 5 })
    expect(result.passed).toBe(true)
  })
})
