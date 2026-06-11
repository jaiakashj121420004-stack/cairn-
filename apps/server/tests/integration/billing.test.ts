import { randomBytes } from 'node:crypto'
import {
  billingStatusOutputSchema,
  cancelOutputSchema,
  checkoutOutputSchema,
} from '@cairn/shared-zod'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { subscriptions } from '../../src/db/schema'
import {
  createTestContext,
  createVerifiedUser,
  getWithAuth,
  postJson,
  resetState,
  teardown,
} from './helpers'
import type {
  BillingProvider,
  CancelWhen,
  CheckoutInput,
  PortalInput,
} from '../../src/billing/provider'
import type { TestContext } from './helpers'

/**
 * Billing integration tests (CLAUDE.md §20). A fake `BillingProvider` is injected so no
 * real Stripe/Razorpay network call is ever made (Stage 3 prompt requirement). The
 * canonical subscription state is read straight off the `subscription` table.
 */

/** Records every call and returns canned hosted URLs — never touches the network. */
class FakeBillingProvider implements BillingProvider {
  readonly name: 'stripe' | 'razorpay'
  readonly checkouts: CheckoutInput[] = []
  readonly portals: PortalInput[] = []
  readonly cancels: Array<{ id: string; when: CancelWhen }> = []

  constructor(name: 'stripe' | 'razorpay') {
    this.name = name
  }

  createCustomer(): Promise<{ customerId: string }> {
    return Promise.resolve({ customerId: 'cus_fake' })
  }
  createCheckout(input: CheckoutInput): Promise<{ url: string }> {
    this.checkouts.push(input)
    return Promise.resolve({ url: `https://provider.test/${this.name}/checkout/abc` })
  }
  openPortal(input: PortalInput): Promise<{ url: string }> {
    this.portals.push(input)
    return Promise.resolve({ url: `https://provider.test/${this.name}/portal/abc` })
  }
  cancelSubscription(subscriptionId: string, when: CancelWhen): Promise<void> {
    this.cancels.push({ id: subscriptionId, when })
    return Promise.resolve()
  }
  verifyWebhook(): never {
    throw new Error('verifyWebhook is exercised by the webhook tests, not here')
  }
}

let ctx: TestContext
let stripe: FakeBillingProvider

beforeAll(async () => {
  stripe = new FakeBillingProvider('stripe')
  ctx = await createTestContext({ billingProviders: { stripe } })
})
afterAll(async () => {
  await teardown(ctx)
})
beforeEach(async () => {
  await resetState(ctx)
  stripe.checkouts.length = 0
  stripe.portals.length = 0
  stripe.cancels.length = 0
})

function bearer(token: string): string {
  return `Bearer ${token}`
}

// ── Status ────────────────────────────────────────────────────────────────────────────

describe('GET /billing/status', () => {
  it('reports the free plan for a user with no subscription', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await getWithAuth(ctx.app, '/billing/status', accessToken)
    expect(res.statusCode).toBe(200)
    const data = res.json().data as {
      plan: string
      state: string
      features: string[]
      current_period_end: null
    }
    expect(data.plan).toBe('free')
    expect(data.state).toBe('free')
    expect(data.features).toContain('rule_engine')
    expect(data.features).not.toContain('cloud_sync')
    expect(data.current_period_end).toBeNull()
    expect(() => billingStatusOutputSchema.parse(data)).not.toThrow()
  })

  it('reports the pro plan + active state once a subscription is active', async () => {
    const { accessToken, userId } = await createVerifiedUser(ctx)
    const periodEnd = new Date(Date.now() + 30 * 86_400_000)
    await ctx.handle.db.insert(subscriptions).values({
      userId,
      entitlement: 'pro',
      status: 'active',
      currentPeriodEnd: periodEnd,
      provider: 'stripe',
      providerCustomerId: 'cus_1',
      providerSubscriptionId: 'sub_1',
    })

    const res = await getWithAuth(ctx.app, '/billing/status', accessToken)
    const data = res.json().data as {
      plan: string
      state: string
      features: string[]
      current_period_end: string
    }
    expect(data.plan).toBe('pro')
    expect(data.state).toBe('active')
    expect(data.features).toContain('cloud_sync')
    expect(data.current_period_end).toBe(periodEnd.toISOString())
    expect(() => billingStatusOutputSchema.parse(data)).not.toThrow()
  })

  it('requires auth (401) and verified email (403)', async () => {
    const noAuth = await getWithAuth(ctx.app, '/billing/status')
    expect(noAuth.statusCode).toBe(401)

    const email = `u-${randomBytes(6).toString('hex')}@example.com`
    await postJson(ctx.app, '/auth/signup', { email, password: 'correct horse battery staple' })
    const login = await postJson(ctx.app, '/auth/login', {
      email,
      password: 'correct horse battery staple',
    })
    const unverified: string = login.json().data.accessToken
    const res = await getWithAuth(ctx.app, '/billing/status', unverified)
    expect(res.statusCode).toBe(403)
  })
})

