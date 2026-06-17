import { describe, expect, it, vi } from 'vitest'

import { SyncRunner } from '../../../electron/services/sync'
import type { SyncTimerHandle, SyncTimers } from '../../../electron/services/sync/runner'
import type { Notify, PushOutcome, SyncLogger } from '../../../electron/services/sync'

const silentLog: SyncLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

/** A single-slot fake scheduler: records the pending delay and fires it on demand. */
class FakeTimers implements SyncTimers {
  private seq = 0
  private current: { handle: number; fn: () => void; ms: number } | null = null

  set(fn: () => void, ms: number): SyncTimerHandle {
    this.seq += 1
    this.current = { handle: this.seq, fn, ms }
    return this.seq
  }
  clear(handle: SyncTimerHandle): void {
    if (this.current?.handle === handle) this.current = null
  }
  /** The delay of the currently-scheduled run, or null if none is pending. */
  get scheduledMs(): number | null {
    return this.current?.ms ?? null
  }
  /** Simulate the timer elapsing. */
  fire(): void {
    const c = this.current
    if (!c) throw new Error('FakeTimers.fire: nothing scheduled')
    this.current = null
    c.fn()
  }
}

/** Flush pending microtasks so an awaited push run settles. */
async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

function makeRunner(
  pushOnce: () => Promise<PushOutcome>,
  over: { notify?: Notify; random?: () => number } = {},
): { runner: SyncRunner; timers: FakeTimers; notify: ReturnType<typeof vi.fn> } {
  const timers = new FakeTimers()
  const notify = vi.fn()
  const runner = new SyncRunner({
    pushOnce,
    notify: over.notify ?? notify,
    log: silentLog,
    timers,
    random: over.random ?? (() => 0), // deterministic equal-jitter lower bound
    intervalMs: 60_000,
    baseBackoffMs: 2_000,
    maxBackoffMs: 300_000,
  })
  return { runner, timers, notify }
}

describe('SyncRunner — single-flight (leaky bucket)', () => {
  it('coalesces concurrent triggers onto one in-flight run', async () => {
    let resolveRun: (o: PushOutcome) => void = () => {}
    const pending = new Promise<PushOutcome>((r) => {
      resolveRun = r
    })
    const pushOnce = vi.fn(() => pending)
    const { runner } = makeRunner(pushOnce)

    const a = runner.now()
    const b = runner.now()
    expect(a).toBe(b) // same promise — coalesced
    expect(pushOnce).toHaveBeenCalledTimes(1)

    resolveRun({ kind: 'idle' })
    await a
  })
})

