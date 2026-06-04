import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, subscriptions, webhookEvents } from '../../src/db/schema'
import { auditLogOutputSchema, webhookAckSchema } from '../../src/lib/contracts'
import {
  createTestContext,
  createVerifiedUser,
  getWithAuth,
  makeRazorpaySignature,
  makeRazorpaySubscriptionEvent,
  makeStripeSignature,
  makeStripeSubscriptionEvent,
  postRaw,
  razorpayWebhookSecret,
  resetState,
  stripeWebhookSecret,
  teardown,
} from './helpers'
import type { TestContext } from './helpers'

/**
 * Webhook integration tests (CLAUDE.md §2.13, §2.14, §18.5).
 *
 * Tests cover:
 *  - Signature verification (accept valid, reject tampered/missing)
 *  - Idempotency: duplicate delivery → exactly one webhook_event row, one state change
 *  - Concurrency: 200 parallel deliveries of the same event_id → 1 row
 *  - Stripe subscription event → subscription table update (eventual consistency)
 *  - Razorpay subscription event → subscription table update
 *  - Admin audit-log: token-gated, returns recent rows
 */

let ctx: TestContext

beforeAll(async () => {
  ctx = await createTestContext()
})
afterAll(async () => {
  await teardown(ctx)
})
beforeEach(async () => {
  await resetState(ctx)
})

// ── Helpers ───────────────────────────────────────────────────────────────────────────

function uniqueEventId(): string {
  return `evt_${randomBytes(8).toString('hex')}`
}

async function sendStripe(
  body: string,
  sig?: string,
): Promise<{ statusCode: number; json: () => unknown }> {
  const signature = sig ?? makeStripeSignature(body, stripeWebhookSecret(ctx))
  return postRaw(ctx.app, '/webhooks/stripe', body, { 'stripe-signature': signature })
}

async function sendRazorpay(
  body: string,
  sig?: string,
): Promise<{ statusCode: number; json: () => unknown }> {
  const signature = sig ?? makeRazorpaySignature(body, razorpayWebhookSecret(ctx))
  return postRaw(ctx.app, '/webhooks/razorpay', body, { 'x-razorpay-signature': signature })
}

// ── Stripe webhook ────────────────────────────────────────────────────────────────────

