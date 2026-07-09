import { ok, err, type Result } from '@cairn/shared-types'
import { describe, expect, it, vi } from 'vitest'
import {
  cancelSubscription,
  detectCountry,
  formatPrice,
  getBillingStatus,
  openBillingPortal,
  pricingForCountry,
  startCheckout,
  type BillingCaller,
} from './billing'

/**
 * Web billing client tests (CLAUDE.md §19.10, task §6). Cover the pure localization
 * helpers and the four server-call wrappers against an injected fake caller — no network,
 * no real provider (this stage's no-slop footer). The wrappers' job is to send the right
 * body and re-validate the response against the shared Zod schema, so a malformed contract
 * becomes a typed `INTERNAL` rather than a wrong render.
 */

function fakeCaller(
  handler: (method: string, path: string, body?: unknown) => Result<unknown>,
): BillingCaller {
  return {
    call: vi.fn((method: string, path: string, body?: unknown) =>
      Promise.resolve(handler(method, path, body)),
    ) as BillingCaller['call'],
  }
}

describe('pricingForCountry / formatPrice', () => {
  it('routes India to INR (GST-inclusive) and everywhere else to USD (tax-exclusive)', () => {
    const india = pricingForCountry('IN')
    expect(india.currency).toBe('INR')
    expect(india.taxInclusive).toBe(true)

    for (const c of ['US', 'GB', 'de', 'AU']) {
      const p = pricingForCountry(c)
      expect(p.currency).toBe('USD')
      expect(p.taxInclusive).toBe(false)
    }
  })

  it('formats annual lower per-month than monthly×12 (annual is the discount)', () => {
    const usd = pricingForCountry('US')
    expect(usd.annual).toBeLessThan(usd.monthly * 12)
    // The formatted strings are non-empty currency renders.
    expect(formatPrice(usd, 'monthly')).toMatch(/\d/)
    expect(formatPrice(usd, 'annual')).toMatch(/\d/)
  })
})

describe('detectCountry', () => {
  it('reads a clean 2-letter code from the cf-country cookie', () => {
    expect(detectCountry(() => 'foo=1; cf-country=IN; bar=2')).toBe('IN')
  })

  it('upper-cases and falls back to locale region when the cookie is absent', () => {
    // No cookie → locale fallback (jsdom navigator.language is usually en-US) or 'US'.
    const result = detectCountry(() => '')
    expect(result).toMatch(/^[A-Z]{2}$/)
  })

  it('ignores a malformed cookie value', () => {
    const result = detectCountry(() => 'cf-country=ZZZ')
    expect(result).toMatch(/^[A-Z]{2}$/)
  })
})

describe('startCheckout', () => {
  it('sends country + plan=pro + interval and returns the hosted url', async () => {
    const caller = fakeCaller((method, path, body) => {
      expect(method).toBe('POST')
      expect(path).toBe('/billing/checkout')
      expect(body).toEqual({ country: 'IN', plan: 'pro', interval: 'annual' })
      return ok({ url: 'https://rzp.io/checkout/abc' })
    })
    const res = await startCheckout({ country: 'IN', interval: 'annual' }, caller)
    expect(res.ok && res.data.url).toBe('https://rzp.io/checkout/abc')
  })

  it('surfaces a malformed response as a typed INTERNAL error, not a bad redirect', async () => {
    const caller = fakeCaller(() => ok({ notUrl: true }))
    const res = await startCheckout({ country: 'US', interval: 'monthly' }, caller)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('INTERNAL')
  })

  it('passes a server error through untouched', async () => {
    const caller = fakeCaller(() => err('NOT_IMPLEMENTED', 'razorpay is not configured'))
    const res = await startCheckout({ country: 'IN', interval: 'monthly' }, caller)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_IMPLEMENTED')
  })
})

describe('getBillingStatus', () => {
  it('validates and returns the canonical status', async () => {
    const caller = fakeCaller((_m, path) => {
      expect(path).toBe('/billing/status')
      return ok({
        plan: 'pro',
        state: 'active',
        features: ['cloud_sync'],
        current_period_end: '2026-07-01T00:00:00.000Z',
      })
    })
    const res = await getBillingStatus(caller)
    expect(res.ok && res.data.state).toBe('active')
  })

  it('rejects a status with an unknown state enum', async () => {
    const caller = fakeCaller(() =>
      ok({ plan: 'pro', state: 'frozen', features: [], current_period_end: null }),
    )
    const res = await getBillingStatus(caller)
    expect(res.ok).toBe(false)
  })
})

describe('cancelSubscription / openBillingPortal', () => {
  it('defaults cancellation to period_end and echoes the schedule', async () => {
    const caller = fakeCaller((_m, path, body) => {
      expect(path).toBe('/billing/cancel')
      expect(body).toEqual({ when: 'period_end' })
      return ok({ scheduled: 'period_end' })
    })
    const res = await cancelSubscription(undefined, caller)
    expect(res.ok && res.data.scheduled).toBe('period_end')
  })

  it('returns NOT_IMPLEMENTED from the portal for providers without one (Razorpay)', async () => {
    const caller = fakeCaller(() => err('NOT_IMPLEMENTED', 'razorpay has no customer portal'))
    const res = await openBillingPortal(caller)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_IMPLEMENTED')
  })
})
