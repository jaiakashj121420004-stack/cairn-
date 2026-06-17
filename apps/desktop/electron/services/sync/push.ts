/**
 * One push run: drain the local `sync_queue`, encrypt each op under the data key, POST
 * to `/vault/push`, and delete acknowledged rows (CLAUDE.md §18.6,
 * docs/sync-protocol.md §6).
 *
 * Pure orchestration over injected seams ({@link PushDeps}) — no Electron, network, or
 * crypto imports here, so it is exhaustively unit-testable. The returned
 * {@link PushOutcome} tells the runner how to schedule and what to toast; this function
 * itself never sleeps, retries on a timer, or shows UI.
 */
import { adFor } from './serialize'
import { SYNC_ERROR_CODES } from './types'
import type {
  EncryptOp,
  PushOutcome,
  QueueRow,
  SyncContext,
  SyncLogger,
  SyncQueue,
  VaultApi,
} from './types'
import type { EncryptedOp, VaultPushInput } from '@cairn/shared-zod'

/** Ops per request — the wire batch size (≤ the server's hard cap of 500). */
export const PUSH_BATCH_SIZE = 200

/** Backstop against an unbounded loop if `remove()` ever fails to shrink the queue. */
const MAX_BATCHES_PER_RUN = 10_000

export interface PushDeps {
  readonly queue: SyncQueue
  readonly api: VaultApi
  readonly ctx: SyncContext
  readonly encrypt: EncryptOp
  readonly log: SyncLogger
}

/** Encrypt one queue row into a wire op. A bare delete (empty payload) sends no ciphertext. */
function toEncryptedOp(row: QueueRow, dataKey: Uint8Array, encrypt: EncryptOp): EncryptedOp {
  const payload_ciphertext =
    row.payload.length > 0
      ? encrypt(new TextEncoder().encode(row.payload), dataKey, adFor(row.tableName, row.recordId))
      : ''
  return {
    table_name: row.tableName,
    record_id: row.recordId,
    op_type: row.opType,
    payload_ciphertext,
  }
}

export async function pushOnce(deps: PushDeps): Promise<PushOutcome> {
  const { queue, api, ctx, encrypt, log } = deps

  const deviceId = ctx.getDeviceId()
  const dataKey = ctx.getDataKey()
  let token = ctx.getAccessToken()
  if (deviceId === null) return { kind: 'not-ready', reason: 'no enrolled device' }
  if (dataKey === null) return { kind: 'not-ready', reason: 'vault locked (no data key)' }
  if (token === null) return { kind: 'not-ready', reason: 'not logged in' }

  let pushedTotal = 0
  let refreshAttempted = false

  for (let batchNo = 0; batchNo < MAX_BATCHES_PER_RUN; batchNo++) {
    const rows = queue.take(PUSH_BATCH_SIZE)
    if (rows.length === 0) {
      return pushedTotal === 0 ? { kind: 'idle' } : { kind: 'pushed', opCount: pushedTotal }
    }

    const ops = rows.map((r) => toEncryptedOp(r, dataKey, encrypt))
    const input: VaultPushInput = { device_id: deviceId, ops }

    const res = await api.push(input, token)

    // Network failure — the request never completed. Back off and retry later.
    if (res.networkError !== undefined || res.status === 0) {
      log.warn('[sync] push network error', { error: res.networkError })
      return { kind: 'network-error', message: res.networkError ?? 'request failed' }
    }

    if (res.status === 200) {
      if (!isValidPushAck(res.body, ops.length)) {
        // 200 but malformed/short ack: do NOT delete (unconfirmed). Re-push is safe —
        // duplicate ops have an equal clock and are ignored on pull (§6.3).
        log.warn('[sync] push 200 with unexpected body; not removing rows', { body: res.body })
        return { kind: 'server-error', status: 200 }
      }
      queue.remove(rows.map((r) => r.id))
      pushedTotal += rows.length
      log.debug('[sync] pushed batch', { count: rows.length, total: pushedTotal })
      continue // drain the next batch
    }

    // 401 — refresh the access token once via the cookie, then retry the same batch.
    if (res.status === 401) {
      if (refreshAttempted) {
        log.warn('[sync] push still 401 after refresh')
        return { kind: 'auth-expired' }
      }
      refreshAttempted = true
      const newToken = await ctx.refresh()
      if (newToken === null) {
        log.warn('[sync] token refresh failed')
        return { kind: 'auth-expired' }
      }
      token = newToken
      continue // rows were not removed; retry the same batch with the fresh token
    }

    // 429 — respect the rate limit; the runner backs off (honoring Retry-After).
    if (res.status === 429) {
      log.warn('[sync] push rate-limited', { retryAfterMs: res.retryAfterMs })
      return { kind: 'rate-limited', retryAfterMs: res.retryAfterMs ?? null }
    }

    // 402 — the vault is gated behind Cairn Pro (docs/billing.md §5). Pause and let the
    // renderer prompt the user to upgrade rather than retrying a payment-required call.
    if (res.status === 402) {
      log.warn('[sync] push requires Cairn Pro (402)')
      return { kind: 'upgrade-required' }
    }

    // Other 4xx (400/403/413) — a client-side problem that will just recur. Pause.
    if (res.status >= 400 && res.status < 500) {
      log.error('[sync] push client error', { status: res.status, body: res.body })
      return { kind: 'client-error', status: res.status, code: SYNC_ERROR_CODES.CLIENT_ERROR }
    }

    // 5xx (or anything unexpected) — transient; back off and retry.
    log.error('[sync] push server error', { status: res.status })
    return { kind: 'server-error', status: res.status }
  }

  // Safety valve: queue never drained. Treat as transient so the runner backs off.
  log.error('[sync] push exceeded max batches in one run', { pushedTotal })
  return { kind: 'server-error', status: 0 }
}

/** A valid 200 ack carries `op_ids: number[]` with one id per submitted op. */
function isValidPushAck(body: unknown, expectedCount: number): boolean {
  if (typeof body !== 'object' || body === null) return false
  const ids = (body as { op_ids?: unknown }).op_ids
  return Array.isArray(ids) && ids.length === expectedCount && ids.every((n) => Number.isInteger(n))
}