describe('SyncRunner — steady cadence', () => {
  it('reschedules at the interval after a successful run', async () => {
    const pushOnce = vi.fn(() => Promise.resolve<PushOutcome>({ kind: 'pushed', opCount: 3 }))
    const { runner, timers } = makeRunner(pushOnce)
    await runner.now()
    await flush()
    expect(timers.scheduledMs).toBe(60_000)

    timers.fire()
    await flush()
    expect(pushOnce).toHaveBeenCalledTimes(2)
  })

  it('idle and not-ready also reschedule at the interval (no toast)', async () => {
    const { runner, timers, notify } = makeRunner(() =>
      Promise.resolve<PushOutcome>({ kind: 'idle' }),
    )
    await runner.now()
    await flush()
    expect(timers.scheduledMs).toBe(60_000)
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('SyncRunner — rate-limit respect', () => {
  it('schedules the next run after Retry-After and does not run before it elapses', async () => {
    const pushOnce = vi.fn(() =>
      Promise.resolve<PushOutcome>({ kind: 'rate-limited', retryAfterMs: 30_000 }),
    )
    const { runner, timers, notify } = makeRunner(pushOnce)

    await runner.now()
    await flush()

    expect(pushOnce).toHaveBeenCalledTimes(1) // no immediate retry
    expect(timers.scheduledMs).toBe(30_000) // honored the server's delay exactly
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ code: 'SYNC_RATE_LIMITED' }))

    timers.fire() // delay elapses
    await flush()
    expect(pushOnce).toHaveBeenCalledTimes(2)
  })

  it('falls back to backoff when Retry-After is absent', async () => {
    const { runner, timers } = makeRunner(() =>
      Promise.resolve<PushOutcome>({ kind: 'rate-limited', retryAfterMs: null }),
    )
    await runner.now()
    await flush()
    expect(timers.scheduledMs).toBe(1_000) // base 2000, equal jitter, random=0 ⇒ 1000
  })
})

describe('SyncRunner — exponential backoff with jitter', () => {
  it('escalates per consecutive transient error and resets after success', async () => {
    let outcome: PushOutcome = { kind: 'server-error', status: 500 }
    const { runner, timers } = makeRunner(() => Promise.resolve(outcome))

    await runner.now()
    await flush()
    expect(timers.scheduledMs).toBe(1_000) // attempt 0: raw 2000 → 1000

    timers.fire()
    await flush()
    expect(timers.scheduledMs).toBe(2_000) // attempt 1: raw 4000 → 2000

    timers.fire()
    await flush()
    expect(timers.scheduledMs).toBe(4_000) // attempt 2: raw 8000 → 4000

    // Recover: a success resets the backoff counter back to the interval.
    outcome = { kind: 'pushed', opCount: 1 }
    timers.fire()
    await flush()
    expect(timers.scheduledMs).toBe(60_000)
  })

  it('caps backoff at maxBackoffMs', async () => {
    const { runner, timers } = makeRunner(
      () => Promise.resolve<PushOutcome>({ kind: 'network-error', message: 'down' }),
      { random: () => 0.999 }, // push jitter to the top of the band
    )
    await runner.now()
    await flush()
    for (let i = 0; i < 20; i++) {
      timers.fire()
      await flush()
    }
    const ms = timers.scheduledMs
    expect(ms).not.toBeNull()
    expect(ms ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(300_000)
  })
})

describe('SyncRunner — pause on unrecoverable outcomes', () => {
  it('client-error pauses the cadence; only a manual now() resumes it', async () => {
    let outcome: PushOutcome = { kind: 'client-error', status: 400, code: 'SYNC_CLIENT_ERROR' }
    const pushOnce = vi.fn(() => Promise.resolve(outcome))
    const { runner, timers, notify } = makeRunner(pushOnce)

    await runner.now()
    await flush()
    expect(runner.isPaused()).toBe(true)
    expect(timers.scheduledMs).toBeNull() // nothing scheduled
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SYNC_CLIENT_ERROR', level: 'error' }),
    )

    // onFocus must NOT run while paused.
    runner.onFocus()
    await flush()
    expect(pushOnce).toHaveBeenCalledTimes(1)

    // A manual sync clears the pause and runs again.
    outcome = { kind: 'pushed', opCount: 1 }
    await runner.now()
    await flush()
    expect(pushOnce).toHaveBeenCalledTimes(2)
    expect(runner.isPaused()).toBe(false)
    expect(timers.scheduledMs).toBe(60_000)
  })

  it('upgrade-required (402) pauses and toasts a Cairn Pro upgrade prompt', async () => {
    const { runner, timers, notify } = makeRunner(() =>
      Promise.resolve<PushOutcome>({ kind: 'upgrade-required' }),
    )

    await runner.now()
    await flush()
    expect(runner.isPaused()).toBe(true)
    expect(timers.scheduledMs).toBeNull()
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SYNC_UPGRADE_REQUIRED', level: 'error' }),
    )
  })

  it('wrong-key pauses and toasts a re-authenticate message', async () => {
    const { runner, timers, notify } = makeRunner(() =>
      Promise.resolve<PushOutcome>({ kind: 'wrong-key', message: 'bad key' }),
    )
    await runner.now()
    await flush()
    expect(runner.isPaused()).toBe(true)
    expect(timers.scheduledMs).toBeNull()
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SYNC_WRONG_KEY', level: 'error' }),
    )
  })

  it('auth-expired pauses and toasts a session-expired message', async () => {
    const { runner, timers, notify } = makeRunner(() =>
      Promise.resolve<PushOutcome>({ kind: 'auth-expired' }),
    )
    await runner.now()
    await flush()
    expect(runner.isPaused()).toBe(true)
    expect(timers.scheduledMs).toBeNull()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ code: 'SYNC_AUTH_EXPIRED' }))
  })
})

describe('SyncRunner — lifecycle', () => {
  it('stop() cancels the pending timer and prevents rescheduling', async () => {
    const { runner, timers } = makeRunner(() => Promise.resolve<PushOutcome>({ kind: 'idle' }))
    await runner.now()
    await flush()
    expect(timers.scheduledMs).toBe(60_000)
    runner.stop()
    expect(timers.scheduledMs).toBeNull()
  })
})
