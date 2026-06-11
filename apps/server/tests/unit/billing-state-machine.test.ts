import { describe, expect, it } from 'vitest'
import { AppError } from '../../src/lib/errors'
import { canTransition, transition } from '../../src/billing/state-machine'
import type { BillingEventKind } from '../../src/billing/state-machine'
import type { SubscriptionStatus } from '../../src/db/schema'

/**
 * Pure unit tests for the §20.5 state machine. No DB, no clock — the whole graph is
 * exercised here so the webhook integration tests can focus on wiring.
 */

describe('billing state machine — §20.5 graph', () => {
  it('trial → active on first successful payment', () => {
    expect(transition('trial', 'payment_succeeded')).toBe('active')
  })

  it('active → past_due on a failed payment', () => {
    expect(transition('active', 'payment_failed')).toBe('past_due')
  })

  it('past_due → active on recovery', () => {
    expect(transition('past_due', 'payment_succeeded')).toBe('active')
  })

  it('past_due → canceled when the hard-grace timer fires', () => {
    expect(transition('past_due', 'grace_expired')).toBe('canceled')
  })

  it('any live state → canceled on explicit cancellation', () => {
    expect(transition('trial', 'canceled')).toBe('canceled')
    expect(transition('active', 'canceled')).toBe('canceled')
    expect(transition('past_due', 'canceled')).toBe('canceled')
  })

  it('any state → canceled on refund (immediate revoke, §20.7)', () => {
    const states: SubscriptionStatus[] = ['trial', 'active', 'past_due', 'canceled']
    for (const s of states) expect(transition(s, 'refunded')).toBe('canceled')
  })

  it('canceled → active on a new successful payment (reactivation)', () => {
    expect(transition('canceled', 'payment_succeeded')).toBe('active')
  })

  it('self-loops are idempotent no-ops, not errors', () => {
    expect(transition('active', 'payment_succeeded')).toBe('active')
    expect(transition('past_due', 'payment_failed')).toBe('past_due')
    expect(transition('canceled', 'canceled')).toBe('canceled')
  })

  it('forbidden transitions throw ILLEGAL_STATE', () => {
    // A payment failure on a cancelled subscription is structurally impossible.
    expect(() => transition('canceled', 'payment_failed')).toThrowError(AppError)
    try {
      transition('canceled', 'payment_failed')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('ILLEGAL_STATE')
    }
    expect(() => transition('canceled', 'grace_expired')).toThrowError(AppError)
  })

  it('canTransition agrees with transition without throwing', () => {
    const states: SubscriptionStatus[] = ['trial', 'active', 'past_due', 'canceled']
    const events: BillingEventKind[] = [
      'payment_succeeded',
      'payment_failed',
      'canceled',
      'grace_expired',
      'refunded',
    ]
    for (const s of states) {
      for (const e of events) {
        if (canTransition(s, e)) {
          expect(() => transition(s, e)).not.toThrow()
        } else {
          expect(() => transition(s, e)).toThrowError(AppError)
        }
      }
    }
  })
})
