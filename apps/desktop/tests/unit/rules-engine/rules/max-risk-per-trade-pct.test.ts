// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/max-risk-per-trade-pct'
import { makeContext, makeDraft } from '../_helpers'

describe('max_risk_per_trade_pct', () => {
  it('passes when risk is under the limit', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft({ riskPctBps: 80 }) })
    const result = rule.evaluate(ctx, { maxPct: 100 })
    expect(result.passed).toBe(true)
    expect(result.severity).toBe('info')
  })

  it('blocks when risk exceeds the limit', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft({ riskPctBps: 150 }) })
    const result = rule.evaluate(ctx, { maxPct: 100 })
    expect(result.passed).toBe(false)
    expect(result.severity).toBe('blocking')
    expect(result.canOverride).toBe(true)
  })

  it('edge: risk equal to limit passes (boundary)', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft({ riskPctBps: 100 }) })
    const result = rule.evaluate(ctx, { maxPct: 100 })
    expect(result.passed).toBe(true)
  })

  it('misconfigured config → warning, does not throw', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft() })
    const result = rule.evaluate(ctx, { maxPct: -1 })
    expect(result.passed).toBe(false)
    expect(result.severity).toBe('warning')
  })

  it('no draft → passes with info', () => {
    const ctx = makeContext()
    const result = rule.evaluate(ctx, { maxPct: 100 })
    expect(result.passed).toBe(true)
  })
})
