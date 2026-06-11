import { ERROR_CODES } from '@cairn/shared-types'
import { AppError } from '../lib/errors'
import type { SubscriptionStatus } from '../db/schema'

/**
 * Subscription state machine (CLAUDE.md §20.5).
 *
 * A subscription is always in exactly one of `trial | active | past_due | canceled`.
 * Transitions are explicit and total: every (status, event) pair either maps to a
 * defined next status or throws {@link AppError} with `ILLEGAL_STATE`. This module is
 * pure — no DB, no clock — so the whole graph is unit-tested in isolation; the webhook
 * dispatcher and the grace sweep call {@link transition} and persist the result inside a
 * transaction (§20.4).
 *
 * Self-loops are deliberate no-ops (idempotent), because providers redeliver and emit
 * repeat events: a second `payment_succeeded` on an already-`active` subscription must
 * not be an error. Only transitions the §20.5 graph forbids throw.
 *
 * The graph:
 *   trial    --payment_succeeded--> active
 *   trial    --payment_failed-----> past_due
 *   trial    --grace_expired------> canceled   (trial lapsed without a payment)
 *   trial    --canceled-----------> canceled
 *   active   --payment_succeeded--> active      (renewal; no-op)
 *   active   --payment_failed-----> past_due
 *   active   --canceled-----------> canceled
 *   past_due --payment_succeeded--> active      (recovered)
 *   past_due --payment_failed-----> past_due    (still failing; no-op)
 *   past_due --grace_expired------> canceled    (14-day hard grace elapsed)
 *   past_due --canceled-----------> canceled
 *   canceled --payment_succeeded--> active      (reactivation of the same sub)
 *   *        --refunded-----------> canceled    (immediate revoke, §20.7)
 *   canceled --canceled / refunded> canceled    (no-op)
 */

/** Lifecycle events that drive a transition. Provider events normalise to these. */
export type BillingEventKind =
  | 'payment_succeeded' // Stripe invoice.paid · Razorpay subscription.charged
  | 'payment_failed' // Stripe invoice.payment_failed
  | 'canceled' // explicit cancellation · subscription.deleted/cancelled/expired
  | 'grace_expired' // the 14-day hard-grace timer fired (sweep job)
  | 'refunded' // a refund webhook (§20.7) — revoke immediately

const TRANSITIONS: Readonly<
  Record<SubscriptionStatus, Partial<Record<BillingEventKind, SubscriptionStatus>>>
> = {
  trial: {
    payment_succeeded: 'active',
    payment_failed: 'past_due',
    grace_expired: 'canceled',
    canceled: 'canceled',
    refunded: 'canceled',
  },
  active: {
    payment_succeeded: 'active',
    payment_failed: 'past_due',
    canceled: 'canceled',
    refunded: 'canceled',
  },
  past_due: {
    payment_succeeded: 'active',
    payment_failed: 'past_due',
    grace_expired: 'canceled',
    canceled: 'canceled',
    refunded: 'canceled',
  },
  canceled: {
    // A new successful payment on a cancelled subscription is a reactivation.
    payment_succeeded: 'active',
    canceled: 'canceled',
    refunded: 'canceled',
  },
}

/**
 * Compute the next status for `(from, event)`, or throw `ILLEGAL_STATE` if the §20.5
 * graph forbids it (e.g. a `payment_failed` arriving on a `canceled` subscription).
 * Total over the input domain: never returns `undefined`.
 */
export function transition(from: SubscriptionStatus, event: BillingEventKind): SubscriptionStatus {
  const next = TRANSITIONS[from][event]
  if (next === undefined) {
    throw new AppError(
      ERROR_CODES.ILLEGAL_STATE,
      `illegal subscription transition: ${from} --${event}-->`,
      { from, event },
    )
  }
  return next
}

/** True when `(from, event)` is a permitted transition (does not throw). */
export function canTransition(from: SubscriptionStatus, event: BillingEventKind): boolean {
  return TRANSITIONS[from][event] !== undefined
}
