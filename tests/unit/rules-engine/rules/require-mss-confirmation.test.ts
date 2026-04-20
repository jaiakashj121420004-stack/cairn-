// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/require-mss-confirmation'
import { makeContext, makeDraft } from '../_helpers'

describe('require_mss_confirmation', () => {
  it('passes when mss confirmed', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft({ mssConfirmed: 1 }) })
    expect(rule.evaluate(ctx, {}).passed).toBe(true)
  })

  it('blocks when mss not confirmed', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft({ mssConfirmed: 0 }) })
    const r = rule.evaluate(ctx, {})
    expect(r.passed).toBe(false)
    expect(r.severity).toBe('blocking')
    expect(r.canOverride).toBe(true)
  })

  it('edge: no draft → passes', () => {
    expect(rule.evaluate(makeContext(), {}).passed).toBe(true)
  })
})
