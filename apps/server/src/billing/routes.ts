import { ERROR_CODES } from '@cairn/shared-types'
import {
  billingStatusOutputSchema,
  cancelInputSchema,
  cancelOutputSchema,
  checkoutInputSchema,
  checkoutOutputSchema,
} from '@cairn/shared-zod'
import { eq } from 'drizzle-orm'
import { authedUser, makeRequireAuth, requireVerifiedEmail } from '../auth/middleware'
import { subscriptions, users } from '../db/schema'
import { AppError } from '../lib/errors'
import { parseBody, sendError, sendValidated, toAppError } from '../lib/http'
import { seedSubscription } from './apply'
import { deriveSubscription } from './derive'
import { featuresForPlan } from './plans'
import type { EntitlementService } from './entitlement-service'
import type { BillingProviders } from './provider'
import type { Db } from '../db/client'
import type { Env } from '../env'
import type { BillingProviderName } from '@cairn/shared-zod'
import type { FastifyInstance } from 'fastify'

/**
 * Billing surface (CLAUDE.md §20). All routes require auth + verified email.
 *
 * The canonical subscription state lives in the `subscription` table, written by the
 * webhook receivers; `/billing/status` reads it directly and never calls a provider in
 * the hot path (§2.14). `/billing/checkout|portal|cancel` delegate to the configured
 * {@link BillingProvider}. Providers are injected so tests use a fake and never hit the
 * network (§ Stage 3 prompt: "NO real Stripe/Razorpay calls").
 */

export interface BillingRouteDeps {
  readonly db: Db
  readonly env: Env
  readonly billingProviders: BillingProviders
  readonly entitlements: EntitlementService
}

/** Days of free trial seeded at checkout (CLAUDE.md §2.14, §20.5). */
const TRIAL_DAYS = 14
const DAY_MS = 86_400_000

/**
 * Select the regional gateway from the checkout country (CLAUDE.md §3.1d, §20.6):
 * India routes to Razorpay (UPI / INR / GST); everywhere else to Stripe (Stripe Tax).
 */
function providerForCountry(country: string): BillingProviderName {
  return country === 'IN' ? 'razorpay' : 'stripe'
}

