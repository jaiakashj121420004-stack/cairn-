/**
 * Fixed-window rate limiting (CLAUDE.md §2.13, §18.5).
 *
 * Auth endpoints are limited per-IP *and* per-identifier (email) with different
 * windows, so a single keying strategy is not enough — handlers call `consume()`
 * once per key. The store is injectable: an in-process `MemoryRateLimitStore` is the
 * default (and is all the integration tests need), and a Redis-backed store can be
 * dropped in for multi-instance production (CLAUDE.md §3.1b) without touching callers.
 */

export interface RateLimitDecision {
  readonly allowed: boolean
  /** Requests remaining in the current window (0 when blocked). */
  readonly remaining: number
  /** Seconds until the window resets — surfaced as `Retry-After`. */
  readonly retryAfterSeconds: number
}

export interface RateLimitStore {
  /**
   * Register one hit against `key` within a `windowMs` window. Returns the running
   * count and the window's reset time (epoch ms). Implementations must be atomic
   * per key.
   */
  hit(key: string, windowMs: number, now: number): Promise<{ count: number; resetAt: number }>
}

interface Bucket {
  count: number
  resetAt: number
}

/** In-process fixed-window store. Single-instance only; swap for Redis to scale out. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>()

  async hit(
    key: string,
    windowMs: number,
    now: number,
  ): Promise<{ count: number; resetAt: number }> {
    const existing = this.buckets.get(key)
    if (!existing || now >= existing.resetAt) {
      const fresh: Bucket = { count: 1, resetAt: now + windowMs }
      this.buckets.set(key, fresh)
      return { count: fresh.count, resetAt: fresh.resetAt }
    }
    existing.count += 1
    return { count: existing.count, resetAt: existing.resetAt }
  }

  /** Drop a key (test helper / administrative reset). */
  reset(key?: string): void {
    if (key === undefined) this.buckets.clear()
    else this.buckets.delete(key)
  }
}

export interface RateLimitRule {
  /** Max hits allowed within the window. */
  readonly limit: number
  /** Window length in milliseconds. */
  readonly windowMs: number
}

/** Common windows expressed as milliseconds for readability at call sites. */
export const MINUTES_15 = 15 * 60 * 1000
export const HOUR = 60 * 60 * 1000

export class RateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    /** Injected clock for deterministic tests; defaults to wall time. */
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Count one request against `key` under `rule`. The first `rule.limit` calls in a
   * window are allowed; the next is blocked. The caller decides what to do on block
   * (typically return 429 and stop processing).
   */
  async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const now = this.now()
    const { count, resetAt } = await this.store.hit(key, rule.windowMs, now)
    const allowed = count <= rule.limit
    const remaining = Math.max(0, rule.limit - count)
    const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000))
    return { allowed, remaining, retryAfterSeconds }
  }
}
