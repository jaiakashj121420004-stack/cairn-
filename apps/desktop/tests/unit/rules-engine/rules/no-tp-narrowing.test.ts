// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/no-tp-narrowing'
import { makeContext, makeModification, makeTrade } from '../_helpers'

describe('no_tp_narrowing', () => {
  it('passes when extending the target outward (long, TP raised)', () => {
    const ctx = makeContext({
      tradeUnderModification: makeTrade({ direction: 'long' }),
      tradeModification: makeModification({
        field: 'take_profit_price',
        currentValue: 108200,
        newValue: 108400,
      }),
    })
    expect(rule.evaluate(ctx, {}).passed).toBe(true)
  })

  it('blocks narrowing the target toward entry (long, TP lowered)', () => {
    const ctx = makeContext({
      tradeUnderModification: makeTrade({ direction: 'long' }),
      tradeModification: makeModification({
        field: 'take_profit_price',
        currentValue: 108200,
        newValue: 108050,
      }),
    })
    const r = rule.evaluate(ctx, {})
    expect(r.passed).toBe(false)
    expect(r.severity).toBe('blocking')
    expect(r.contextSnapshot).toMatchObject({ field: 'take_profit_price', proposed: 108050 })
  })

  it('blocks narrowing for a short (TP raised toward entry)', () => {
    const ctx = makeContext({
      tradeUnderModification: makeTrade({ direction: 'short', takeProfitPrice: 107800 }),
      tradeModification: makeModification({
        field: 'take_profit_price',
        currentValue: 107800,
        newValue: 107900,
      }),
    })
    expect(rule.evaluate(ctx, {}).passed).toBe(false)
  })

  it('ignores SL modifications (only acts on take_profit_price)', () => {
    const ctx = makeContext({
      tradeUnderModification: makeTrade({ direction: 'long' }),
      tradeModification: makeModification({
        field: 'stop_loss_price',
        currentValue: 107900,
        newValue: 107800,
      }),
    })
    expect(rule.evaluate(ctx, {}).passed).toBe(true)
  })

  it('no modification → passes', () => {
    expect(rule.evaluate(makeContext(), {}).passed).toBe(true)
  })
})
