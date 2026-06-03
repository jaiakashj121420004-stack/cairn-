// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/require-htf-bias-logged'
import { makeContext, makeSession } from '../_helpers'

describe('require_htf_bias_logged', () => {
  it('passes when all three biases present', () => {
    const ctx = makeContext({ currentSession: makeSession() })
    expect(rule.evaluate(ctx, {}).passed).toBe(true)
  })

  it('blocks when session is null', () => {
    const ctx = makeContext({ currentSession: null })
    const r = rule.evaluate(ctx, {})
    expect(r.passed).toBe(false)
    expect(r.canOverride).toBe(false)
  })

  it('edge: session with missing H1 bias blocks', () => {
    const ctx = makeContext({ currentSession: makeSession({ h1Bias: null }) })
    expect(rule.evaluate(ctx, {}).passed).toBe(false)
  })
})
