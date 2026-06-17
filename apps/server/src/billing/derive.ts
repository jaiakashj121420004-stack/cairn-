import { planForEntitlement } from './plans'
import type { PlanId } from './plans'
import type { EntitlementValue, SubscriptionStatus } from '../db/schema'
import type { Entitlement } from '@cairn/shared-types'

/**
 * Pure subscription derivation (CLAUDE.md §20.1, §20.5).
 *
 * One function turns a stored subscription row + the current time into the effective
 * `{ plan, entitlement, state }` the rest of the app reads. Centralising it means the
 * auth-token path, the {@link EntitlementService}, and `GET /billing/status` can never
 * disagree about whether a user is entitled.
 *
 * Lazy expiry: a `past_due` row past its grace window, or a `trial` past its deadline,
 * or a `canceled` row past its period end, all decay to `free` here — so a user loses
 * access the moment the window closes, even before the grace-sweep job persists the
 * terminal `canceled` status (§20.5).
 */

/** The client-visible billing state (matches `billingStatusOutputSchema.state`). */
export type BillingState = 'free' | 'trial' | 'active' | 'past_due' | 'canceled'

/** The minimal subscription row shape this derivation needs. */
export interface SubscriptionRow {
  readonly entitlement: EntitlementValue
  readonly status: SubscriptionStatus
  readonly currentPeriodEnd: Date | null
  readonly graceUntil: Date | null
  readonly trialEndsAt: Date | null
}

export interface DerivedSubscription {
  readonly plan: PlanId
  readonly entitlement: Entitlement
  readonly state: BillingState
  readonly currentPeriodEnd: Date | null
  readonly trialEndsAt: Date | null
}

const FREE: DerivedSubscription = {
  plan: 'free',
  entitlement: 'free',
  state: 'free',
  currentPeriodEnd: null,
  trialEndsAt: null,
}

function lapsed(at: Date | null, now: number): boolean {
  return at !== null && at.getTime() <= now
}

/**
 * Derive the effective subscription for `row` at time `now` (epoch ms). A null row
 * (the user never subscribed) is `free`.
 */
export function deriveSubscription(row: SubscriptionRow | null, now: number): DerivedSubscription {
  if (!row) return FREE

  switch (row.status) {
    case 'trial': {
      // A trial grants Pro features until its deadline, then decays to free.
      if (lapsed(row.trialEndsAt, now)) {
        return { ...FREE, state: 'canceled', trialEndsAt: row.trialEndsAt }
      }
      return {
        plan: 'pro',
        entitlement: 'trial',
        state: 'trial',
        currentPeriodEnd: row.currentPeriodEnd,
        trialEndsAt: row.trialEndsAt,
      }
    }
    case 'active': {
      // Active is provider-confirmed paid; a passed period end just rolls (the renewal
      // or failure webhook moves the state). We do not lapse `active` on the clock.
      return {
        plan: 'pro',
        entitlement: 'pro',
        state: 'active',
        currentPeriodEnd: row.currentPeriodEnd,
        trialEndsAt: null,
      }
    }
    case 'past_due': {
      // Pro access continues through the hard-grace window, then decays to free.
      if (lapsed(row.graceUntil, now)) {
        return { ...FREE, state: 'canceled', currentPeriodEnd: row.currentPeriodEnd }
      }
      return {
        plan: 'pro',
        entitlement: 'pro',
        state: 'past_due',
        currentPeriodEnd: row.currentPeriodEnd,
        trialEndsAt: null,
      }
    }
    case 'canceled': {
      // Cancellation at period end keeps Pro until the period closes (§20.5, §20.8).
      if (!lapsed(row.currentPeriodEnd, now) && row.currentPeriodEnd !== null) {
        return {
          plan: planForEntitlement('pro'),
          entitlement: 'pro',
          state: 'canceled',
          currentPeriodEnd: row.currentPeriodEnd,
          trialEndsAt: null,
        }
      }
      return { ...FREE, state: 'canceled', currentPeriodEnd: row.currentPeriodEnd }
    }
    default: {
      // Exhaustive: SubscriptionStatus has no other members.
      const exhaustive: never = row.status
      return exhaustive
    }
  }
}
