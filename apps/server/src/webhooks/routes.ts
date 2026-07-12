import { createHmac } from 'node:crypto'
import { ERROR_CODES } from '@cairn/shared-types'
import { eq } from 'drizzle-orm'
import Stripe from 'stripe'
import { applyLifecycleEvent, seedSubscription } from '../billing/apply'
import { verifyDodoSignature } from '../billing/dodo-signature'
import { subscriptions, webhookEvents } from '../db/schema'
import { appendAudit } from '../lib/audit'
import { webhookAckSchema } from '../lib/contracts'
import { timingSafeEqualHex } from '../lib/crypto-random'
import { AppError } from '../lib/errors'
import { sendError, sendValidated, toAppError } from '../lib/http'
import { webhookReceivedTotal } from '../telemetry/metrics'
import type { LifecycleEvent } from '../billing/apply'
import type { EntitlementService } from '../billing/entitlement-service'
import type { Db } from '../db/client'
import type { WebhookProvider } from '../db/schema'
import type { Env } from '../env'
import type { FastifyInstance } from 'fastify'

/**
 * Billing webhook endpoints (CLAUDE.md §2.13, §2.14, §20.4, §20.5).
 *
 * Both Stripe and Razorpay require raw-body access for HMAC signature verification.
 * These routes are registered inside a scoped Fastify plugin that replaces the default
 * JSON parser with a Buffer parser — so `req.body` is a Buffer here.
 *
 * Order of operations per delivery (§20.4):
 *   1. Verify the signature before any DB read. A bad signature ⇒ 400, no state change.
 *   2. Dedupe via `webhook_event(provider, external_id)` — a duplicate ⇒ 200, no replay.
 *   3. Record a receipt audit row, then dispatch the event through the §20.5 state
 *      machine (`applyLifecycleEvent`) or the provider-authoritative seed path.
 *   4. Invalidate the affected user's entitlement cache so gates are immediately
 *      consistent rather than waiting out the cache TTL.
 *
 * Lifecycle transitions that the §20.5 graph forbids throw `ILLEGAL_STATE`; the
 * dispatcher records a warning audit row and still acks 200, because re-delivering a
 * structurally-impossible event will never succeed (retrying it forever helps nobody).
 */

export interface WebhookRouteDeps {
  readonly db: Db
  readonly env: Env
  readonly entitlements: EntitlementService
}

