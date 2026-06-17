import { and, eq, isNotNull, lte, or } from 'drizzle-orm'
import { subscriptions } from '../db/schema'
import { appendAudit } from '../lib/audit'
import { transition } from './state-machine'
import type { BillingEventKind } from './state-machine'
import type { Db } from '../db/client'
import type { EntitlementValue, SubscriptionStatus, WebhookProvider } from '../db/schema'

/**
 * Subscription mutations (CLAUDE.md §20.4, §20.5).
 *
 * The webhook receivers normalise provider events to two operations here:
 *   - {@link seedSubscription} for the entry events (`subscription.created`/`activated`),
 *     where the provider's own status (trialing vs active) is authoritative.
 *   - {@link applyLifecycleEvent} for the lifecycle events (`invoice.*`, cancellation,
 *     refund), which run through the §20.5 {@link transition} graph and throw
 *     `ILLEGAL_STATE` on a forbidden move.
 *
 * Every mutation runs in a transaction, takes a row lock to serialise concurrent
 * deliveries, and writes a `billing.state_change` audit row (§20.4). Entitlement-cache
 * invalidation is the caller's job (it happens after the transaction commits).
 */

/** Hard grace after a failed renewal before Pro access is revoked (CLAUDE.md §20.5). */
export const HARD_GRACE_DAYS = 14
const DAY_MS = 86_400_000

/** Lifecycle events that drive a §20.5 transition (a subset re-uses the machine kinds). */
export type LifecycleEvent = BillingEventKind

export interface SeedInput {
  readonly userId: string
  /** Entry status from the provider — `trial` (trialing) or `active`. */
  readonly status: Extract<SubscriptionStatus, 'trial' | 'active'>
  readonly provider: WebhookProvider
  readonly providerCustomerId?: string | null
  readonly providerSubscriptionId?: string | null
  readonly currentPeriodEnd?: Date | null
  readonly trialEndsAt?: Date | null
  /** Region recorded at checkout that selected the gateway. */
  readonly billingRegion?: string | null
}

/**
 * Seed (or refresh) a subscription from a provider entry event. Idempotent upsert keyed
 * by user id. The provider status maps to the gating entitlement: `trial` ⇒ `trial`,
 * `active` ⇒ `pro`.
 */
export async function seedSubscription(db: Db, input: SeedInput): Promise<void> {
  const entitlement: EntitlementValue = input.status === 'trial' ? 'trial' : 'pro'
  const periodEnd = input.currentPeriodEnd ?? null
  const trialEndsAt = input.trialEndsAt ?? null
  await db.transaction(async (tx) => {
    await tx
      .insert(subscriptions)
      .values({
        userId: input.userId,
        entitlement,
        status: input.status,
        currentPeriodEnd: periodEnd,
        trialEndsAt,
        graceUntil: null,
        provider: input.provider,
        providerCustomerId: input.providerCustomerId ?? null,
        providerSubscriptionId: input.providerSubscriptionId ?? null,
        billingRegion: input.billingRegion ?? null,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          entitlement,
          status: input.status,
          currentPeriodEnd: periodEnd,
          trialEndsAt,
          graceUntil: null,
          provider: input.provider,
          providerCustomerId: input.providerCustomerId ?? null,
          providerSubscriptionId: input.providerSubscriptionId ?? null,
          ...(input.billingRegion ? { billingRegion: input.billingRegion } : {}),
          updatedAt: new Date(),
        },
      })
    await appendAudit(tx, {
      event: 'billing.seed',
      severity: 'info',
      userId: input.userId,
      detail: { provider: input.provider, status: input.status },
    })
  })
}

export interface LifecycleInput {
  readonly userId: string
  readonly event: LifecycleEvent
  readonly provider: WebhookProvider
  readonly providerSubscriptionId?: string | null
  /** The new period end (e.g. from a paid invoice or a cancel-at-period-end). */
  readonly currentPeriodEnd?: Date | null
  /** Override the clock — tests pass a fixed value; production omits it. */
  readonly now?: number
}

interface Effect {
  readonly status: SubscriptionStatus
  readonly entitlement: EntitlementValue
  readonly graceUntil: Date | null
  readonly currentPeriodEnd: Date | null
}

/** The status to assume when no row exists yet, so an out-of-order event is still legal. */
function impliedInitial(event: LifecycleEvent): SubscriptionStatus {
  return event === 'grace_expired' ? 'past_due' : 'active'
}

