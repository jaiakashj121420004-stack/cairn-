/**
 * One pull run: fetch new encrypted ops from `/vault/pull`, decrypt + validate each,
 * and apply / ignore / conflict / quarantine them against the local journal
 * (CLAUDE.md §18.6 steps 2–3, docs/sync-protocol.md §4, §5, §7, §8).
 *
 * Pure orchestration over injected seams ({@link PullDeps}) — no Electron, network, or
 * crypto imports — so it is exhaustively unit-testable. Per pull *response* the apply is
 * a single SQLite transaction; the in-memory vector-clock cache is reconciled only after
 * that transaction commits, so a rolled-back page never leaves the cache ahead of the DB.
 *
 * Decision per op, by vector clock (docs/sync-protocol.md §4):
 *   equal      → ignore (idempotent replay of an op we already have)
 *   dominates  → apply (remote is causally newer: fast-forward)
 *   dominated  → ignore (local is causally newer: we're ahead)
 *   concurrent → CONFLICT: retain both sides, mark for the UI, do NOT fast-forward
 *
 * Decrypt failure handling (docs/sync-protocol.md §8):
 *   - A *foreign* device's op that won't decrypt is a single misrouted/tampered op
 *     (its AEAD associated data `table:id` didn't bind) → quarantine it + audit, keep
 *     going. It is preserved verbatim, never silently dropped.
 *   - *Our own* device's op failing to decrypt means the data key itself is wrong
 *     (wrong password / stale key after rotation) — our own ciphertext must decrypt
 *     under our own key. That is the loud `wrong-key` case: halt the page immediately,
 *     apply nothing, and pause sync until the user re-authenticates.
 */
import { vaultPullOutputSchema } from '@cairn/shared-zod'
import { compareClocks, mergeClocks } from '@cairn/sync-protocol'
import { canonicalJson, parseEnvelope } from './canonical'
import { adFor } from './serialize'
import type { VectorClockCache } from './clock'
import type { QuarantineRecord, SyncLocalStore } from './store'
import type {
  DecryptOp,
  PullOutcome,
  SyncContext,
  SyncLogger,
  VaultApi,
  VaultPullInput,
} from './types'
import type { PulledOp } from '@cairn/shared-zod'
import type { SyncEnvelope, VectorClock } from '@cairn/sync-protocol'

/** Backstop against an unbounded paging loop if the cursor ever fails to advance. */
const MAX_PAGES_PER_RUN = 10_000

export interface PullDeps {
  readonly api: VaultApi
  readonly ctx: SyncContext
  readonly decrypt: DecryptOp
  readonly store: SyncLocalStore
  readonly clock: VectorClockCache
  readonly log: SyncLogger
  /** Wall clock (injected for testability). */
  readonly now: () => number
}

/** A resolved decision for one pulled op, computed before the apply transaction. */
type Action =
  | { readonly kind: 'ignore' }
  | {
      readonly kind: 'apply-upsert'
      readonly table: string
      readonly recordId: string
      readonly data: Record<string, unknown>
      readonly remoteClock: VectorClock
    }
  | {
      readonly kind: 'apply-delete'
      readonly table: string
      readonly recordId: string
      readonly remoteClock: VectorClock
      readonly updatedAt: number
    }
  | {
      readonly kind: 'conflict'
      readonly table: string
      readonly recordId: string
      readonly localClock: VectorClock
      readonly remoteClock: VectorClock
      readonly localPayload: string
      readonly remotePayload: string
      readonly opId: number
      readonly deviceId: string
    }
  | { readonly kind: 'quarantine'; readonly record: QuarantineRecord }
  /** Our own op failed to decrypt → the data key is wrong (§8). Halt the page. */
  | { readonly kind: 'wrong-key'; readonly message: string }

