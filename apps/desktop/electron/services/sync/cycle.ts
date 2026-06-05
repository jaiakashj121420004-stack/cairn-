/**
 * One sync cycle = push then pull (CLAUDE.md §18.6 step 4, docs/sync-protocol.md §10).
 *
 * The runner schedules a single {@link PushOutcome}; a cycle runs push first (so local
 * edits leave before we reconcile) and then pull, folding both into one outcome the
 * runner can act on. If push hits a stop/transient condition (auth, rate-limit, 4xx,
 * 5xx, network, not-ready) we skip the pull this tick and surface that — there is no
 * point reconciling when the same transport just failed. On a clean push we always pull,
 * and the pull outcome drives scheduling.
 *
 * Pure over two injected thunks, so the compose logic is unit-testable without crypto,
 * network, or a DB.
 */
import { SYNC_ERROR_CODES } from './types'
import type { PullOutcome, PushOutcome } from './types'

export async function runSyncCycle(
  push: () => Promise<PushOutcome>,
  pull: () => Promise<PullOutcome>,
): Promise<PushOutcome> {
  const p = await push()
  // Only reconcile when the push leg was healthy (idle or pushed). Anything else is a
  // transport/auth condition the runner must handle; pulling would just hit it again.
  if (p.kind !== 'idle' && p.kind !== 'pushed') return p

  const q = await pull()
  return mergeOutcome(p, q)
}

/** Fold a healthy push outcome and a pull outcome into one scheduling outcome. */
function mergeOutcome(push: PushOutcome, pull: PullOutcome): PushOutcome {
  switch (pull.kind) {
    case 'idle':
      return push // 'idle' or 'pushed' from the push leg
    case 'pulled': {
      const pushedOps = push.kind === 'pushed' ? push.opCount : 0
      const activity = pushedOps + pull.applied + pull.conflicts + pull.quarantined
      return activity > 0 ? { kind: 'pushed', opCount: pushedOps + pull.applied } : { kind: 'idle' }
    }
    case 'rate-limited':
      return { kind: 'rate-limited', retryAfterMs: pull.retryAfterMs }
    case 'auth-expired':
      return { kind: 'auth-expired' }
    case 'client-error':
      return { kind: 'client-error', status: pull.status, code: SYNC_ERROR_CODES.CLIENT_ERROR }
    case 'server-error':
      return { kind: 'server-error', status: pull.status }
    case 'network-error':
      return { kind: 'network-error', message: pull.message }
    case 'not-ready':
      // Push succeeded but pull says not-ready (e.g. vault locked between legs). Treat the
      // cycle as the push result so we don't pause; the next tick re-checks readiness.
      return push
    case 'wrong-key':
      return { kind: 'wrong-key', message: pull.message }
    default: {
      const _exhaustive: never = pull
      return _exhaustive
    }
  }
}
