import { eq } from 'drizzle-orm'
import { deriveSubscription } from '../billing/derive'
import { subscriptions } from '../db/schema'
import type { Db } from '../db/client'
import type { Entitlement } from '@cairn/shared-types'

/**
 * Resolve a user's current entitlement for the access token (CLAUDE.md §2.14, §20).
 *
 * Single source of truth: the `subscription` table, derived through the shared
 * {@link deriveSubscription} (the same function {@link EntitlementService} and
 * `GET /billing/status` use, so the token, the gates, and the status endpoint can never
 * disagree). No row ⇒ `free`. A lapsed trial / grace / cancelled period decays to
 * `free`. This is the only place the token's entitlement is computed; routes embed the
 * result rather than scattering `plan === 'pro'` checks.
 */
export async function resolveEntitlement(db: Db, userId: string): Promise<Entitlement> {
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

  return deriveSubscription(rows[0] ?? null, Date.now()).entitlement
}
