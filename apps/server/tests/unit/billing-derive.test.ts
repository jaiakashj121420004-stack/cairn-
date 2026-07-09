import { describe, expect, it } from 'vitest'
import { deriveSubscription } from '../../src/billing/derive'
import type { SubscriptionRow } from '../../src/billing/derive'

/**
 * Pure unit tests for subscription derivation (§20.1, §20.5): lazy expiry of trial /
 * grace / cancelled-period windows so a user loses access the moment a window closes.
 */

const NOW = Date.UTC(2026, 0, 15)
const future = new Date(NOW + 10 * 86_400_000)
const past = new Date(NOW - 10 * 86_400_000)

function row(partial: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    entitlement: 'pro',
    status: 'active',
    currentPeriodEnd: null,
    graceUntil: null,
    trialEndsAt: null,
    ...partial,
  }
}

describe('deriveSubscription', () => {
  it('no row ⇒ free', () => {
    expect(deriveSubscription(null, NOW)).toMatchObject({
      plan: 'free',
      entitlement: 'free',
      state: 'free',
    })
  })

  it('active grants pro regardless of a passed period end (rolls until a webhook says otherwise)', () => {
    expect(
      deriveSubscription(row({ status: 'active', currentPeriodEnd: past }), NOW),
    ).toMatchObject({
      plan: 'pro',
      state: 'active',
    })
  })

  it('trial grants pro until its deadline, then decays to free', () => {
    expect(
      deriveSubscription(row({ status: 'trial', entitlement: 'trial', trialEndsAt: future }), NOW),
    ).toMatchObject({ plan: 'pro', entitlement: 'trial', state: 'trial' })
    expect(
      deriveSubscription(row({ status: 'trial', entitlement: 'trial', trialEndsAt: past }), NOW),
    ).toMatchObject({ plan: 'free', entitlement: 'free' })
  })

  it('past_due keeps pro through the grace window, then decays to free', () => {
    expect(deriveSubscription(row({ status: 'past_due', graceUntil: future }), NOW)).toMatchObject({
      plan: 'pro',
      state: 'past_due',
    })
    expect(deriveSubscription(row({ status: 'past_due', graceUntil: past }), NOW)).toMatchObject({
      plan: 'free',
      entitlement: 'free',
    })
  })

  it('cancel-at-period-end keeps pro until the period closes', () => {
    expect(
      deriveSubscription(row({ status: 'canceled', currentPeriodEnd: future }), NOW),
    ).toMatchObject({ plan: 'pro', state: 'canceled' })
    expect(
      deriveSubscription(row({ status: 'canceled', currentPeriodEnd: past }), NOW),
    ).toMatchObject({ plan: 'free', entitlement: 'free', state: 'canceled' })
  })
})