export function registerWebhookRoutes(app: FastifyInstance, deps: WebhookRouteDeps): void {
  const { db, env, entitlements } = deps

  void app.register(async (webhookApp) => {
    webhookApp.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => {
        done(null, body)
      },
    )

    // ── Stripe ─────────────────────────────────────────────────────────────────

    webhookApp.post('/webhooks/stripe', { config: { rateLimit: false } }, async (req, reply) => {
      try {
        if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
          throw new AppError(ERROR_CODES.NOT_IMPLEMENTED, 'stripe webhooks not configured')
        }

        const rawBody = req.body as Buffer
        const sig = req.headers['stripe-signature']
        if (typeof sig !== 'string') {
          throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'missing stripe-signature header')
        }

        const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
          apiVersion: '2025-02-24.acacia' as const,
        })

        let event: Stripe.Event
        try {
          event = stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET)
        } catch {
          throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'invalid stripe webhook signature')
        }

        const inserted = await db
          .insert(webhookEvents)
          .values({
            provider: 'stripe',
            externalId: event.id,
            eventType: event.type,
            payload: event as unknown as Record<string, unknown>,
          })
          .onConflictDoNothing()
          .returning({ id: webhookEvents.id })

        if (inserted.length === 0) {
          webhookReceivedTotal.add(1, { provider: 'stripe', outcome: 'duplicate' })
          sendValidated(reply, webhookAckSchema, { received: true, duplicate: true })
          return
        }

        await appendAudit(db, {
          event: `webhook.stripe.${event.type}`,
          severity: 'info',
          detail: { provider: 'stripe', event_id: event.id, event_type: event.type },
        })

        const userId = await dispatchStripeEvent(db, event)
        if (userId) await entitlements.invalidate(userId)

        webhookReceivedTotal.add(1, { provider: 'stripe', outcome: 'accepted' })
        sendValidated(reply, webhookAckSchema, { received: true, duplicate: false })
      } catch (err) {
        sendError(reply, toAppError(err))
      }
    })

    // ── Razorpay ───────────────────────────────────────────────────────────────

    webhookApp.post('/webhooks/razorpay', { config: { rateLimit: false } }, async (req, reply) => {
      try {
        if (!env.RAZORPAY_WEBHOOK_SECRET) {
          throw new AppError(ERROR_CODES.NOT_IMPLEMENTED, 'razorpay webhooks not configured')
        }

        const rawBody = req.body as Buffer
        const sig = req.headers['x-razorpay-signature']
        if (typeof sig !== 'string') {
          throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'missing x-razorpay-signature header')
        }

        const expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
          .update(rawBody)
          .digest('hex')
        if (!timingSafeEqualHex(sig, expected)) {
          throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'invalid razorpay webhook signature')
        }

        let parsed: RazorpayWebhookEvent
        try {
          parsed = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookEvent
        } catch {
          throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'invalid webhook body')
        }

        const externalId = parsed.payload?.payment?.entity?.id ?? parsed.event

        const inserted = await db
          .insert(webhookEvents)
          .values({
            provider: 'razorpay',
            externalId,
            eventType: parsed.event,
            payload: parsed as unknown as Record<string, unknown>,
          })
          .onConflictDoNothing()
          .returning({ id: webhookEvents.id })

        if (inserted.length === 0) {
          webhookReceivedTotal.add(1, { provider: 'razorpay', outcome: 'duplicate' })
          sendValidated(reply, webhookAckSchema, { received: true, duplicate: true })
          return
        }

        await appendAudit(db, {
          event: `webhook.razorpay.${parsed.event}`,
          severity: 'info',
          detail: { provider: 'razorpay', event_type: parsed.event, external_id: externalId },
        })

        const userId = await dispatchRazorpayEvent(db, parsed)
        if (userId) await entitlements.invalidate(userId)

        webhookReceivedTotal.add(1, { provider: 'razorpay', outcome: 'accepted' })
        sendValidated(reply, webhookAckSchema, { received: true, duplicate: false })
      } catch (err) {
        sendError(reply, toAppError(err))
      }
    })

    // ── Dodo Payments ────────────────────────────────────────────────────────────
    //
    // Dodo follows the Standard Webhooks spec: three headers (`webhook-id`,
    // `webhook-timestamp`, `webhook-signature`) and an HMAC-SHA256 over
    // `${id}.${timestamp}.${body}` (verified by `verifyDodoSignature`, §2.13). The
    // `webhook-id` is Dodo's own unique delivery id, so it is the idempotency external id.

    webhookApp.post('/webhooks/dodo', { config: { rateLimit: false } }, async (req, reply) => {
      try {
        if (!env.DODO_WEBHOOK_SECRET) {
          throw new AppError(ERROR_CODES.NOT_IMPLEMENTED, 'dodo webhooks not configured')
        }

        const rawBody = req.body as Buffer
        // Signature (+ timestamp tolerance) verified BEFORE any DB read (§20.4). A bad or
        // missing signature throws VALIDATION_FAILED ⇒ 400 with no state change.
        const { id: externalId } = verifyDodoSignature(
          rawBody,
          req.headers,
          env.DODO_WEBHOOK_SECRET,
        )

        let parsed: DodoWebhookEvent
        try {
          parsed = JSON.parse(rawBody.toString('utf8')) as DodoWebhookEvent
        } catch {
          throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'invalid webhook body')
        }
        const eventType = parsed.type ?? 'unknown'

        const inserted = await db
          .insert(webhookEvents)
          .values({
            provider: 'dodo',
            externalId,
            eventType,
            payload: parsed as unknown as Record<string, unknown>,
          })
          .onConflictDoNothing()
          .returning({ id: webhookEvents.id })

        if (inserted.length === 0) {
          webhookReceivedTotal.add(1, { provider: 'dodo', outcome: 'duplicate' })
          sendValidated(reply, webhookAckSchema, { received: true, duplicate: true })
          return
        }

        await appendAudit(db, {
          event: `webhook.dodo.${eventType}`,
          severity: 'info',
          detail: { provider: 'dodo', event_type: eventType, external_id: externalId },
        })

        const userId = await dispatchDodoEvent(db, parsed)
        if (userId) await entitlements.invalidate(userId)

        webhookReceivedTotal.add(1, { provider: 'dodo', outcome: 'accepted' })
        sendValidated(reply, webhookAckSchema, { received: true, duplicate: false })
      } catch (err) {
        sendError(reply, toAppError(err))
      }
    })
  })
}

