import { eq } from 'drizzle-orm'
import { subscriptions } from '../db/schema'
import { deriveSubscription } from './derive'
import { planHasFeature } from './plans'
import type { BillingState, DerivedSubscription } from './derive'
import type { Feature, PlanId } from './plans'
import type { Db } from '../db/client'

/**
 * Entitlement service (CLAUDE.md §20.1).
 *
 * The single source of truth for "is user X entitled to feature Y". Every paid-feature
 * gate routes through {@link EntitlementService.canUse} — never a scattered
 * `plan === 'pro'` check (§2.14). State is read from the canonical `subscription` table
 * (written by the webhook receivers) and derived with {@link deriveSubscription}; a hot
 * path never calls a provider API (§2.14).
 *
 * Caching: a read is cached for {@link DEFAULT_TTL_SECONDS} to keep gates cheap. The
 * cache is injectable — an in-process {@link MemoryEntitlementCache} is the default and
 * is all the tests need; a Redis (Upstash) implementation drops in for multi-instance
 * production without touching callers (mirrors the rate-limit store, CLAUDE.md §3.1b).
 * On every webhook state change the receiver calls {@link EntitlementService.invalidate}
 * so a user's entitlement is consistent immediately rather than after the TTL. In a
 * multi-instance deployment the Redis cache implements `invalidate` as a pub/sub publish
 * that evicts the key on every node; the in-memory default simply drops the local key.
 */

export const DEFAULT_TTL_SECONDS = 60

/** A user's current plan snapshot (CLAUDE.md §20.1). */
export interface PlanSnapshot {
  readonly plan: PlanId
  readonly state: BillingState
  /** ISO-8601, or null when there is no bounded period (free / lifetime). */
  readonly currentPeriodEnd: string | null
  /** ISO-8601 trial deadline, or null when not on trial. */
  readonly trialEndsAt: string | null
}

/**
 * Pluggable entitlement cache. Implementations must expire entries after `ttlSeconds`
 * and evict on {@link invalidate}. Keyed by user id.
 */
export interface EntitlementCache {
  get(userId: string): Promise<DerivedSubscription | undefined>
  set(userId: string, value: DerivedSubscription, ttlSeconds: number): Promise<void>
  invalidate(userId: string): Promise<void>
}

interface CacheEntry {
  readonly value: DerivedSubscription
  readonly expiresAt: number
}

/** In-process TTL cache. Single-instance only; swap for Redis to scale out. */
export class MemoryEntitlementCache implements EntitlementCache {
  private readonly entries = new Map<string, CacheEntry>()

  get(userId: string): Promise<DerivedSubscription | undefined> {
    const entry = this.entries.get(userId)
    if (!entry) return Promise.resolve(undefined)
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(userId)
      return Promise.resolve(undefined)
    }
    return Promise.resolve(entry.value)
  }

  set(userId: string, value: DerivedSubscription, ttlSeconds: number): Promise<void> {
    this.entries.set(userId, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
    return Promise.resolve()
  }

  invalidate(userId: string): Promise<void> {
    this.entries.delete(userId)
    return Promise.resolve()
  }

  /** Drop everything (test helper / administrative reset). */
  clear(): void {
    this.entries.clear()
  }
}

export interface EntitlementServiceOptions {
  readonly cache?: EntitlementCache
  readonly ttlSeconds?: number
}

export class EntitlementService {
  private readonly db: Db
  private readonly cache: EntitlementCache
  private readonly ttlSeconds: number

  constructor(db: Db, opts: EntitlementServiceOptions = {}) {
    this.db = db
    this.cache = opts.cache ?? new MemoryEntitlementCache()
    this.ttlSeconds = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS
  }

  /** The one feature gate. True iff `userId`'s current plan includes `feature`. */
  async canUse(userId: string, feature: Feature): Promise<boolean> {
    const derived = await this.resolve(userId)
    return planHasFeature(derived.plan, feature)
  }

  /** The user's current plan + lifecycle state (CLAUDE.md §20.1). */
  async currentPlan(userId: string): Promise<PlanSnapshot> {
    const derived = await this.resolve(userId)
    return {
      plan: derived.plan,
      state: derived.state,
      currentPeriodEnd: derived.currentPeriodEnd?.toISOString() ?? null,
      trialEndsAt: derived.trialEndsAt?.toISOString() ?? null,
    }
  }

  /** Whole days left in a trial, or null when the user is not on trial. */
  async trialDaysRemaining(userId: string): Promise<number | null> {
    const derived = await this.resolve(userId)
    if (derived.state !== 'trial' || derived.trialEndsAt === null) return null
    const ms = derived.trialEndsAt.getTime() - Date.now()
    return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000)
  }

  /** The user's lifecycle state (CLAUDE.md §20.5). */
  async state(userId: string): Promise<BillingState> {
    return (await this.resolve(userId)).state
  }

  /** Evict a user's cached entitlement. Called by webhook receivers on state change. */
  async invalidate(userId: string): Promise<void> {
    await this.cache.invalidate(userId)
  }

  /** Read-through: cache hit, or query + derive + cache. */
  private async resolve(userId: string): Promise<DerivedSubscription> {
    const cached = await this.cache.get(userId)
    if (cached) return cached

    const rows = await this.db
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
    await this.cache.set(userId, derived, this.ttlSeconds)
    return derived
  }
}
