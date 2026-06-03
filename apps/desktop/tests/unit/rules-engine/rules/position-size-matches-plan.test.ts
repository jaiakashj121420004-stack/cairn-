// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/position-size-matches-plan'
import { makeContext, makeDraft, makeModification, makeTrade } from '../_helpers'

describe('position_size_matches_plan', () => {
  it('passes when actual equals plan', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft({ lotSize: 50, plannedLotSize: 50 }) })
    const result = rule.evaluate(ctx, { tolerancePct: 5 })
    expect(result.passed).toBe(true)
  })

  it('warns when actual deviates beyond tolerance', () => {
    const ctx = makeContext({ tradeInProgress: makeDraft({ lotSize: 80, plannedLotSize: 50 }) })
    const result = rule.evaluate(ctx, { tolerancePct: 5 })
    expect(result.passed).toBe(false)
    expect(result.severity).toBe('warning')
  })

  it('edge: plannedLotSize unknown → passes', () => {
    const draft = makeDraft({ plannedLotSize: undefined })
    const ctx = makeContext({ tradeInProgress: draft })
    const result = rule.evaluate(ctx, { tolerancePct: 5 })
    expect(result.passed).toBe(true)
  })

  // ── Real-time modification hook (sizing up mid-trade) ──────────────────────
  it('warns on a lot-size modification that exceeds plan tolerance, recording the lot snapshot', () => {
    const ctx = makeContext({
      tradeUnderModification: makeTrade({ lotSize: 50 }),
      tradeModification: makeModification({ field: 'lot_size', currentValue: 50, newValue: 80 }),
    })
    const result = rule.evaluate(ctx, { tolerancePct: 5 })
    expect(result.passed).toBe(false)
    expect(result.severity).toBe('warning')
    expect(result.contextSnapshot).toMatchObject({ field: 'lot_size', current: 50, proposed: 80 })
  })

  it('passes a lot-size modification within tolerance', () => {
    const ctx = makeContext({
      tradeUnderModification: makeTrade({ lotSize: 50 }),
      tradeModification: makeModification({ field: 'lot_size', currentValue: 50, newValue: 52 }),
    })
    expect(rule.evaluate(ctx, { tolerancePct: 5 }).passed).toBe(true)
  })

  it('ignores SL/TP modifications (only acts on lot_size)', () => {
    const ctx = makeContext({
      tradeUnderModification: makeTrade({ lotSize: 50 }),
      tradeModification: makeModification({
        field: 'stop_loss_price',
        currentValue: 107900,
        newValue: 107800,
      }),
    })
    // Falls through to the draft path; no draft → passes.
    expect(rule.evaluate(ctx, { tolerancePct: 5 }).passed).toBe(true)
  })
})