// ── Checkout ──────────────────────────────────────────────────────────────────────────

describe('POST /billing/checkout', () => {
  it('returns the provider checkout url and forwards the user id + email', async () => {
    const { accessToken, userId, email } = await createVerifiedUser(ctx)
    const res = await postJson(
      ctx.app,
      '/billing/checkout',
      { country: 'US', plan: 'pro' },
      bearer(accessToken),
    )
    expect(res.statusCode).toBe(200)
    const data = res.json().data as { url: string }
    expect(data.url).toContain('https://provider.test/stripe/checkout')
    expect(() => checkoutOutputSchema.parse(data)).not.toThrow()

    expect(stripe.checkouts).toHaveLength(1)
    expect(stripe.checkouts[0]?.userId).toBe(userId)
    expect(stripe.checkouts[0]?.email).toBe(email)
    expect(stripe.checkouts[0]?.plan).toBe('pro')
    // Interval defaults to monthly; country US routes to Stripe (non-IN).
    expect(stripe.checkouts[0]?.interval).toBe('monthly')

    // A trial subscription row is seeded before the redirect so Pro works immediately.
    const seeded = await ctx.handle.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
    expect(seeded[0]?.status).toBe('trial')
    expect(seeded[0]?.entitlement).toBe('trial')
    expect(seeded[0]?.billingRegion).toBe('US')
  })

  it('defaults the plan to pro when omitted', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await postJson(
      ctx.app,
      '/billing/checkout',
      { country: 'US' },
      bearer(accessToken),
    )
    expect(res.statusCode).toBe(200)
    expect(stripe.checkouts[0]?.plan).toBe('pro')
    expect(stripe.checkouts[0]?.interval).toBe('monthly')
  })

  it('routes IN to Razorpay and returns 501 when that gateway is not configured', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await postJson(
      ctx.app,
      '/billing/checkout',
      { country: 'IN' },
      bearer(accessToken),
    )
    expect(res.statusCode).toBe(501)
    expect(res.json().error.code).toBe('NOT_IMPLEMENTED')
  })

  it('rejects an invalid country code with 400', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await postJson(
      ctx.app,
      '/billing/checkout',
      { country: 'USA' },
      bearer(accessToken),
    )
    expect(res.statusCode).toBe(400)
  })
})

// ── Portal ────────────────────────────────────────────────────────────────────────────

describe('POST /billing/portal', () => {
  it('opens the portal for a user with a known provider customer', async () => {
    const { accessToken, userId } = await createVerifiedUser(ctx)
    await ctx.handle.db.insert(subscriptions).values({
      userId,
      entitlement: 'pro',
      provider: 'stripe',
      providerCustomerId: 'cus_42',
      providerSubscriptionId: 'sub_42',
    })

    const res = await postJson(ctx.app, '/billing/portal', {}, bearer(accessToken))
    expect(res.statusCode).toBe(200)
    expect((res.json().data as { url: string }).url).toContain('/stripe/portal/')
    expect(stripe.portals[0]?.customerId).toBe('cus_42')
  })

  it('returns 404 when the user has no billing customer', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await postJson(ctx.app, '/billing/portal', {}, bearer(accessToken))
    expect(res.statusCode).toBe(404)
  })
})

// ── Cancel ────────────────────────────────────────────────────────────────────────────

describe('POST /billing/cancel', () => {
  it('cancels at period end by default and forwards the provider subscription id', async () => {
    const { accessToken, userId } = await createVerifiedUser(ctx)
    await ctx.handle.db.insert(subscriptions).values({
      userId,
      entitlement: 'pro',
      provider: 'stripe',
      providerCustomerId: 'cus_9',
      providerSubscriptionId: 'sub_9',
    })

    const res = await postJson(ctx.app, '/billing/cancel', {}, bearer(accessToken))
    expect(res.statusCode).toBe(200)
    const data = res.json().data as { scheduled: string }
    expect(data.scheduled).toBe('period_end')
    expect(() => cancelOutputSchema.parse(data)).not.toThrow()
    expect(stripe.cancels[0]).toEqual({ id: 'sub_9', when: 'period_end' })
  })

  it('cancels immediately when when=now', async () => {
    const { accessToken, userId } = await createVerifiedUser(ctx)
    await ctx.handle.db.insert(subscriptions).values({
      userId,
      entitlement: 'pro',
      provider: 'stripe',
      providerSubscriptionId: 'sub_now',
    })
    const res = await postJson(ctx.app, '/billing/cancel', { when: 'now' }, bearer(accessToken))
    expect(res.statusCode).toBe(200)
    expect(stripe.cancels[0]).toEqual({ id: 'sub_now', when: 'now' })
  })

  it('returns 404 when there is no active subscription', async () => {
    const { accessToken } = await createVerifiedUser(ctx)
    const res = await postJson(ctx.app, '/billing/cancel', {}, bearer(accessToken))
    expect(res.statusCode).toBe(404)
    // The provider must not be called when there's nothing to cancel.
    expect(stripe.cancels).toHaveLength(0)
  })
})
