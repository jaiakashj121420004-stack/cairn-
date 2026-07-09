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

  it('edge: planned drafts do not count (a draft is a plan, not a placed trade)', () => {
    const ctx = makeContext({
      tradesToday: [
        makeTrade({ id: 'a', status: 'planned' }),
        makeTrade({ id: 'b', status: 'planned' }),
      ],
      tradeInProgress: makeDraft(),
    })
    const r = rule.evaluate(ctx, { maxTrades: 2 })
    expect(r.passed).toBe(true)
    expect(r.contextSnapshot).toEqual({ taken: 0, max: 2 })
  })

  it('mixed statuses: only placed trades consume the cap', () => {
    const ctx = makeContext({
      tradesToday: [
        makeTrade({ id: 'a', status: 'planned' }),
        makeTrade({ id: 'b', status: 'cancelled' }),
        makeTrade({ id: 'c', status: 'open' }),
        makeTrade({ id: 'd', status: 'closed' }),
      ],
      tradeInProgress: makeDraft(),
    })
    // 2 placed + 1 in progress = 3 > 2 → blocked; drafts/cancelled ignored.
    const r = rule.evaluate(ctx, { maxTrades: 2 })
    expect(r.passed).toBe(false)
    expect(r.contextSnapshot).toEqual({ taken: 2, max: 2 })
  })
})
