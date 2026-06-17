// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { BillingHttpClient, type BillingFetchLike } from '../../../electron/services/billing/client'

/**
 * Desktop billing client tests (CLAUDE.md §19.10, task §6). Drive every path with an
 * injected fetch — no network, no real Stripe/Razorpay. The client's job is to attach the
 * Bearer token, send the right body, and re-validate responses against the shared Zod
 * schema so a drifted contract is a typed error rather than a wrong render.
 */
function fakeFetch(scripted: { status: number; body?: unknown; throws?: boolean }): {
  fetchImpl: BillingFetchLike
  calls: Array<{ url: string; init: Parameters<BillingFetchLike>[1] }>
} {
  const calls: Array<{ url: string; init: Parameters<BillingFetchLike>[1] }> = []
  const fetchImpl: BillingFetchLike = (url, init) => {
    calls.push({ url, init })
    if (scripted.throws) return Promise.reject(new Error('offline'))
    return Promise.resolve({
      status: scripted.status,
      text: () => Promise.resolve(scripted.body === undefined ? '' : JSON.stringify(scripted.body)),
    })
  }
  return { fetchImpl, calls }
}

describe('BillingHttpClient.status', () => {
  it('attaches a bearer token and returns the validated status', async () => {
    const { fetchImpl, calls } = fakeFetch({
      status: 200,
      body: {
        ok: true,
        data: { plan: 'pro', state: 'active', features: ['cloud_sync'], current_period_end: null },
      },
    })
    const client = new BillingHttpClient({ baseUrl: 'http://api', fetchImpl })
    const res = await client.status('tok-123')
    expect(res).toEqual({
      ok: true,
      data: { plan: 'pro', state: 'active', features: ['cloud_sync'], current_period_end: null },
    })
    expect(calls[0]?.url).toBe('http://api/billing/status')
    expect(calls[0]?.init.headers['authorization']).toBe('Bearer tok-123')
  })

  it('maps a malformed status body to INTERNAL', async () => {
    const { fetchImpl } = fakeFetch({ status: 200, body: { ok: true, data: { plan: 'gold' } } })
    const client = new BillingHttpClient({ baseUrl: 'http://api', fetchImpl })
    const res = await client.status('tok')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('INTERNAL')
  })
})

describe('BillingHttpClient.checkout', () => {
  it('normalises the country, posts plan=pro, and returns the hosted url', async () => {
    const { fetchImpl, calls } = fakeFetch({
      status: 200,
      body: { ok: true, data: { url: 'https://rzp.io/i/abc' } },
    })
    const client = new BillingHttpClient({ baseUrl: 'http://api', fetchImpl })
    const res = await client.checkout({ country: 'in', plan: 'pro', interval: 'annual' }, 'tok')
    expect(res.ok && res.data.url).toBe('https://rzp.io/i/abc')
    const sent = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>
    expect(sent).toEqual({ country: 'IN', plan: 'pro', interval: 'annual' })
  })

  it('surfaces a provider-not-configured error untouched', async () => {
    const { fetchImpl } = fakeFetch({
      status: 501,
      body: { ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'razorpay not configured' } },
    })
    const client = new BillingHttpClient({ baseUrl: 'http://api', fetchImpl })
    const res = await client.checkout({ country: 'IN', plan: 'pro', interval: 'monthly' }, 'tok')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_IMPLEMENTED')
  })

  it('returns a NETWORK_ERROR when the fetch throws', async () => {
    const { fetchImpl } = fakeFetch({ status: 0, throws: true })
    const client = new BillingHttpClient({ baseUrl: 'http://api', fetchImpl })
    const res = await client.checkout({ country: 'US', plan: 'pro', interval: 'monthly' }, 'tok')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NETWORK_ERROR')
  })
})

describe('BillingHttpClient.cancel / portal', () => {
  it('posts the cancellation schedule and echoes it', async () => {
    const { fetchImpl, calls } = fakeFetch({
      status: 200,
      body: { ok: true, data: { scheduled: 'period_end' } },
    })
    const client = new BillingHttpClient({ baseUrl: 'http://api', fetchImpl })
    const res = await client.cancel('period_end', 'tok')
    expect(res.ok && res.data.scheduled).toBe('period_end')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ when: 'period_end' })
  })

  it('passes a Razorpay no-portal error through as NOT_IMPLEMENTED', async () => {
    const { fetchImpl } = fakeFetch({
      status: 501,
      body: { ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'razorpay has no portal' } },
    })
    const client = new BillingHttpClient({ baseUrl: 'http://api', fetchImpl })
    const res = await client.portal('tok')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_IMPLEMENTED')
  })
})