export function registerBillingRoutes(app: FastifyInstance, deps: BillingRouteDeps): void {
  const { db, env, billingProviders, entitlements } = deps
  const requireAuth = makeRequireAuth(env)
  const guards = { preHandler: [requireAuth, requireVerifiedEmail] }

  /** Resolve a configured provider or fail with a clean error. */
  function providerOrThrow(name: BillingProviderName) {
    const provider = billingProviders[name]
    if (!provider)
      throw new AppError(
        ERROR_CODES.NOT_IMPLEMENTED,
        `billing provider '${name}' is not configured`,
      )
    return provider
  }

  // GET /billing/status — canonical plan/state read; no provider call (§2.14).
  app.get('/billing/status', guards, async (req, reply) => {
    try {
      const userId = authedUser(req).userId
      const rows = await db
        .select({
          entitlement: subscriptions.entitlement,
          status: subscriptions.status,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          graceUntil: subscriptions.graceUntil,
          trialEndsAt: subscriptions.trialEndsAt,
        })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1)

      const derived = deriveSubscription(rows[0] ?? null, Date.now())

      sendValidated(reply, billingStatusOutputSchema, {
        plan: derived.plan,
        state: derived.state,
        features: [...featuresForPlan(derived.plan)],
        current_period_end: derived.currentPeriodEnd?.toISOString() ?? null,
      })
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })

  // POST /billing/checkout — country-routed hosted checkout for the Pro plan.
  //
  // The client sends its country (geo-detected); the server picks the gateway (IN ⇒
  // Razorpay, else Stripe — §20.6) so the renderer never names a provider (§20.9). A
  // trial subscription row is seeded *before* the redirect so Pro features work during
  // the round-trip without a race against the webhook (CLAUDE.md §2.14); the webhook
  // later fills the real provider subscription id and converts trial → active.
  app.post('/billing/checkout', guards, async (req, reply) => {
    try {
      const userId = authedUser(req).userId
      const input = parseBody(checkoutInputSchema, req.body)
      const providerName = providerForCountry(input.country)
      const provider = providerOrThrow(providerName)

      const userRows = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
      const email = userRows[0]?.email
      if (!email) throw new AppError(ERROR_CODES.NOT_FOUND, 'user not found')

      // Inspect the current subscription: reuse a same-provider customer id, and decide
      // whether to seed a fresh trial (only when the user is not already entitled).
      const subRows = await db
        .select({
          entitlement: subscriptions.entitlement,
          status: subscriptions.status,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          graceUntil: subscriptions.graceUntil,
          trialEndsAt: subscriptions.trialEndsAt,
          provider: subscriptions.provider,
          providerCustomerId: subscriptions.providerCustomerId,
        })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1)
      const existing = subRows[0]
      const customerId =
        existing?.provider === providerName
          ? (existing.providerCustomerId ?? undefined)
          : undefined

      // Seed a trial only for users with no live entitlement (new / lapsed / cancelled),
      // so we never downgrade an active or in-flight subscription back to trial.
      const derived = deriveSubscription(existing ?? null, Date.now())
      if (derived.entitlement === 'free') {
        await seedSubscription(db, {
          userId,
          status: 'trial',
          provider: providerName,
          providerCustomerId: customerId ?? null,
          trialEndsAt: new Date(Date.now() + TRIAL_DAYS * DAY_MS),
          billingRegion: input.country,
        })
        // Make the trial entitlement effective immediately, not after the cache TTL.
        await entitlements.invalidate(userId)
      }

      const { url } = await provider.createCheckout({
        userId,
        email,
        plan: input.plan,
        interval: input.interval,
        successUrl: env.BILLING_SUCCESS_URL ?? `${env.APP_URL}/billing/success`,
        cancelUrl: env.BILLING_CANCEL_URL ?? `${env.APP_URL}/billing/cancel`,
        ...(customerId ? { customerId } : {}),
      })

      sendValidated(reply, checkoutOutputSchema, { url })
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })

  // POST /billing/portal — open the provider's customer portal.
  app.post('/billing/portal', guards, async (req, reply) => {
    try {
      const userId = authedUser(req).userId
      const rows = await db
        .select({
          provider: subscriptions.provider,
          providerCustomerId: subscriptions.providerCustomerId,
        })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1)

      const sub = rows[0]
      if (!sub?.provider || !sub.providerCustomerId) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'no billing customer for this user')
      }
      const provider = providerOrThrow(sub.provider)

      const { url } = await provider.openPortal({
        customerId: sub.providerCustomerId,
        returnUrl: env.BILLING_PORTAL_RETURN_URL ?? `${env.APP_URL}/settings/billing`,
      })

      sendValidated(reply, checkoutOutputSchema, { url })
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })

  // POST /billing/cancel — schedule (or immediately apply) cancellation.
  app.post('/billing/cancel', guards, async (req, reply) => {
    try {
      const userId = authedUser(req).userId
      const input = parseBody(cancelInputSchema, req.body)

      const rows = await db
        .select({
          provider: subscriptions.provider,
          providerSubscriptionId: subscriptions.providerSubscriptionId,
        })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1)

      const sub = rows[0]
      if (!sub?.provider || !sub.providerSubscriptionId) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'no active subscription to cancel')
      }
      const provider = providerOrThrow(sub.provider)

      // Apply at the provider; the resulting webhook is the source of truth that
      // flips entitlement back to free (§20.5). We do not optimistically mutate here.
      await provider.cancelSubscription(sub.providerSubscriptionId, input.when)

      sendValidated(reply, cancelOutputSchema, { scheduled: input.when })
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })
}
