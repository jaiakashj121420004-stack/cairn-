// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/daily-stop-after-losses'
import { makeContext, makeTrade } from '../_helpers'

describe('daily_stop_after_losses', () => {
  it('passes when streak is under threshold', () => {
    const ctx = makeContext({
      tradesToday: [makeTrade({ id: 'a', pnlCents: -5000 })],
    })
    expect(rule.evaluate(ctx, { consecutiveLosses: 2 }).passed).toBe(true)
  })

  it('blocks once N consecutive losses hit (and is hard lock)', () => {
    const ctx = makeContext({
      tradesToday: [
        makeTrade({ id: 'a', pnlCents: -1000, exitTime: 1 }),
        makeTrade({ id: 'b', pnlCents: -2000, exitTime: 2 }),
      ],
    })
    const r = rule.evaluate(ctx, { consecutiveLosses: 2 })
    expect(r.passed).toBe(false)
    expect(r.canOverride).toBe(false)
    expect(rule.isHardLock).toBe(true)
  })

  it('edge: a win resets the streak', () => {
    const ctx = makeContext({
      tradesToday: [
        makeTrade({ id: 'a', pnlCents: -1000, exitTime: 1 }),
        makeTrade({ id: 'b', pnlCents: +5000, exitTime: 2 }),
        makeTrade({ id: 'c', pnlCents: -1000, exitTime: 3 }),
      ],
    })
    expect(rule.evaluate(ctx, { consecutiveLosses: 2 }).passed).toBe(true)
  })
})
