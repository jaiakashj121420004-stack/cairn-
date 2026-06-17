// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { runSyncCycle } from '../../../electron/services/sync'
import type { PullOutcome, PushOutcome } from '../../../electron/services/sync'

const idlePull = (): Promise<PullOutcome> => Promise.resolve({ kind: 'idle' })

describe('runSyncCycle — push then pull', () => {
  it('runs pull only after a healthy push', async () => {
    const order: string[] = []
    const push = vi.fn(async (): Promise<PushOutcome> => {
      order.push('push')
      return { kind: 'idle' }
    })
    const pull = vi.fn(async (): Promise<PullOutcome> => {
      order.push('pull')
      return { kind: 'idle' }
    })
    const out = await runSyncCycle(push, pull)
    expect(order).toEqual(['push', 'pull'])
    expect(out).toEqual<PushOutcome>({ kind: 'idle' })
  })

  it('skips pull when the push leg hit a transport/auth condition', async () => {
    const pull = vi.fn(idlePull)
    const out = await runSyncCycle(async () => ({ kind: 'auth-expired' }), pull)
    expect(pull).not.toHaveBeenCalled()
    expect(out).toEqual<PushOutcome>({ kind: 'auth-expired' })
  })

  it('folds pushed + applied counts into one pushed outcome', async () => {
    const out = await runSyncCycle(
      async () => ({ kind: 'pushed', opCount: 2 }),
      async () => ({ kind: 'pulled', applied: 3, conflicts: 1, quarantined: 0 }),
    )
    expect(out).toEqual<PushOutcome>({ kind: 'pushed', opCount: 5 })
  })

  it('idle push + idle pull = idle (nothing happened either way)', async () => {
    expect(await runSyncCycle(async () => ({ kind: 'idle' }), idlePull)).toEqual<PushOutcome>({
      kind: 'idle',
    })
  })

  it('idle push but a pull that only found a conflict still counts as activity', async () => {
    const out = await runSyncCycle(
      async () => ({ kind: 'idle' }),
      async () => ({ kind: 'pulled', applied: 0, conflicts: 1, quarantined: 0 }),
    )
    expect(out).toEqual<PushOutcome>({ kind: 'pushed', opCount: 0 })
  })

  it('propagates a pull upgrade-required (402) as the cycle outcome', async () => {
    const out = await runSyncCycle(
      async () => ({ kind: 'pushed', opCount: 1 }),
      async () => ({ kind: 'upgrade-required' }),
    )
    expect(out).toEqual<PushOutcome>({ kind: 'upgrade-required' })
  })

  it('propagates a pull wrong-key as the cycle outcome', async () => {
    const out = await runSyncCycle(
      async () => ({ kind: 'pushed', opCount: 1 }),
      async () => ({ kind: 'wrong-key', message: 'bad key' }),
    )
    expect(out).toEqual<PushOutcome>({ kind: 'wrong-key', message: 'bad key' })
  })

  it('a pull rate-limit carries its delay to the runner', async () => {
    const out = await runSyncCycle(
      async () => ({ kind: 'idle' }),
      async () => ({ kind: 'rate-limited', retryAfterMs: 5000 }),
    )
    expect(out).toEqual<PushOutcome>({ kind: 'rate-limited', retryAfterMs: 5000 })
  })

  it('a pull not-ready after a good push does not pause the cycle', async () => {
    const out = await runSyncCycle(
      async () => ({ kind: 'pushed', opCount: 1 }),
      async () => ({ kind: 'not-ready', reason: 'vault locked' }),
    )
    expect(out).toEqual<PushOutcome>({ kind: 'pushed', opCount: 1 })
  })
})
