// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/require-invalidation-text'
import { makeContext, makeDraft } from '../_helpers'

describe('require_invalidation_text', () => {
  it('passes with sufficient text', () => {
    const ctx = makeContext({
      tradeInProgress: makeDraft({ plannedInvalidation: 'a'.repeat(25) }),
    })
    expect(rule.evaluate(ctx, { minChars: 20 }).passed).toBe(true)
  })

  it('blocks with too-short text and is not overrideable', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft({ plannedInvalidation: 'nope' }) })
    const r = rule.evaluate(ctx, { minChars: 20 })
    expect(r.passed).toBe(false)
    expect(r.canOverride).toBe(false)
  })

  it('edge: trimmed whitespace does not count', () => {
    const ctx = makeContext({
      tradeInProgress: makeDraft({ plannedInvalidation: '   ' + 'x'.repeat(10) + '   ' }),
    })
    expect(rule.evaluate(ctx, { minChars: 20 }).passed).toBe(false)
  })
})
