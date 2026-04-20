// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/require-dxy-check'
import { makeContext, makeSession } from '../_helpers'

describe('require_dxy_check', () => {
  it('passes when dxyBias is set', () => {
    const ctx = makeContext({ currentSession: makeSession({ dxyBias: 'bullish' }) })
    expect(rule.evaluate(ctx, {}).passed).toBe(true)
  })

  it('warns when dxyBias is missing', () => {
    const ctx = makeContext({ currentSession: makeSession({ dxyBias: null }) })
    const r = rule.evaluate(ctx, {})
    expect(r.passed).toBe(false)
    expect(r.severity).toBe('warning')
    expect(r.canOverride).toBe(true)
  })

  it('edge: no session → warns', () => {
    const ctx = makeContext({ currentSession: null })
    expect(rule.evaluate(ctx, {}).passed).toBe(false)
  })
})
