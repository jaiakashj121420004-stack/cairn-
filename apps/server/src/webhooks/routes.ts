import { createHmac } from 'node:crypto'
import { ERROR_CODES } from '@cairn/shared-types'
import { eq } from 'drizzle-orm'
import Stripe from 'stripe'
import { subscriptions, webhookEvents } from '../db/schema'
import { appendAudit } from '../lib/audit'
import { webhookAckSchema } from '../lib/contracts'
import { timingSafeEqualHex } from '../lib/crypto-random'
import { AppError } from '../lib/errors'
import { sendError, sendValidated, toAppError } from '../lib/http'
import type { Db } from '../db/client'
import type { EntitlementValue } from '../db/schema'
import type { Env } from '../env'
import type { FastifyInstance } from 'fastify'

/**
 * Billing webhook endpoints (CLAUDE.md §2.13, §2.14).
 *
 * Both Stripe and Razorpay require raw-body access for HMAC signature verification.
 * These routes are registered inside a scoped Fastify plugin that replaces the
 * default JSON parser with a Buffer parser — so `req.body` is a Buffer here.
 *
 * Idempotency: every event is INSERT … ON CONFLICT DO NOTHING into `webhook_event`.
 * If the insert returns 0 rows, the event is a duplicate — we return 200 without
 * re-applying side effects. This handles concurrent duplicate deliveries safely at
 * the database level (the unique index is the dedup lock).
 *
 * State changes (subscription upserts) are keyed by `metadata.cairn_user_id` embedded
 * in the event — set by Cairn when creating the Stripe/Razorpay checkout session.
 */

export interface WebhookRouteDeps {
  readonly db: Db
  readonly env: Env
}

export function registerWebhookRoutes(app: FastifyInstance, deps: WebhookRouteDeps): void {
  const { db, env } = deps

  // Register webhook routes inside a scoped plugin so the content-type parser
  // override (raw Buffer) is isolated from the rest of the application.
  void app.register(async (webhookApp) => {
    // Override the default JSON parser for this scope only.
    // `parseAs: 'buffer'` means req.body is a Buffer, not a parsed object.
    webhookApp.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => {
        done(null, body)
      },
    )

    // ── Stripe ─────────────────────────────────────────────────────────────────

    // Webhook receivers opt out of the user-facing per-IP rate limit: deliveries
    // arrive from a provider's shared IPs and can legitimately burst (retries,
    // backfills). Abuse is already contained by HMAC signature verification and the
    // idempotency ledger — an unsigned or duplicate event never causes a state change.
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

        // Idempotency: insert or skip.
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
          // Duplicate delivery — return 200 without acting.
          sendValidated(reply, webhookAckSchema, { received: true, duplicate: true })
          return
        }

        await appendAudit(db, {
          event: `webhook.stripe.${event.type}`,
          severity: 'info',
          detail: { provider: 'stripe', event_id: event.id, event_type: event.type },
        })

        await dispatchStripeEvent(db, event)

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
          sendValidated(reply, webhookAckSchema, { received: true, duplicate: true })
          return
        }

        await appendAudit(db, {
          event: `webhook.razorpay.${parsed.event}`,
          severity: 'info',
          detail: { provider: 'razorpay', event_type: parsed.event, external_id: externalId },
        })

        await dispatchRazorpayEvent(db, parsed)

        sendValidated(reply, webhookAckSchema, { received: true, duplicate: false })
      } catch (err) {
        sendError(reply, toAppError(err))
      }
    })
  })
}

// ── Stripe event dispatcher ──────────────────────────────────────────────────────────

async function dispatchStripeEvent(db: Db, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata['cairn_user_id']
      if (!userId) return
      const entitlement = stripeStatusToEntitlement(sub.status)
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null
      const providerCustomerId =
        typeof sub.customer === 'string' ? sub.customer : (sub.customer?.id ?? null)
      await db
        .insert(subscriptions)
        .values({
          userId,
          entitlement,
          currentPeriodEnd: periodEnd,
          provider: 'stripe',
          providerCustomerId,
          providerSubscriptionId: sub.id,
        })
        .onConflictDoUpdate({
          target: subscriptions.userId,
          set: {
            entitlement,
            currentPeriodEnd: periodEnd,
            provider: 'stripe',
            providerCustomerId,
            providerSubscriptionId: sub.id,
            updatedAt: new Date(),
          },
        })
      return
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata['cairn_user_id']
      if (!userId) return
      await db
        .update(subscriptions)
        .set({ entitlement: 'free', currentPeriodEnd: null, updatedAt: new Date() })
        .where(eq(subscriptions.userId, userId))
      return
    }
    // All other events: already audit-logged by the caller; no state change.
  }
}

function stripeStatusToEntitlement(status: string): EntitlementValue {
  if (status === 'active') return 'pro'
  if (status === 'trialing') return 'trial'
  return 'free'
}

// ── Razorpay event dispatcher ────────────────────────────────────────────────────────

async function dispatchRazorpayEvent(db: Db, event: RazorpayWebhookEvent): Promise<void> {
  switch (event.event) {
    case 'subscription.activated':
    case 'subscription.charged': {
      const entity = event.payload.subscription?.entity
      const userId = entity?.notes?.['cairn_user_id']
      if (!userId) return
      const providerSubscriptionId = entity?.id ?? null
      await db
        .insert(subscriptions)
        .values({ userId, entitlement: 'pro', provider: 'razorpay', providerSubscriptionId })
        .onConflictDoUpdate({
          target: subscriptions.userId,
          set: {
            entitlement: 'pro',
            provider: 'razorpay',
            providerSubscriptionId,
            updatedAt: new Date(),
          },
        })
      return
    }
    case 'subscription.cancelled':
    case 'subscription.expired': {
      const userId = event.payload.subscription?.entity.notes?.['cairn_user_id']
      if (!userId) return
      await db
        .update(subscriptions)
        .set({ entitlement: 'free', updatedAt: new Date() })
        .where(eq(subscriptions.userId, userId))
      return
    }
  }
}

// ── Local types ──────────────────────────────────────────────────────────────────────

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