/** Map a resolved next status + event into the persisted entitlement / grace / period. */
function effectFor(
  next: SubscriptionStatus,
  event: LifecycleEvent,
  input: LifecycleInput,
  existingPeriodEnd: Date | null,
  now: number,
): Effect {
  const incomingPeriodEnd = input.currentPeriodEnd ?? existingPeriodEnd
  switch (next) {
    case 'active':
      return {
        status: 'active',
        entitlement: 'pro',
        graceUntil: null,
        currentPeriodEnd: incomingPeriodEnd,
      }
    case 'past_due':
      return {
        status: 'past_due',
        entitlement: 'pro',
        graceUntil: new Date(now + HARD_GRACE_DAYS * DAY_MS),
        currentPeriodEnd: incomingPeriodEnd,
      }
    case 'canceled': {
      // Refund and grace-expiry revoke immediately; an explicit cancellation keeps Pro
      // until the period end when one is in the future (cancel-at-period-end, §20.5/§20.8).
      const immediate =
        event === 'refunded' ||
        event === 'grace_expired' ||
        incomingPeriodEnd === null ||
        incomingPeriodEnd.getTime() <= now
      return immediate
        ? { status: 'canceled', entitlement: 'free', graceUntil: null, currentPeriodEnd: null }
        : {
            status: 'canceled',
            entitlement: 'pro',
            graceUntil: null,
            currentPeriodEnd: incomingPeriodEnd,
          }
    }
    case 'trial':
      // Lifecycle events never resolve to `trial`; preserve safety with a no-op effect.
      return {
        status: 'trial',
        entitlement: 'trial',
        graceUntil: null,
        currentPeriodEnd: incomingPeriodEnd,
      }
    default: {
      // Exhaustive: SubscriptionStatus has no other members.
      const exhaustive: never = next
      return exhaustive
    }
  }
}

/**
 * Apply a lifecycle event through the §20.5 state machine. Throws `ILLEGAL_STATE`
 * (rolling the transaction back) when the transition is forbidden. Returns the
 * `from → to` pair so the caller can log/observe.
 */
export async function applyLifecycleEvent(
  db: Db,
  input: LifecycleInput,
): Promise<{ from: SubscriptionStatus | null; to: SubscriptionStatus }> {
  const now = input.now ?? Date.now()
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, input.userId))
      .limit(1)
      .for('update')

    const existing = rows[0] ?? null
    const from = existing?.status ?? impliedInitial(input.event)
    const next = transition(from, input.event) // throws ILLEGAL_STATE if forbidden
    const effect = effectFor(next, input.event, input, existing?.currentPeriodEnd ?? null, now)

    if (existing) {
      await tx
        .update(subscriptions)
        .set({
          status: effect.status,
          entitlement: effect.entitlement,
          graceUntil: effect.graceUntil,
          currentPeriodEnd: effect.currentPeriodEnd,
          ...(input.providerSubscriptionId
            ? { providerSubscriptionId: input.providerSubscriptionId }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, input.userId))
    } else {
      await tx.insert(subscriptions).values({
        userId: input.userId,
        status: effect.status,
        entitlement: effect.entitlement,
        graceUntil: effect.graceUntil,
        currentPeriodEnd: effect.currentPeriodEnd,
        provider: input.provider,
        providerSubscriptionId: input.providerSubscriptionId ?? null,
      })
    }

    await appendAudit(tx, {
      event: 'billing.state_change',
      severity: input.event === 'refunded' ? 'warning' : 'info',
      userId: input.userId,
      detail: { from: existing?.status ?? null, to: effect.status, event: input.event },
    })

    return { from: existing?.status ?? null, to: effect.status }
  })
}

/**
 * Move every subscription whose trial deadline or hard-grace window has elapsed to
 * `canceled` (CLAUDE.md §20.5: `past_due → canceled` after 14-day hard grace). A cron
 * calls this; the integration suite calls it after advancing the clock. Returns the user
 * ids transitioned so the caller can invalidate their entitlement caches.
 */
export async function sweepExpiredGrace(db: Db, now: number = Date.now()): Promise<string[]> {
  const cutoff = new Date(now)
  const due = await db
    .select({ userId: subscriptions.userId, status: subscriptions.status })
    .from(subscriptions)
    .where(
      or(
        and(
          eq(subscriptions.status, 'past_due'),
          isNotNull(subscriptions.graceUntil),
          lte(subscriptions.graceUntil, cutoff),
        ),
        and(
          eq(subscriptions.status, 'trial'),
          isNotNull(subscriptions.trialEndsAt),
          lte(subscriptions.trialEndsAt, cutoff),
        ),
      ),
    )

  const swept: string[] = []
  for (const row of due) {
    await applyLifecycleEvent(db, {
      userId: row.userId,
      event: 'grace_expired',
      provider: 'stripe', // provider is immaterial for an internal expiry
      now,
    })
    swept.push(row.userId)
  }
  return swept
}