describe('POST /webhooks/stripe', () => {
  it('accepts a validly-signed event (happy path)', async () => {
    const payload = makeStripeSubscriptionEvent(uniqueEventId(), 'customer.subscription.updated', {
      status: 'active',
      current_period_end: Math.floor(Date.now() / 1000) + 86_400 * 30,
      metadata: {},
    })
    const body = JSON.stringify(payload)
    const res = await sendStripe(body)
    expect(res.statusCode).toBe(200)
    expect((res.json() as { data: { received: boolean } }).data.received).toBe(true)
  })

  it('rejects a tampered signature with 400', async () => {
    const body = JSON.stringify(
      makeStripeSubscriptionEvent(uniqueEventId(), 'customer.subscription.updated', {
        status: 'active',
        metadata: {},
      }),
    )
    const res = await sendStripe(body, 't=1234567890,v1=deadbeefdeadbeef')
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects a missing stripe-signature header with 400', async () => {
    const body = JSON.stringify(
      makeStripeSubscriptionEvent(uniqueEventId(), 'customer.subscription.updated', {
        status: 'active',
        metadata: {},
      }),
    )
    const res = await postRaw(ctx.app, '/webhooks/stripe', body, {})
    expect(res.statusCode).toBe(400)
  })

  it('idempotency: sending the same event twice only inserts one row', async () => {
    const eventId = uniqueEventId()
    const payload = makeStripeSubscriptionEvent(eventId, 'customer.subscription.updated', {
      status: 'active',
      metadata: {},
    })
    const body = JSON.stringify(payload)
    // Use the same signature (same timestamp) for both requests.
    const sig = makeStripeSignature(body, stripeWebhookSecret(ctx))

    const first = await sendStripe(body, sig)
    expect(first.statusCode).toBe(200)
    expect((first.json() as { data: { duplicate: boolean } }).data.duplicate).toBe(false)

    const second = await sendStripe(body, sig)
    expect(second.statusCode).toBe(200)
    expect((second.json() as { data: { duplicate: boolean } }).data.duplicate).toBe(true)

    const rows = await ctx.handle.db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.externalId, eventId))
    expect(rows).toHaveLength(1)
  })

  it('idempotency: two deliveries 10 ms apart cause only one state change', async () => {
    const { userId } = await createVerifiedUser(ctx)
    const eventId = uniqueEventId()
    const payload = makeStripeSubscriptionEvent(eventId, 'customer.subscription.created', {
      status: 'active',
      current_period_end: Math.floor(Date.now() / 1000) + 86_400 * 30,
      metadata: { cairn_user_id: userId },
    })
    const body = JSON.stringify(payload)
    const sig = makeStripeSignature(body, stripeWebhookSecret(ctx))

    // Simulate two deliveries 10 ms apart with the same event id.
    const [r1, r2] = await Promise.all([
      new Promise<Awaited<ReturnType<typeof sendStripe>>>((resolve) => {
        void sendStripe(body, sig).then(resolve)
      }),
      new Promise<Awaited<ReturnType<typeof sendStripe>>>((resolve) => {
        setTimeout(() => void sendStripe(body, sig).then(resolve), 10)
      }),
    ])
    expect(r1.statusCode).toBe(200)
    expect(r2.statusCode).toBe(200)

    // Exactly one webhook_event row.
    const rows = await ctx.handle.db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.externalId, eventId))
    expect(rows).toHaveLength(1)

    // Exactly one subscription row updated to 'pro'.
    const subs = await ctx.handle.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
    expect(subs).toHaveLength(1)
    expect(subs[0]?.entitlement).toBe('pro')
  })

  it('hammer: 200 concurrent deliveries of the same event → exactly one webhook_event row', async () => {
    const eventId = uniqueEventId()
    const payload = makeStripeSubscriptionEvent(eventId, 'customer.subscription.updated', {
      status: 'active',
      metadata: {},
    })
    const body = JSON.stringify(payload)
    // Pre-compute signature so all 200 requests use the same timestamp.
    const sig = makeStripeSignature(body, stripeWebhookSecret(ctx))

    const results = await Promise.all(
      Array.from({ length: 200 }, () =>
        postRaw(ctx.app, '/webhooks/stripe', body, { 'stripe-signature': sig }),
      ),
    )

    // All responses must be 200 (idempotent success).
    expect(results.every((r) => r.statusCode === 200)).toBe(true)

    // Exactly one row in webhook_event for this event id.
    const rows = await ctx.handle.db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.externalId, eventId))
    expect(rows).toHaveLength(1)
  })

  it('subscription arrives BEFORE checkout callback — eventual consistency', async () => {
    // Scenario: the /billing/checkout callback has NOT been called yet, but
    // Stripe fires the webhook first. The webhook handler must create the
    // subscription row so a subsequent /billing/status check sees 'pro'.
    const { userId } = await createVerifiedUser(ctx)

    // Confirm no subscription row exists yet.
    const before = await ctx.handle.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
    expect(before).toHaveLength(0)

    // Webhook fires first with cairn_user_id in metadata.
    const payload = makeStripeSubscriptionEvent(uniqueEventId(), 'customer.subscription.created', {
      status: 'active',
      current_period_end: Math.floor(Date.now() / 1000) + 86_400 * 30,
      metadata: { cairn_user_id: userId },
    })
    const body = JSON.stringify(payload)
    const res = await sendStripe(body)
    expect(res.statusCode).toBe(200)

    // Subscription row must now exist with entitlement = 'pro'.
    const after = await ctx.handle.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
    expect(after).toHaveLength(1)
    expect(after[0]?.entitlement).toBe('pro')
  })

  it('audit_log receives a row for each processed Stripe event', async () => {
    const { userId } = await createVerifiedUser(ctx)
    const eventId = uniqueEventId()
    const payload = makeStripeSubscriptionEvent(eventId, 'customer.subscription.created', {
      status: 'active',
      metadata: { cairn_user_id: userId },
    })
    const body = JSON.stringify(payload)
    await sendStripe(body)

    const rows = await ctx.handle.db.select().from(auditLog)
    const webhookRow = rows.find((r) => r.event === `webhook.stripe.customer.subscription.created`)
    expect(webhookRow).toBeDefined()
    expect(webhookRow?.severity).toBe('info')
  })
})