export async function pullOnce(deps: PullDeps): Promise<PullOutcome> {
  const { api, ctx, store, log } = deps

  const deviceId = ctx.getDeviceId()
  const dataKey = ctx.getDataKey()
  let token = ctx.getAccessToken()
  if (deviceId === null) return { kind: 'not-ready', reason: 'no enrolled device' }
  if (dataKey === null) return { kind: 'not-ready', reason: 'vault locked (no data key)' }
  if (token === null) return { kind: 'not-ready', reason: 'not logged in' }

  let cursor = store.getCursor()
  let applied = 0
  let conflicts = 0
  let quarantined = 0
  let sawAnyOp = false
  let refreshAttempted = false

  for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    const input: VaultPullInput = cursor > 0 ? { since_id: cursor } : { since_op_id_per_table: {} }
    const res = await api.pull(input, token)

    if (res.networkError !== undefined || res.status === 0) {
      log.warn('[sync] pull network error', { error: res.networkError })
      return { kind: 'network-error', message: res.networkError ?? 'request failed' }
    }

    if (res.status === 401) {
      if (refreshAttempted) {
        log.warn('[sync] pull still 401 after refresh')
        return { kind: 'auth-expired' }
      }
      refreshAttempted = true
      const newToken = await ctx.refresh()
      if (newToken === null) return { kind: 'auth-expired' }
      token = newToken
      page-- // retry the same page with the fresh token
      continue
    }

    if (res.status === 429) {
      return { kind: 'rate-limited', retryAfterMs: res.retryAfterMs ?? null }
    }
    if (res.status >= 400 && res.status < 500) {
      log.error('[sync] pull client error', { status: res.status, body: res.body })
      return { kind: 'client-error', status: res.status }
    }
    if (res.status !== 200) {
      log.error('[sync] pull server error', { status: res.status })
      return { kind: 'server-error', status: res.status }
    }

    const parsed = vaultPullOutputSchema.safeParse(res.body)
    if (!parsed.success) {
      // 200 with a body that isn't a valid pull response — a protocol fault, not data we
      // can apply. Treat as transient so the runner backs off (it will recur if it's a bug).
      log.error('[sync] pull 200 with malformed body', { issues: parsed.error.issues })
      return { kind: 'server-error', status: 200 }
    }
    const { ops, next_cursor } = parsed.data
    if (ops.length === 0) {
      return sawAnyOp ? { kind: 'pulled', applied, conflicts, quarantined } : { kind: 'idle' }
    }
    sawAnyOp = true

    // ── Phase A: resolve every op (decrypt, validate, compare clocks) — no writes yet.
    const actions: Action[] = []
    for (const op of ops) {
      const action = resolveOp(op, deviceId, dataKey, deps)
      if (action.kind === 'wrong-key') {
        // §8: stop the moment the key proves wrong; apply nothing from this page.
        log.error('[sync] pull wrong key — own op failed to decrypt', { opId: op.id })
        return { kind: 'wrong-key', message: action.message }
      }
      actions.push(action)
    }

    // The cursor advances to the last op id of the page (ops are ascending by id).
    const lastOpId = ops[ops.length - 1]?.id ?? cursor
    const merges: { table: string; recordId: string; clock: VectorClock }[] = []

    // ── Phase B: apply the whole page atomically.
    store.transaction(() => {
      for (const action of actions) {
        switch (action.kind) {
          case 'ignore':
            break
          case 'apply-upsert': {
            store.upsert(action.table, action.data)
            // Persist the merged clock durably IN THE SAME TXN as the row, so a restart
            // rehydrates the full clock and an op replay compares `equal`, not concurrent.
            const merged = mergeClocks(
              deps.clock.get(action.table, action.recordId),
              action.remoteClock,
            )
            store.setClock(action.table, action.recordId, merged)
            merges.push({
              table: action.table,
              recordId: action.recordId,
              clock: action.remoteClock,
            })
            applied++
            break
          }
          case 'apply-delete': {
            store.remove(action.table, action.recordId, action.updatedAt)
            const merged = mergeClocks(
              deps.clock.get(action.table, action.recordId),
              action.remoteClock,
            )
            store.setClock(action.table, action.recordId, merged)
            merges.push({
              table: action.table,
              recordId: action.recordId,
              clock: action.remoteClock,
            })
            applied++
            break
          }
          case 'conflict':
            store.recordConflict({
              tableName: action.table,
              recordId: action.recordId,
              localClock: action.localClock,
              remoteClock: action.remoteClock,
              localPayload: action.localPayload,
              remotePayload: action.remotePayload,
              remoteOpId: action.opId,
              remoteDeviceId: action.deviceId,
              detectedAt: deps.now(),
            })
            store.audit({
              event: 'sync.conflict',
              tableName: action.table,
              recordId: action.recordId,
              detail: `concurrent edit from device ${action.deviceId} (op ${action.opId})`,
              createdAt: deps.now(),
            })
            conflicts++
            break
          case 'quarantine':
            store.quarantine(action.record)
            store.audit({
              event: 'sync.quarantine',
              tableName: action.record.tableName,
              recordId: action.record.recordId,
              detail: `${action.record.reason}: ${action.record.detail}`,
              createdAt: deps.now(),
            })
            quarantined++
            break
        }
      }
      store.setCursor(lastOpId)
    })

    // Reconcile the in-memory clock cache only after the page committed.
    for (const m of merges) deps.clock.mergeRemote(m.table, m.recordId, m.clock)
    cursor = lastOpId

    if (next_cursor === null) {
      return { kind: 'pulled', applied, conflicts, quarantined }
    }
  }

  log.error('[sync] pull exceeded max pages in one run')
  return { kind: 'server-error', status: 0 }
}

