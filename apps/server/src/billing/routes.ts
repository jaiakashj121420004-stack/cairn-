import { ERROR_CODES } from '@cairn/shared-types'
import {
  billingStatusOutputSchema,
  cancelInputSchema,
  cancelOutputSchema,
  checkoutInputSchema,
  checkoutOutputSchema,
} from '@cairn/shared-zod'
import { eq } from 'drizzle-orm'
import { resolveEntitlement } from '../auth/entitlement'
import { authedUser, makeRequireAuth, requireVerifiedEmail } from '../auth/middleware'
import { subscriptions, users } from '../db/schema'
import { AppError } from '../lib/errors'
import { parseBody, sendError, sendValidated, toAppError } from '../lib/http'
import { featuresForPlan, planForEntitlement } from './plans'
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
}

/** The state a client sees for a subscription (a subset of the §20.5 machine for now). */
function deriveState(
  entitlement: 'free' | 'trial' | 'pro',
): 'free' | 'trial' | 'active' | 'past_due' | 'canceled' {
  if (entitlement === 'trial') return 'trial'
  if (entitlement === 'pro') return 'active'
  return 'free'
}

export function registerBillingRoutes(app: FastifyInstance, deps: BillingRouteDeps): void {
  const { db, env, billingProviders } = deps
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

  // GET /billing/status — canonical plan/state read; no provider call.
  app.get('/billing/status', guards, async (req, reply) => {
    try {
      const userId = authedUser(req).userId
      const entitlement = await resolveEntitlement(db, userId)
      const plan = planForEntitlement(entitlement)

      const rows = await db
        .select({ currentPeriodEnd: subscriptions.currentPeriodEnd })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1)

      sendValidated(reply, billingStatusOutputSchema, {
        plan,
        state: deriveState(entitlement),
        features: [...featuresForPlan(plan)],
        current_period_end: rows[0]?.currentPeriodEnd?.toISOString() ?? null,
      })
    } catch (err) {
      sendError(reply, toAppError(err))
    }
  })

  // POST /billing/checkout — start a hosted checkout for the Pro plan.
  app.post('/billing/checkout', guards, async (req, reply) => {
    try {
      const userId = authedUser(req).userId
      const input = parseBody(checkoutInputSchema, req.body)
      const provider = providerOrThrow(input.provider)

      const userRows = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
      const email = userRows[0]?.email
      if (!email) throw new AppError(ERROR_CODES.NOT_FOUND, 'user not found')

      // Reuse a known provider customer id when the same provider already issued one.
      const subRows = await db
        .select({
          provider: subscriptions.provider,
          providerCustomerId: subscriptions.providerCustomerId,
        })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1)
      const existing = subRows[0]
      const customerId =
        existing?.provider === input.provider
          ? (existing.providerCustomerId ?? undefined)
          : undefined

      const { url } = await provider.createCheckout({
        userId,
        email,
        plan: input.plan,
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
