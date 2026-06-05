/**
 * Push scheduler (CLAUDE.md §18.6, docs/sync-protocol.md §10).
 *
 * Single-flight (leaky-bucket): at most one push in flight; concurrent triggers
 * coalesce onto the running promise. Cadence is a self-rescheduling timer (default
 * 60 s); it also fires on window focus and on a manual `now()` (IPC `sync:now`).
 *
 * Failure handling:
 * - 5xx / network → exponential backoff with equal jitter, capped at 5 min, reset on
 *   the next success.
 * - 429 → wait the server's `Retry-After` (or the backoff delay if absent).
 * - non-401 4xx, or 401 surviving one refresh → PAUSE the automatic cadence; only a
 *   manual `now()` resumes it (a 400 just recurs; a 401 needs the user).
 *
 * Timers and randomness are injected so the backoff and rate-limit behaviour are
 * deterministically testable.
 */
import { SYNC_ERROR_CODES } from './types'
import type { Notify, PushOutcome, SyncLogger } from './types'

export type SyncTimerHandle = unknown

export interface SyncTimers {
  set(fn: () => void, ms: number): SyncTimerHandle
  clear(handle: SyncTimerHandle): void
}

const realTimers: SyncTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

export interface SyncRunnerOptions {
  readonly pushOnce: () => Promise<PushOutcome>
  readonly notify: Notify
  readonly log: SyncLogger
  /** Steady cadence between successful runs. Default 60 s. */
  readonly intervalMs?: number
  /** Exponential backoff base. Default 2 s. */
  readonly baseBackoffMs?: number
  /** Backoff ceiling. Default 5 min. */
  readonly maxBackoffMs?: number
  readonly timers?: SyncTimers
  /** [0,1) source for jitter. Default Math.random. */
  readonly random?: () => number
}

export class SyncRunner {
  private readonly intervalMs: number
  private readonly baseBackoffMs: number
  private readonly maxBackoffMs: number
  private readonly timers: SyncTimers
  private readonly random: () => number

  private running: Promise<PushOutcome> | null = null
  private timer: SyncTimerHandle | null = null
  private backoffAttempt = 0
  /** When true, the automatic cadence is stopped; only a manual `now()` resumes it. */
  private paused = false
  private stopped = true

  constructor(private readonly opts: SyncRunnerOptions) {
    this.intervalMs = opts.intervalMs ?? 60_000
    this.baseBackoffMs = opts.baseBackoffMs ?? 2_000
    this.maxBackoffMs = opts.maxBackoffMs ?? 5 * 60_000
    this.timers = opts.timers ?? realTimers
    this.random = opts.random ?? Math.random
  }

  /** Begin the cadence and kick an initial run. Idempotent. */
  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.opts.log.info('[sync] runner started', { intervalMs: this.intervalMs })
    void this.runGuarded()
  }

  /** Stop the cadence and cancel any pending timer. */
  stop(): void {
    this.stopped = true
    this.clearTimer()
    this.opts.log.info('[sync] runner stopped')
  }

  /**
   * Manual sync (IPC `sync:now`). Clears any pause and runs now, coalescing with an
   * in-flight run. Returns the run's outcome.
   */
  now(): Promise<PushOutcome> {
    this.paused = false
    if (this.stopped) this.stopped = false
    return this.runGuarded()
  }

  /** Window-focus trigger. Gently retries unless paused (a pause needs deliberate action). */
  onFocus(): void {
    if (this.stopped || this.paused) return
    void this.runGuarded()
  }

  /** Whether the automatic cadence is currently paused awaiting a manual run. */
  isPaused(): boolean {
    return this.paused
  }

  private runGuarded(): Promise<PushOutcome> {
    if (this.running) return this.running
    this.clearTimer()
    this.running = this.run().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async run(): Promise<PushOutcome> {
    let outcome: PushOutcome
    try {
      outcome = await this.opts.pushOnce()
    } catch (e) {
      // pushOnce is designed not to throw, but never let an unexpected throw kill the
      // cadence — treat it as a transient server error and back off.
      this.opts.log.error('[sync] unexpected push error', { error: String(e) })
      outcome = { kind: 'server-error', status: 0 }
    }
    this.applyOutcome(outcome)
    return outcome
  }

  /** Map a push outcome to a toast (if any) and the next scheduling decision. */
  private applyOutcome(outcome: PushOutcome): void {
    switch (outcome.kind) {
      case 'idle':
      case 'pushed':
      case 'not-ready':
        this.backoffAttempt = 0
        this.scheduleNext(this.intervalMs)
        return
      case 'rate-limited': {
        const delay = outcome.retryAfterMs ?? this.nextBackoffMs()
        this.opts.notify({
          level: 'warning',
          code: SYNC_ERROR_CODES.RATE_LIMITED,
          message: 'Sync is rate-limited. Retrying shortly.',
        })
        this.scheduleNext(delay)
        return
      }
      case 'server-error':
        this.opts.notify({
          level: 'warning',
          code: SYNC_ERROR_CODES.SERVER_ERROR,
          message: 'Sync is temporarily unavailable. Retrying.',
        })
        this.scheduleNext(this.nextBackoffMs())
        return
      case 'network-error':
        this.opts.notify({
          level: 'warning',
          code: SYNC_ERROR_CODES.NETWORK_ERROR,
          message: 'No connection. Sync will resume when you are back online.',
        })
        this.scheduleNext(this.nextBackoffMs())
        return
      case 'auth-expired':
        this.paused = true
        this.opts.notify({
          level: 'error',
          code: SYNC_ERROR_CODES.AUTH_EXPIRED,
          message: 'Your session expired. Please log in again to resume sync.',
        })
        return
      case 'client-error':
        this.paused = true
        this.opts.notify({
          level: 'error',
          code: SYNC_ERROR_CODES.CLIENT_ERROR,
          message: 'Sync was rejected. It will retry after the next manual sync.',
        })
        return
      case 'wrong-key':
        this.paused = true
        this.opts.notify({
          level: 'error',
          code: SYNC_ERROR_CODES.WRONG_KEY,
          message:
            "Cairn can't decrypt your synced data on this device. Re-enter your password or recovery phrase.",
        })
        return
    }
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped || this.paused) return
    this.clearTimer()
    this.timer = this.timers.set(() => {
      this.timer = null
      void this.runGuarded()
    }, delayMs)
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.timers.clear(this.timer)
      this.timer = null
    }
  }

  /** Equal-jitter exponential backoff, capped at {@link maxBackoffMs}. */
  private nextBackoffMs(): number {
    const raw = Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** this.backoffAttempt)
    this.backoffAttempt++
    return Math.floor(raw / 2 + this.random() * (raw / 2))
  }
}