// ── Shared helpers ─────────────────────────────────────────────────────────────────────

/** Convert a provider unix timestamp (seconds) to a Date, or null. */
function unixToDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) ? new Date(seconds * 1000) : null
}

/**
 * Run a lifecycle transition, swallowing an `ILLEGAL_STATE` into a warning audit row so
 * the webhook still acks (a forbidden event is never made valid by retrying). Returns the
 * affected user id for cache invalidation, or null when nothing changed.
 */
async function runLifecycle(
  db: Db,
  input: {
    userId: string
    event: LifecycleEvent
    provider: WebhookProvider
    providerSubscriptionId?: string | null
    currentPeriodEnd?: Date | null
  },
): Promise<string> {
  try {
    await applyLifecycleEvent(db, input)
  } catch (err) {
    if (err instanceof AppError && err.code === ERROR_CODES.ILLEGAL_STATE) {
      await appendAudit(db, {
        event: 'billing.illegal_transition',
        severity: 'warning',
        userId: input.userId,
        detail: { provider: input.provider, event: input.event, reason: err.message },
      })
      return input.userId
    }
    throw err
  }
  return input.userId
}

/** Resolve a Cairn user id from a metadata hint, else by provider subscription/customer id. */
async function resolveStripeUser(
  db: Db,
  hint: { userId?: string | null; subscriptionId?: string | null; customerId?: string | null },
): Promise<string | null> {
  if (hint.userId) return hint.userId
  if (hint.subscriptionId) {
    const rows = await db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.providerSubscriptionId, hint.subscriptionId))
      .limit(1)
    if (rows[0]) return rows[0].userId
  }
  if (hint.customerId) {
    const rows = await db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.providerCustomerId, hint.customerId))
      .limit(1)
    if (rows[0]) return rows[0].userId
  }
  return null
}

// ── Stripe event dispatcher ──────────────────────────────────────────────────────────