// ── Razorpay webhook ──────────────────────────────────────────────────────────────────

describe('POST /webhooks/razorpay', () => {
  it('accepts a validly-signed event (happy path)', async () => {
    const payload = makeRazorpaySubscriptionEvent('subscription.activated', {
      status: 'active',
      notes: {},
    })
    const body = JSON.stringify(payload)
    const res = await sendRazorpay(body)
    expect(res.statusCode).toBe(200)
    expect((res.json() as { data: { received: boolean } }).data.received).toBe(true)
  })

  it('rejects a tampered signature with 400', async () => {
    const payload = makeRazorpaySubscriptionEvent('subscription.activated', { notes: {} })
    const body = JSON.stringify(payload)
    const res = await sendRazorpay(body, 'deadbeefdeadbeef')
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects a missing x-razorpay-signature header with 400', async () => {
    const body = JSON.stringify(makeRazorpaySubscriptionEvent('subscription.activated', {}))
    const res = await postRaw(ctx.app, '/webhooks/razorpay', body, {})
    expect(res.statusCode).toBe(400)
  })

  it('idempotency: same event body delivered twice → one webhook_event row', async () => {
    // Razorpay uses the event type + payment entity id as dedup key.
    // For subscription events without payment, we use the event type string.
    const payload = makeRazorpaySubscriptionEvent('subscription.activated', {
      status: 'active',
      notes: {},
    })
    const body = JSON.stringify(payload)
    const sig = makeRazorpaySignature(body, razorpayWebhookSecret(ctx))

    const first = await sendRazorpay(body, sig)
    expect(first.statusCode).toBe(200)
    expect((first.json() as { data: { duplicate: boolean } }).data.duplicate).toBe(false)

    const second = await sendRazorpay(body, sig)
    expect(second.statusCode).toBe(200)
    expect((second.json() as { data: { duplicate: boolean } }).data.duplicate).toBe(true)

    const rows = await ctx.handle.db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.provider, 'razorpay'))
    expect(rows).toHaveLength(1)
  })

  it('hammer: 200 concurrent deliveries → exactly one webhook_event row', async () => {
    const payload = makeRazorpaySubscriptionEvent('subscription.charged', {
      status: 'active',
      notes: {},
    })
    const body = JSON.stringify(payload)
    const sig = makeRazorpaySignature(body, razorpayWebhookSecret(ctx))

    const results = await Promise.all(
      Array.from({ length: 200 }, () =>
        postRaw(ctx.app, '/webhooks/razorpay', body, { 'x-razorpay-signature': sig }),
      ),
    )
    expect(results.every((r) => r.statusCode === 200)).toBe(true)

    const rows = await ctx.handle.db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.provider, 'razorpay'))
    expect(rows).toHaveLength(1)
  })

  it('subscription.activated → entitlement set to pro', async () => {
    const { userId } = await createVerifiedUser(ctx)
    const payload = makeRazorpaySubscriptionEvent('subscription.activated', {
      status: 'active',
      notes: { cairn_user_id: userId },
    })
    const body = JSON.stringify(payload)
    await sendRazorpay(body)

    const subs = await ctx.handle.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
    expect(subs).toHaveLength(1)
    expect(subs[0]?.entitlement).toBe('pro')
  })

  it('subscription.cancelled → entitlement reverted to free', async () => {
    const { userId } = await createVerifiedUser(ctx)

    // First activate.
    const activatePayload = makeRazorpaySubscriptionEvent('subscription.activated', {
      notes: { cairn_user_id: userId },
    })
    await sendRazorpay(JSON.stringify(activatePayload))

    // Then cancel with different body (so it's a different dedup key).
    const cancelPayload = makeRazorpaySubscriptionEvent('subscription.cancelled', {
      notes: { cairn_user_id: userId },
    })
    const cancelBody = JSON.stringify(cancelPayload)
    const cancelSig = makeRazorpaySignature(cancelBody, razorpayWebhookSecret(ctx))
    await sendRazorpay(cancelBody, cancelSig)

    const subs = await ctx.handle.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
    expect(subs[0]?.entitlement).toBe('free')
  })
})

// ── Admin audit-log ───────────────────────────────────────────────────────────────────

