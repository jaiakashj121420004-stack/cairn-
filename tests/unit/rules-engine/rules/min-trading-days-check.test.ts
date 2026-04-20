// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/min-trading-days-check'
import { makeAccount, makeContext } from '../_helpers'

describe('min_trading_days_check', () => {
  it('passes when no requirement configured', () => {
    const ctx = makeContext({ account: makeAccount({ minTradingDays: null }) })
    const r = rule.evaluate(ctx, {})
    expect(r.passed).toBe(true)
    expect(r.severity).toBe('info')
  })

  it('shows progress (info, never blocks) when under', () => {
    const ctx = makeContext({
      account: makeAccount({ minTradingDays: 10 }),
      tradingDaysCount: 4,
    })
    const r = rule.evaluate(ctx, {})
    expect(r.passed).toBe(false)
    expect(r.severity).toBe('info') // never blocking
  })

  it('edge: exactly met → passes', () => {
    const ctx = makeContext({
      account: makeAccount({ minTradingDays: 5 }),
      tradingDaysCount: 5,
    })
    expect(rule.evaluate(ctx, {}).passed).toBe(true)
  })
})