/** Returns the affected user id (for cache invalidation), or null if the event was ignored. */
async function dispatchStripeEvent(db: Db, event: Stripe.Event): Promise<string | null> {
  // Switch on the raw type string so newer event names (e.g. `refund.created`) that may
  // not be in this SDK version's literal union still compile; payloads are cast below.
  switch (event.type as string) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata['cairn_user_id']
      if (!userId) return null
      const periodEnd = unixToDate(sub.current_period_end)
      const customerId =
        typeof sub.customer === 'string' ? sub.customer : (sub.customer?.id ?? null)

      // Stripe's status is authoritative for the entry / direct status changes.
      if (sub.status === 'trialing') {
        await seedSubscription(db, {
          userId,
          status: 'trial',
          provider: 'stripe',
          providerCustomerId: customerId,
          providerSubscriptionId: sub.id,
          currentPeriodEnd: periodEnd,
          trialEndsAt: unixToDate(sub.trial_end),
        })
        return userId
      }
      if (sub.status === 'active') {
        await seedSubscription(db, {
          userId,
          status: 'active',
          provider: 'stripe',
          providerCustomerId: customerId,
          providerSubscriptionId: sub.id,
          currentPeriodEnd: periodEnd,
        })
        return userId
      }
      if (sub.status === 'past_due' || sub.status === 'unpaid') {
        return runLifecycle(db, {
          userId,
          event: 'payment_failed',
          provider: 'stripe',
          providerSubscriptionId: sub.id,
          currentPeriodEnd: periodEnd,
        })
      }
      if (sub.status === 'canceled') {
        return runLifecycle(db, {
          userId,
          event: 'canceled',
          provider: 'stripe',
          providerSubscriptionId: sub.id,
          currentPeriodEnd: periodEnd,
        })
      }
      return userId
    }

    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | { id?: string } | null
        subscription_details?: { metadata?: Record<string, string> | null } | null
      }
      const subscriptionId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : (invoice.subscription?.id ?? null)
      const userId = await resolveStripeUser(db, {
        userId: invoice.subscription_details?.metadata?.['cairn_user_id'] ?? null,
        subscriptionId,
      })
      if (!userId) return null
      return runLifecycle(db, {
        userId,
        event: 'payment_succeeded',
        provider: 'stripe',
        providerSubscriptionId: subscriptionId,
        currentPeriodEnd: unixToDate(invoice.lines.data[0]?.period?.end ?? invoice.period_end),
      })
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | { id?: string } | null
        subscription_details?: { metadata?: Record<string, string> | null } | null
      }
      const subscriptionId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : (invoice.subscription?.id ?? null)
      const userId = await resolveStripeUser(db, {
        userId: invoice.subscription_details?.metadata?.['cairn_user_id'] ?? null,
        subscriptionId,
      })
      if (!userId) return null
      return runLifecycle(db, {
        userId,
        event: 'payment_failed',
        provider: 'stripe',
        providerSubscriptionId: subscriptionId,
      })
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata['cairn_user_id']
      if (!userId) return null
      return runLifecycle(db, {
        userId,
        event: 'canceled',
        provider: 'stripe',
        providerSubscriptionId: sub.id,
        currentPeriodEnd: unixToDate(sub.current_period_end),
      })
    }

    case 'charge.refunded':
    case 'refund.created': {
      const obj = event.data.object as {
        customer?: string | { id?: string } | null
        metadata?: Record<string, string> | null
      }
      const customerId =
        typeof obj.customer === 'string' ? obj.customer : (obj.customer?.id ?? null)
      const userId = await resolveStripeUser(db, {
        userId: obj.metadata?.['cairn_user_id'] ?? null,
        customerId,
      })
      if (!userId) return null
      return runLifecycle(db, { userId, event: 'refunded', provider: 'stripe' })
    }

    default:
      // Audit-logged by the caller; no state change.
      return null
  }
}

// ── Razorpay event dispatcher ────────────────────────────────────────────────────────

async function dispatchRazorpayEvent(db: Db, event: RazorpayWebhookEvent): Promise<string | null> {
  const entity = event.payload.subscription?.entity
  const userId = entity?.notes?.['cairn_user_id'] ?? null
  const subId = entity?.id ?? null
  const periodEnd = unixToDate(entity?.current_end)

  switch (event.event) {
    case 'subscription.activated': {
      if (!userId) return null
      await seedSubscription(db, {
        userId,
        status: 'active',
        provider: 'razorpay',
        providerSubscriptionId: subId,
        currentPeriodEnd: periodEnd,
      })
      return userId
    }
    case 'subscription.charged': {
      if (!userId) return null
      return runLifecycle(db, {
        userId,
        event: 'payment_succeeded',
        provider: 'razorpay',
        providerSubscriptionId: subId,
        currentPeriodEnd: periodEnd,
      })
    }
    case 'subscription.pending':
    case 'subscription.halted': {
      if (!userId) return null
      return runLifecycle(db, {
        userId,
        event: 'payment_failed',
        provider: 'razorpay',
        providerSubscriptionId: subId,
        currentPeriodEnd: periodEnd,
      })
    }
    case 'subscription.cancelled': {
      if (!userId) return null
      return runLifecycle(db, {
        userId,
        event: 'canceled',
        provider: 'razorpay',
        providerSubscriptionId: subId,
        currentPeriodEnd: periodEnd,
      })
    }
    case 'subscription.expired': {
      if (!userId) return null
      return runLifecycle(db, {
        userId,
        event: 'canceled',
        provider: 'razorpay',
        providerSubscriptionId: subId,
      })
    }
    case 'refund.created':
    case 'refund.processed': {
      if (!userId) return null
      return runLifecycle(db, { userId, event: 'refunded', provider: 'razorpay' })
    }
    default:
      return null
  }
}

// ── Dodo event dispatcher ────────────────────────────────────────────────────────────

