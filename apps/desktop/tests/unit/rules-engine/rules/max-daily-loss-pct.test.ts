// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/max-daily-loss-pct'
import { makeContext, makeDraft, makeTrade } from '../_helpers'

describe('max_daily_loss_pct', () => {
  it('passes when projected loss is below limit', () => {
    const ctx = makeContext({
      tradeInProgress: makeDraft({ riskAmountCents: 10000 }),
      tradesToday: [makeTrade({ pnlCents: -20000 })],
    })
    const result = rule.evaluate(ctx, { maxPct: 200 }) // 2% of 50k = $1000 = 100,000¢
    expect(result.passed).toBe(true)
  })

  it('blocks when projected loss exceeds limit', () => {
    const ctx = makeContext({
      tradeInProgress: makeDraft({ riskAmountCents: 200000 }),
      tradesToday: [makeTrade({ pnlCents: -900000 })],
    })
    const result = rule.evaluate(ctx, { maxPct: 200 })
    expect(result.passed).toBe(false)
    expect(result.severity).toBe('blocking')
  })

  it('edge: realized losses only, no draft', () => {
    const ctx = makeContext({ tradesToday: [makeTrade({ pnlCents: -50000 })] })
    const result = rule.evaluate(ctx, { maxPct: 200 })
    expect(result.passed).toBe(true)
  })

  it('misconfigured → warning', () => {
    const ctx = makeContext()
    const result = rule.evaluate(ctx, { maxPct: 'xxx' })
    expect(result.severity).toBe('warning')
  })
})
