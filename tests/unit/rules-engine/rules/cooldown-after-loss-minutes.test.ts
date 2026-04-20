// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rule } from '../../../../electron/services/rules-engine/rules/cooldown-after-loss-minutes'
import { makeContext, makeCooldown } from '../_helpers'

describe('cooldown_after_loss_minutes', () => {
  it('passes when no active cooldown', () => {
    expect(rule.evaluate(makeContext(), { minutes: 30 }).passed).toBe(true)
  })

  it('blocks when a post_loss cooldown is active', () => {
    const now = Date.UTC(2026, 3, 20, 9, 10)
    const ctx = makeContext({
      now,
      activeCooldowns: [
        makeCooldown({ startedAt: now - 5 * 60_000, expiresAt: now + 20 * 60_000 }),
      ],
    })
    const r = rule.evaluate(ctx, { minutes: 30 })
    expect(r.passed).toBe(false)
    expect(r.canOverride).toBe(false)
  })

  it('edge: expired cooldown is ignored', () => {
    const now = Date.UTC(2026, 3, 20, 10, 0)
    const ctx = makeContext({
      now,
      activeCooldowns: [
        makeCooldown({ startedAt: now - 60 * 60_000, expiresAt: now - 30 * 60_000 }),
      ],
    })
    expect(rule.evaluate(ctx, { minutes: 30 }).passed).toBe(true)
  })

  it('misconfigured → warning', () => {
    expect(rule.evaluate(makeContext(), { minutes: -1 }).severity).toBe('warning')
  })
})