/** Convert a provider ISO-8601 datetime string to a Date, or null. */
function isoToDate(value: string | null | undefined): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Resolve a Cairn user id from the metadata hint, else by provider subscription/customer id. */
async function resolveDodoUser(
  db: Db,
  hint: { userId?: string | null; subscriptionId?: string | null; customerId?: string | null },
): Promise<string | null> {
  if (hint.userId) return hint.userId
  if (hint.subscriptionId) {
    const rows = await db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.providerSubscriptionId, hint.subscriptionId))
      .limit(1)
    if (rows[0]) return rows[0].userId
  }
  if (hint.customerId) {
    const rows = await db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.providerCustomerId, hint.customerId))
      .limit(1)
    if (rows[0]) return rows[0].userId
  }
  return null
}

/**
 * Map a verified Dodo webhook to the internal lifecycle (§20.5, docs/billing.md §8):
 *   subscription.active               → seed active (entry)
 *   subscription.renewed              → payment_succeeded
 *   subscription.on_hold / .failed    → payment_failed
 *   subscription.cancelled / .expired → canceled
 *   refund.succeeded                  → refunded (immediate revoke)
 * Returns the affected user id (for cache invalidation), or null if the event was ignored.
 */
async function dispatchDodoEvent(db: Db, event: DodoWebhookEvent): Promise<string | null> {
  const data = event.data ?? {}
  const subId = data.subscription_id ?? null
  const customerId = data.customer?.customer_id ?? null
  const metadataUserId = data.metadata?.['cairn_user_id'] ?? null
  const periodEnd = isoToDate(data.next_billing_date)

  switch (event.type) {
    case 'subscription.active': {
      const userId = await resolveDodoUser(db, {
        userId: metadataUserId,
        subscriptionId: subId,
        customerId,
      })
      if (!userId) return null
      await seedSubscription(db, {
        userId,
        status: 'active',
        provider: 'dodo',
        providerCustomerId: customerId,
        providerSubscriptionId: subId,
        currentPeriodEnd: periodEnd,
      })
      return userId
    }
    case 'subscription.renewed': {
      const userId = await resolveDodoUser(db, {
        userId: metadataUserId,
        subscriptionId: subId,
        customerId,
      })
      if (!userId) return null
      return runLifecycle(db, {
        userId,
        event: 'payment_succeeded',
        provider: 'dodo',
        providerSubscriptionId: subId,
        currentPeriodEnd: periodEnd,
      })
    }
    case 'subscription.on_hold':
    case 'subscription.failed': {
      const userId = await resolveDodoUser(db, {
        userId: metadataUserId,
        subscriptionId: subId,
        customerId,
      })
      if (!userId) return null
      return runLifecycle(db, {
        userId,
        event: 'payment_failed',
        provider: 'dodo',
        providerSubscriptionId: subId,
        currentPeriodEnd: periodEnd,
      })
    }
    case 'subscription.cancelled':
    case 'subscription.expired': {
      const userId = await resolveDodoUser(db, {
        userId: metadataUserId,
        subscriptionId: subId,
        customerId,
      })
      if (!userId) return null
      return runLifecycle(db, {
        userId,
        event: 'canceled',
        provider: 'dodo',
        providerSubscriptionId: subId,
        currentPeriodEnd: periodEnd,
      })
    }
    case 'refund.succeeded': {
      const userId = await resolveDodoUser(db, {
        userId: metadataUserId,
        subscriptionId: subId,
        customerId,
      })
      if (!userId) return null
      return runLifecycle(db, { userId, event: 'refunded', provider: 'dodo' })
    }
    default:
      // Audit-logged by the caller; no state change.
      return null
  }
}

// ── Local types ──────────────────────────────────────────────────────────────────────

/** Minimal shape of a Dodo (Standard Webhooks) event payload we consume (§20.4). */
interface DodoWebhookEvent {
  type?: string
  data?: {
    payload_type?: string
    subscription_id?: string
    customer?: { customer_id?: string }
    metadata?: Record<string, string>
    next_billing_date?: string
  }
}

/** Minimal shape of a Razorpay webhook event payload. */
interface RazorpayWebhookEvent {
  event: string
  payload: {
    subscription?: {
      entity: {
        id?: string
        notes?: Record<string, string>
        status?: string
        current_end?: number
      }
    }
    payment?: {
      entity?: { id?: string }
    }
  }
}
