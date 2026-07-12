import { describe, expect, it } from 'vitest'
import { selectBillingProvider } from '../../src/billing/routes'
import type { BillingProvider, BillingProviders } from '../../src/billing/provider'

/**
 * Pure unit tests for the checkout gateway selector (CLAUDE.md §20.6, docs/billing.md §4).
 *
 * The decision is entirely server-side (§20.9): when Dodo is configured it is the default
 * for every country; otherwise India → Razorpay, everywhere else → Stripe.
 */

// A stub provider is enough — the selector only inspects which keys are present.
const stub = {} as BillingProvider

describe('selectBillingProvider — gateway routing', () => {
  it('prefers Dodo for every country when Dodo is configured', () => {
    const providers: BillingProviders = { dodo: stub, stripe: stub, razorpay: stub }
    expect(selectBillingProvider('US', providers)).toBe('dodo')
    expect(selectBillingProvider('IN', providers)).toBe('dodo')
    expect(selectBillingProvider('DE', providers)).toBe('dodo')
  })

  it('falls back to Razorpay for India when Dodo is absent', () => {
    const providers: BillingProviders = { stripe: stub, razorpay: stub }
    expect(selectBillingProvider('IN', providers)).toBe('razorpay')
  })

  it('falls back to Stripe for non-India when Dodo is absent', () => {
    const providers: BillingProviders = { stripe: stub, razorpay: stub }
    expect(selectBillingProvider('US', providers)).toBe('stripe')
    expect(selectBillingProvider('GB', providers)).toBe('stripe')
  })

  it('routes to Dodo even when it is the only configured provider', () => {
    const providers: BillingProviders = { dodo: stub }
    expect(selectBillingProvider('IN', providers)).toBe('dodo')
    expect(selectBillingProvider('US', providers)).toBe('dodo')
  })
})
