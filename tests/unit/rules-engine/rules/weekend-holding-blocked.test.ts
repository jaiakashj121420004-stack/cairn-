// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/weekend-holding-blocked'
import { makeAccount, makeContext, makeDraft } from '../_helpers'

const MONDAY_8AM_UTC = Date.UTC(2026, 3, 20, 8, 0) // 2026-04-20 is a Monday
const SATURDAY_NOON_UTC = Date.UTC(2026, 3, 18, 12, 0)
const FRIDAY_9PM_UTC = Date.UTC(2026, 3, 17, 21, 0)

describe('weekend_holding_blocked', () => {
  it('passes when weekend holding is allowed on the account', () => {
    const ctx = makeContext({
      account: makeAccount({ weekendHoldingAllowed: 1 }),
      tradeInProgress: makeDraft({ timestamp: SATURDAY_NOON_UTC }),
    })
    expect(rule.evaluate(ctx, {}).passed).toBe(true)
  })

  it('blocks on Saturday', () => {
    const ctx = makeContext({
      account: makeAccount({ weekendHoldingAllowed: 0 }),
      tradeInProgress: makeDraft({ timestamp: SATURDAY_NOON_UTC }),
      now: SATURDAY_NOON_UTC,
    })
    const r = rule.evaluate(ctx, {})
    expect(r.passed).toBe(false)
    expect(r.canOverride).toBe(false)
  })

  it('edge: blocks Friday after configured cutoff hour', () => {
    const ctx = makeContext({
      account: makeAccount({ weekendHoldingAllowed: 0 }),
      tradeInProgress: makeDraft({ timestamp: FRIDAY_9PM_UTC }),
      now: FRIDAY_9PM_UTC,
    })
    expect(rule.evaluate(ctx, { fridayCloseUtcHour: 20 }).passed).toBe(false)
  })

  it('Monday morning passes', () => {
    const ctx = makeContext({
      account: makeAccount({ weekendHoldingAllowed: 0 }),
      tradeInProgress: makeDraft({ timestamp: MONDAY_8AM_UTC }),
      now: MONDAY_8AM_UTC,
    })
    expect(rule.evaluate(ctx, {}).passed).toBe(true)
  })
})
