// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/max-trades-per-day'
import { makeContext, makeDraft, makeTrade } from '../_helpers'

describe('max_trades_per_day', () => {
  it('passes when under the cap', () => {
    const ctx = makeContext({
      tradesToday: [makeTrade()],
      tradeInProgress: makeDraft(),
    })
    expect(rule.evaluate(ctx, { maxTrades: 3 }).passed).toBe(true)
  })

  it('blocks when cap hit', () => {
    const ctx = makeContext({
      tradesToday: [makeTrade({ id: 'a' }), makeTrade({ id: 'b' })],
      tradeInProgress: makeDraft(),
    })
    const r = rule.evaluate(ctx, { maxTrades: 2 })
    expect(r.passed).toBe(false)
    expect(r.severity).toBe('blocking')
  })

  it('edge: cancelled trades do not count', () => {
    const ctx = makeContext({
      tradesToday: [
        makeTrade({ id: 'a', status: 'cancelled' }),
        makeTrade({ id: 'b', status: 'cancelled' }),
      ],
      tradeInProgress: makeDraft(),
    })
    expect(rule.evaluate(ctx, { maxTrades: 2 }).passed).toBe(true)
  })
})
