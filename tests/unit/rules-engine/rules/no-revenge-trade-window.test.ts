// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/no-revenge-trade-window'
import { makeContext, makeDraft, makeTrade } from '../_helpers'

describe('no_revenge_trade_window', () => {
  it('blocks when same pair traded within window after loss', () => {
    const now = Date.UTC(2026, 3, 20, 9, 5)
    const ctx = makeContext({
      now,
      tradeInProgress: makeDraft({ pairId: 'pair-eurusd' }),
      tradesToday: [
        makeTrade({
          id: 'l',
          pairId: 'pair-eurusd',
          pnlCents: -5000,
          exitTime: now - 10 * 60_000,
        }),
      ],
    })
    const r = rule.evaluate(ctx, { minutes: 30 })
    expect(r.passed).toBe(false)
    expect(r.severity).toBe('blocking')
  })

  it('passes when no recent loss', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft() })
    expect(rule.evaluate(ctx, { minutes: 30 }).passed).toBe(true)
  })

  it('edge: different pair → passes', () => {
    const now = Date.UTC(2026, 3, 20, 9, 5)
    const ctx = makeContext({
      now,
      tradeInProgress: makeDraft({ pairId: 'pair-gbpusd' }),
      tradesToday: [
        makeTrade({
          id: 'l',
          pairId: 'pair-eurusd',
          pnlCents: -5000,
          exitTime: now - 5 * 60_000,
        }),
      ],
    })
    expect(rule.evaluate(ctx, { minutes: 30 }).passed).toBe(true)
  })
})
