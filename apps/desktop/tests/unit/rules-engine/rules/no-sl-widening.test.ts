// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/no-sl-widening'
import { makeContext, makeModification, makeTrade } from '../_helpers'

describe('no_sl_widening', () => {
  it('passes on a SL tighten (long)', () => {
    const ctx = makeContext({
      tradeUnderModification: makeTrade({ direction: 'long' }),
      tradeModification: makeModification({ currentValue: 107900, newValue: 107950 }),
    })
    expect(rule.evaluate(ctx, {}).passed).toBe(true)
  })

  it('blocks on widening for a long', () => {
    const ctx = makeContext({
      tradeUnderModification: makeTrade({ direction: 'long' }),
      tradeModification: makeModification({ currentValue: 107900, newValue: 107800 }),
    })
    const r = rule.evaluate(ctx, {})
    expect(r.passed).toBe(false)
    expect(r.severity).toBe('blocking')
  })

  it('edge: short widening blocks (newValue greater)', () => {
    const ctx = makeContext({
      tradeUnderModification: makeTrade({ direction: 'short' }),
      tradeModification: makeModification({ currentValue: 107900, newValue: 108100 }),
    })
    expect(rule.evaluate(ctx, {}).passed).toBe(false)
  })

  it('no modification → passes', () => {
    expect(rule.evaluate(makeContext(), {}).passed).toBe(true)
  })
})
