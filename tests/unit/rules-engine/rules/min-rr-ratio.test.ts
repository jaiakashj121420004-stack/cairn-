// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/min-rr-ratio'
import { makeContext, makeDraft } from '../_helpers'

describe('min_rr_ratio', () => {
  it('passes when RR meets minimum', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft({ rrRatio: 300 }) })
    const result = rule.evaluate(ctx, { minRR: 200 })
    expect(result.passed).toBe(true)
  })

  it('blocks when RR is below minimum', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft({ rrRatio: 150 }) })
    const result = rule.evaluate(ctx, { minRR: 200 })
    expect(result.passed).toBe(false)
    expect(result.severity).toBe('blocking')
  })

  it('edge: RR exactly equal to minimum passes', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft({ rrRatio: 200 }) })
    const result = rule.evaluate(ctx, { minRR: 200 })
    expect(result.passed).toBe(true)
  })

  it('misconfigured → warning', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft() })
    const result = rule.evaluate(ctx, {})
    expect(result.severity).toBe('warning')
  })
})
