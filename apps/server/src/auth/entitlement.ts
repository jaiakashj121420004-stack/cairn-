import { eq } from 'drizzle-orm'
import { subscriptions } from '../db/schema'
import type { Db } from '../db/client'
import type { Entitlement } from '@cairn/shared-types'

/**
 * Resolve a user's current entitlement (CLAUDE.md §2.14, §20).
 *
 * Single source of truth: the `subscription` table. No row ⇒ `free`. An entitlement
 * whose paid/trial period (plus grace) has lapsed decays to `free`. This is the only
 * place entitlement is computed; routes embed the result in the access token rather
 * than scattering `plan === 'pro'` checks. The full `EntitlementService` (Redis
 * cache, billing webhooks) lands in Stage 6 — this is the contract it will satisfy.
 */
export async function resolveEntitlement(db: Db, userId: string): Promise<Entitlement> {
  const rows = await db
    .select({
      entitlement: subscriptions.entitlement,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      graceUntil: subscriptions.graceUntil,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1)

  const sub = rows[0]
  if (!sub || sub.entitlement === 'free') return 'free'

  const now = Date.now()
  // The effective expiry is the later of the period end and any grace window.
  const periodEnd = sub.currentPeriodEnd?.getTime() ?? null
  const graceEnd = sub.graceUntil?.getTime() ?? null
  const effectiveEnd = Math.max(periodEnd ?? 0, graceEnd ?? 0)

  // If neither bound is set we treat the entitlement as active (e.g. lifetime/comped);
  // otherwise it must not have lapsed.
  if (effectiveEnd === 0) return sub.entitlement
  return effectiveEnd > now ? sub.entitlement : 'free'
}
