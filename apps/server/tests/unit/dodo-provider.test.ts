import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DodoBillingProvider } from '../../src/billing/dodo-provider'
import { signDodoPayload } from '../../src/billing/dodo-signature'
import { loadEnv, resetEnvCache } from '../../src/env'
import type { Env } from '../../src/env'

/**
 * Pure unit tests for the Dodo provider (CLAUDE.md §2.13, §19 no-slop). No Postgres and no
 * network: the Dodo REST API is stubbed via a fake `fetch`, and webhook signatures are
 * exercised end-to-end with the {@link signDodoPayload} test helper. The two mandatory
 * §2.13 checks live here at the unit level — signature accept/reject — with the DB-backed
 * idempotency + replay tests in the webhooks integration suite.
 */

const WEBHOOK_SECRET = `whsec_${randomBytes(24).toString('base64')}`

function testEnv(overrides: Partial<Record<string, string>> = {}): Env {
  resetEnvCache()
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://cairn:cairn@localhost:5432/cairn',
    PASSWORD_PEPPER: randomBytes(32).toString('hex'),
    JWT_SECRET: randomBytes(32).toString('hex'),
    EMAIL_PROVIDER: 'memory',
    DODO_API_KEY: `dodo_test_${randomBytes(8).toString('hex')}`,
    DODO_WEBHOOK_SECRET: WEBHOOK_SECRET,
    DODO_PRODUCT_ID: 'prod_monthly',
    DODO_PRODUCT_ID_ANNUAL: 'prod_annual',
    DODO_ENVIRONMENT: 'test',
    ...overrides,
  })
}

interface CapturedRequest {
  url: string
  method: string
  body: unknown
}

/** Stub global fetch to capture the outgoing request and return a canned JSON body. */
function stubFetch(response: unknown): { calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? (JSON.parse(init.body) as unknown) : undefined,
      })
      return Promise.resolve({ ok: true, json: () => Promise.resolve(response) } as Response)
    }),
  )
  return { calls }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DodoBillingProvider — construction', () => {
  it('throws NOT_IMPLEMENTED when the API key is absent', () => {
    const env = testEnv({ DODO_API_KEY: '' })
    expect(() => new DodoBillingProvider(env)).toThrow(/dodo is not configured/)
  })
})

describe('DodoBillingProvider — createCheckout', () => {
  let provider: DodoBillingProvider
  beforeEach(() => {
    provider = new DodoBillingProvider(testEnv())
  })

  it('posts the monthly product for a monthly checkout and stamps cairn_user_id', async () => {
    const { calls } = stubFetch({ checkout_url: 'https://checkout.dodo/monthly' })
    const res = await provider.createCheckout({
      userId: 'user-1',
      email: 'a@example.com',
      plan: 'pro',
      interval: 'monthly',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/no',
    })
    expect(res.url).toBe('https://checkout.dodo/monthly')
    const body = calls[0]?.body as { product_cart: { product_id: string }[]; metadata: unknown }
    expect(body.product_cart[0]?.product_id).toBe('prod_monthly')
    expect(body.metadata).toEqual({ cairn_user_id: 'user-1' })
    expect(calls[0]?.url).toContain('/checkouts')
  })

  it('posts the annual product for an annual checkout', async () => {
    const { calls } = stubFetch({ checkout_url: 'https://checkout.dodo/annual' })
    await provider.createCheckout({
      userId: 'user-1',
      email: 'a@example.com',
      plan: 'pro',
      interval: 'annual',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/no',
    })
    const body = calls[0]?.body as { product_cart: { product_id: string }[] }
    expect(body.product_cart[0]?.product_id).toBe('prod_annual')
  })

  it('falls back to the monthly product when no annual product is configured', async () => {
    const p = new DodoBillingProvider(testEnv({ DODO_PRODUCT_ID_ANNUAL: '' }))
    const { calls } = stubFetch({ checkout_url: 'https://checkout.dodo/monthly' })
    await p.createCheckout({
      userId: 'user-1',
      email: 'a@example.com',
      plan: 'pro',
      interval: 'annual',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/no',
    })
    const body = calls[0]?.body as { product_cart: { product_id: string }[] }
    expect(body.product_cart[0]?.product_id).toBe('prod_monthly')
  })

  it('throws INTERNAL when Dodo returns no checkout url', async () => {
    stubFetch({})
    await expect(
      provider.createCheckout({
        userId: 'user-1',
        email: 'a@example.com',
        plan: 'pro',
        interval: 'monthly',
        successUrl: 'https://app/ok',
        cancelUrl: 'https://app/no',
      }),
    ).rejects.toThrow(/did not return a checkout url/)
  })
})

describe('DodoBillingProvider — verifyWebhook (Standard Webhooks signature)', () => {
  const provider = new DodoBillingProvider(testEnv())

  function delivery(bodyObj: unknown, opts: { id?: string; ts?: number } = {}) {
    const rawBody = JSON.stringify(bodyObj)
    const id = opts.id ?? `evt_${randomBytes(6).toString('hex')}`
    const ts = opts.ts ?? Math.floor(Date.now() / 1000)
    const signature = signDodoPayload(id, ts, rawBody, WEBHOOK_SECRET)
    return {
      body: Buffer.from(rawBody),
      headers: {
        'webhook-id': id,
        'webhook-timestamp': String(ts),
        'webhook-signature': signature,
      },
      id,
    }
  }

  it('accepts a validly-signed webhook and returns id + type', () => {
    const d = delivery({ type: 'subscription.active', data: { payload_type: 'Subscription' } })
    const event = provider.verifyWebhook(d.body, d.headers)
    expect(event.id).toBe(d.id)
    expect(event.type).toBe('subscription.active')
  })

  it('rejects a tampered signature', () => {
    const d = delivery({ type: 'subscription.active' })
    const tampered = { ...d.headers, 'webhook-signature': 'v1,ZGVhZGJlZWZkZWFkYmVlZg==' }
    expect(() => provider.verifyWebhook(d.body, tampered)).toThrow(/invalid dodo webhook signature/)
  })

  it('rejects a body mutated after signing (signature no longer matches)', () => {
    const d = delivery({ type: 'subscription.active', amount: 100 })
    const mutated = Buffer.from(JSON.stringify({ type: 'subscription.active', amount: 999 }))
    expect(() => provider.verifyWebhook(mutated, d.headers)).toThrow(
      /invalid dodo webhook signature/,
    )
  })

  it('rejects a delivery with missing signature headers', () => {
    const d = delivery({ type: 'subscription.active' })
    expect(() => provider.verifyWebhook(d.body, { 'webhook-id': d.id })).toThrow(
      /missing dodo webhook signature headers/,
    )
  })

  it('rejects a stale timestamp outside the tolerance window', () => {
    const d = delivery(
      { type: 'subscription.active' },
      { ts: Math.floor(Date.now() / 1000) - 3600 },
    )
    expect(() => provider.verifyWebhook(d.body, d.headers)).toThrow(/outside tolerance/)
  })
})