/** Resolve one pulled op into an {@link Action}. Pure given the injected decrypt + store. */
function resolveOp(op: PulledOp, deviceId: string, dataKey: Uint8Array, deps: PullDeps): Action {
  const { decrypt, store, clock, now } = deps
  const ad = adFor(op.table_name, op.record_id)

  // 1. Decrypt. A bare delete (empty ciphertext) carries no payload to decrypt.
  let plaintext: string
  if (op.payload_ciphertext === '') {
    if (op.op_type !== 'delete') {
      return quarantineOf(op, 'SCHEMA_INVALID', 'empty ciphertext on a non-delete op', now())
    }
    // A bare delete loses tombstone causality; apply as a best-effort hard tombstone.
    return store.knows(op.table_name)
      ? {
          kind: 'apply-delete',
          table: op.table_name,
          recordId: op.record_id,
          remoteClock: {},
          updatedAt: now(),
        }
      : quarantineOf(op, 'SCHEMA_INVALID', 'unknown table', now())
  }
  try {
    plaintext = decrypt(op.payload_ciphertext, dataKey, ad)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (op.device_id === deviceId) {
      // Our own ciphertext must decrypt under our own key — it didn't, so the key is wrong.
      return { kind: 'wrong-key', message }
    }
    return quarantineOf(op, 'DECRYPT_FAILED', message, now())
  }

  // 2. Parse the envelope frame.
  let env: SyncEnvelope
  try {
    env = parseEnvelope(plaintext)
  } catch (e) {
    return quarantineOf(op, 'SCHEMA_INVALID', e instanceof Error ? e.message : String(e), now())
  }

  if (!store.knows(op.table_name)) {
    return quarantineOf(op, 'SCHEMA_INVALID', `unknown table ${op.table_name}`, now())
  }

  // 3. Compare causality against the local clock.
  const localClock = clock.get(op.table_name, op.record_id)
  const relation = compareClocks(env.clock, localClock)

  if (relation === 'equal' || relation === 'dominated') {
    return { kind: 'ignore' } // already have it, or we are ahead
  }

  if (relation === 'concurrent') {
    const local = store.snapshotRaw(op.table_name, op.record_id)
    return {
      kind: 'conflict',
      table: op.table_name,
      recordId: op.record_id,
      localClock,
      remoteClock: env.clock,
      localPayload: canonicalJson(local ?? {}),
      remotePayload: plaintext,
      opId: op.id,
      deviceId: op.device_id,
    }
  }

  // relation === 'dominates' → remote is causally newer; apply it.
  if (op.op_type === 'delete') {
    return {
      kind: 'apply-delete',
      table: op.table_name,
      recordId: op.record_id,
      remoteClock: env.clock,
      updatedAt: env.updatedAt,
    }
  }

  // upsert: validate the decrypted row against the table schema before touching SQLite.
  try {
    const data = store.validate(op.table_name, env.data)
    return {
      kind: 'apply-upsert',
      table: op.table_name,
      recordId: op.record_id,
      data,
      remoteClock: env.clock,
    }
  } catch (e) {
    return quarantineOf(op, 'SCHEMA_INVALID', e instanceof Error ? e.message : String(e), now())
  }
}

function quarantineOf(
  op: PulledOp,
  reason: QuarantineRecord['reason'],
  detail: string,
  createdAt: number,
): Action {
  return {
    kind: 'quarantine',
    record: {
      tableName: op.table_name,
      recordId: op.record_id,
      remoteOpId: op.id,
      remoteDeviceId: op.device_id,
      reason,
      detail,
      payloadCiphertext: op.payload_ciphertext,
      createdAt,
    },
  }
}
