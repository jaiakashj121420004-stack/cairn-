// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  setGuardrailSink,
  resetGuardrailSink,
} from '../../../../electron/services/rules-engine/guardrail'
import { rule } from '../../../../electron/services/rules-engine/rules/max-overall-daily-loss-hard-stop-pct'
import { makeContext, makeDraft, makeTrade } from '../_helpers'

afterEach(() => {
  resetGuardrailSink()
})

describe('max_overall_daily_loss_hard_stop_pct', () => {
  it('misconfigured hard lock fails CLOSED: blocking, no override, guardrail reported', () => {
    const sink = vi.fn()
    setGuardrailSink(sink)
    const r = rule.evaluate(makeContext(), { maxPct: -5 })
    expect(r.passed).toBe(false)
    expect(r.severity).toBe('blocking')
    expect(r.canOverride).toBe(false)
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ ruleKey: 'max_overall_daily_loss_hard_stop_pct' }),
    )
  })

  it('passes when projected loss is below limit', () => {
    const ctx = makeContext({ tradesToday: [makeTrade({ pnlCents: -10000 })] })
    const result = rule.evaluate(ctx, { maxPct: 300 })
    expect(result.passed).toBe(true)
  })

  it('is a non-overrideable hard lock when exceeded', () => {
    const ctx = makeContext({ tradesToday: [makeTrade({ pnlCents: -2000000 })] })
    const result = rule.evaluate(ctx, { maxPct: 300 })
    expect(result.passed).toBe(false)
    expect(result.canOverride).toBe(false)
    expect(rule.isHardLock).toBe(true)
  })

  it('edge: exactly at limit passes', () => {
    const account = makeContext().account
    const limitCents = Math.floor((account.accountSizeCents * 300) / 10_000)
    const ctx = makeContext({ tradesToday: [makeTrade({ pnlCents: -limitCents })] })
    const result = rule.evaluate(ctx, { maxPct: 300 })
    expect(result.passed).toBe(true)
  })

  it('draft projected crossing the threshold triggers hard stop', () => {
    const ctx = makeContext({
      tradesToday: [makeTrade({ pnlCents: -140000 })],
      tradeInProgress: makeDraft({ riskAmountCents: 50000 }),
    })
    const result = rule.evaluate(ctx, { maxPct: 300 })
    expect(result.passed).toBe(false)
    expect(result.canOverride).toBe(false)
  })
})
