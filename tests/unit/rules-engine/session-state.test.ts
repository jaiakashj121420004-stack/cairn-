// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { deriveSessionState } from '../../../electron/services/rules-engine/session-state'
import { makeContext, makeAccountRule, makeCooldown, makeTrade } from './_helpers'

describe('deriveSessionState', () => {
  it('idle: no session, no cooldowns, no hard-lock failures', () => {
    const ctx = makeContext({ currentSession: null, accountRules: [], activeCooldowns: [] })
    const s = deriveSessionState(ctx)
    expect(s.state).toBe('idle')
    expect(s.unlockAt).toBeNull()
    expect(s.activeCooldowns).toEqual([])
  })

  it('active: session exists, no cooldown, no hard-lock failures', () => {
    const ctx = makeContext({ accountRules: [] })
    const s = deriveSessionState(ctx)
    expect(s.state).toBe('active')
    expect(s.unlockAt).toBeNull()
  })

  it('active+cooldown: exposes soonest cooldown expiry as unlockAt', () => {
    const now = Date.UTC(2026, 3, 20, 9, 0)
    const cd1 = makeCooldown({ id: 'a', expiresAt: now + 30 * 60_000 })
    const cd2 = makeCooldown({ id: 'b', expiresAt: now + 10 * 60_000 })
    const ctx = makeContext({ now, activeCooldowns: [cd1, cd2] })
    const s = deriveSessionState(ctx)
    expect(s.state).toBe('active')
    expect(s.unlockAt).toBe(now + 10 * 60_000)
    expect(s.activeCooldowns.length).toBe(2)
  })

  it('locked: a hard-lock rule fails (overall daily-loss hard stop hit)', () => {
    // 5% of $50k = $2,500 = 250,000 cents. A loss of $3,000 (300,000 cents) trips it.
    const losingTrade = makeTrade({ pnlCents: -300_000 })
    const ctx = makeContext({
      accountRules: [makeAccountRule('max_overall_daily_loss_hard_stop_pct', { maxPct: 500 })],
      tradesToday: [losingTrade],
    })
    const s = deriveSessionState(ctx)
    expect(s.state).toBe('locked')
    expect(s.lockedReason).toMatch(/hard|loss/i)
    expect(s.unlockAt).not.toBeNull()
  })

  it('ignores cleared cooldowns when computing active list', () => {
    const now = Date.UTC(2026, 3, 20, 9, 0)
    const cleared = makeCooldown({ id: 'old', clearedAt: now - 1000 })
    const ctx = makeContext({ now, activeCooldowns: [cleared] })
    const s = deriveSessionState(ctx)
    // helpers.activeCooldownsNow filters cleared ones — none active → state goes by session
    expect(s.state).toBe('active')
    expect(s.unlockAt).toBeNull()
  })
})