describe('GET /admin/audit-log', () => {
  it('returns recent audit rows with a valid admin token', async () => {
    // Emit an audit row by sending a valid Stripe webhook.
    const { userId } = await createVerifiedUser(ctx)
    const body = JSON.stringify(
      makeStripeSubscriptionEvent(uniqueEventId(), 'customer.subscription.created', {
        status: 'active',
        metadata: { cairn_user_id: userId },
      }),
    )
    await sendStripe(body)

    const res = await getWithAuth(ctx.app, '/admin/audit-log', ctx.env.ADMIN_TOKEN)
    expect(res.statusCode).toBe(200)
    const entries = (res.json() as { data: { entries: unknown[] } }).data.entries
    expect(entries.length).toBeGreaterThan(0)
  })

  it('returns 401 with a wrong admin token', async () => {
    const res = await getWithAuth(
      ctx.app,
      '/admin/audit-log',
      'wrong-token-' + randomBytes(16).toString('hex'),
    )
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 with no token', async () => {
    const res = await getWithAuth(ctx.app, '/admin/audit-log')
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 when ADMIN_TOKEN env var is not configured', async () => {
    // To test this we build a fresh app without ADMIN_TOKEN.
    const { resetEnvCache, loadEnv } = await import('../../src/env')
    const { buildApp } = await import('../../src/app')
    const { createDb } = await import('../../src/db/client')
    const { runMigrations } = await import('../../src/db/migrate')
    const { MemoryEmailProvider } = await import('../../src/email')
    const { MemoryRateLimitStore } = await import('../../src/lib/rate-limit')

    resetEnvCache()
    const env = loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://cairn:cairn@localhost:5432/cairn',
      PASSWORD_PEPPER: randomBytes(32).toString('hex'),
      JWT_SECRET: randomBytes(32).toString('hex'),
      EMAIL_PROVIDER: 'memory',
      COOKIE_SECURE: 'false',
      CORS_ORIGINS: '',
      STRIPE_SECRET_KEY: `sk_test_${randomBytes(12).toString('hex')}`,
      STRIPE_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
      RAZORPAY_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
      // Deliberately omit ADMIN_TOKEN.
    })
    const handle = createDb(env.DATABASE_URL, { max: 2, onnotice: () => {} })
    await runMigrations(handle.sql)
    const app = await buildApp({
      env,
      db: handle.db,
      emailProvider: new MemoryEmailProvider(),
      rateLimitStore: new MemoryRateLimitStore(),
    })
    await app.ready()

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/audit-log',
        headers: { authorization: 'Bearer anything' },
      })
      expect(res.statusCode).toBe(404)
    } finally {
      await app.close()
      await handle.close()
    }
  })
})

// ── Output-schema contract ────────────────────────────────────────────────────────────

/**
 * Webhook + admin responses are served through `sendValidated`; these assertions parse
 * the live responses through the same output schemas to make schema drift a tested
 * error (this stage's no-slop footer), not only a runtime 500.
 */
describe('output-schema contract', () => {
  it('webhook acks conform to webhookAckSchema (fresh + duplicate)', async () => {
    const body = JSON.stringify(
      makeStripeSubscriptionEvent(uniqueEventId(), 'customer.subscription.updated', {
        status: 'active',
        metadata: {},
      }),
    )
    const sig = makeStripeSignature(body, stripeWebhookSecret(ctx))

    const fresh = await sendStripe(body, sig)
    expect(() => webhookAckSchema.parse((fresh.json() as { data: unknown }).data)).not.toThrow()

    const duplicate = await sendStripe(body, sig)
    expect(() => webhookAckSchema.parse((duplicate.json() as { data: unknown }).data)).not.toThrow()
  })

  it('admin audit-log response conforms to auditLogOutputSchema', async () => {
    const { userId } = await createVerifiedUser(ctx)
    await sendStripe(
      JSON.stringify(
        makeStripeSubscriptionEvent(uniqueEventId(), 'customer.subscription.created', {
          status: 'active',
          metadata: { cairn_user_id: userId },
        }),
      ),
    )

    const res = await getWithAuth(ctx.app, '/admin/audit-log', ctx.env.ADMIN_TOKEN)
    expect(res.statusCode).toBe(200)
    expect(() => auditLogOutputSchema.parse((res.json() as { data: unknown }).data)).not.toThrow()
  })
})
