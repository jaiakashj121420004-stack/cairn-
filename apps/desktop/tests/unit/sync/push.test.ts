// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  createEncryptOp,
  decodeCiphertext,
  adFor,
  pushOnce,
  PUSH_BATCH_SIZE,
} from '../../../electron/services/sync'
import { decryptRecord, generateDataKey, initCrypto } from '../../../electron/services/crypto'
import type { VaultPushInput } from '@cairn/shared-zod'
import type {
  PushOutcome,
  QueueRow,
  SyncContext,
  SyncLogger,
  SyncQueue,
  VaultApi,
  VaultHttpResult,
} from '../../../electron/services/sync'

beforeAll(async () => {
  await initCrypto()
})

// ── Test doubles ─────────────────────────────────────────────────────────────

class FakeQueue implements SyncQueue {
  private rows: QueueRow[]
  constructor(rows: QueueRow[]) {
    this.rows = [...rows]
  }
  take(limit: number): readonly QueueRow[] {
    return this.rows.slice(0, limit)
  }
  remove(ids: readonly number[]): void {
    const set = new Set(ids)
    this.rows = this.rows.filter((r) => !set.has(r.id))
  }
  size(): number {
    return this.rows.length
  }
}

/** A scripted API: returns the next response per call, recording every push input. */
class ScriptedApi implements VaultApi {
  readonly calls: { input: VaultPushInput; token: string }[] = []
  constructor(private readonly responses: VaultHttpResult[]) {}
  push(input: VaultPushInput, accessToken: string): Promise<VaultHttpResult> {
    this.calls.push({ input, token: accessToken })
    const res = this.responses[this.calls.length - 1]
    if (res === undefined) throw new Error('ScriptedApi: ran out of scripted responses')
    return Promise.resolve(res)
  }
}

const silentLog: SyncLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

/** Index into an array, throwing rather than using a banned non-null assertion. */
function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i]
  if (v === undefined) throw new Error(`index ${i} out of range (len ${arr.length})`)
  return v
}

function row(over: Partial<QueueRow> = {}): QueueRow {
  return {
    id: 1,
    tableName: 'trades',
    recordId: 'abc',
    opType: 'upsert',
    payload: JSON.stringify({ schemaVersion: 1, clock: { devA: 1 }, updatedAt: 1, data: { r: 2 } }),
    createdAt: 1000,
    ...over,
  }
}

function ctxWith(over: Partial<SyncContext> & { dataKey: Uint8Array }): SyncContext {
  return {
    getDeviceId: () => '11111111-1111-1111-1111-111111111111',
    getDataKey: () => over.dataKey,
    getAccessToken: () => 'tok-1',
    refresh: () => Promise.resolve('tok-2'),
    ...over,
  }
}

function ok200(opCount: number): VaultHttpResult {
  return { status: 200, body: { op_ids: Array.from({ length: opCount }, (_, i) => i + 1) } }
}

// ── Required test 1: encrypt-then-roundtrip-to-API ───────────────────────────

describe('pushOnce — encrypt then round-trip through the API', () => {
  it('encrypts each queued payload; the captured ciphertext decrypts back to the plaintext', async () => {
    const dataKey = generateDataKey()
    const payload = JSON.stringify({
      schemaVersion: 1,
      clock: { devA: 3 },
      updatedAt: 42,
      data: { pnl: 230 },
    })
    const queue = new FakeQueue([row({ id: 7, tableName: 'trades', recordId: 'abc', payload })])
    const api = new ScriptedApi([ok200(1)])

    const outcome = await pushOnce({
      queue,
      api,
      ctx: ctxWith({ dataKey }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })

    expect(outcome).toEqual<PushOutcome>({ kind: 'pushed', opCount: 1 })
    expect(queue.size()).toBe(0) // acked rows removed

    // The server received exactly one op for trades:abc with non-empty ciphertext…
    const sent = at(api.calls, 0).input.ops
    expect(sent).toHaveLength(1)
    expect(at(sent, 0).payload_ciphertext.length).toBeGreaterThan(0)

    // …and that ciphertext, decoded + decrypted under the row's AD, is the original.
    const record = decodeCiphertext(at(sent, 0).payload_ciphertext)
    const plaintext = decryptRecord(record, dataKey, adFor('trades', 'abc'))
    expect(new TextDecoder().decode(plaintext)).toBe(payload)
  })

  it('a delete op sends empty ciphertext (no plaintext to protect)', async () => {
    const queue = new FakeQueue([row({ id: 9, opType: 'delete', payload: '' })])
    const api = new ScriptedApi([ok200(1)])
    const outcome = await pushOnce({
      queue,
      api,
      ctx: ctxWith({ dataKey: generateDataKey() }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })
    expect(outcome.kind).toBe('pushed')
    const deleteOp = at(at(api.calls, 0).input.ops, 0)
    expect(deleteOp.op_type).toBe('delete')
    expect(deleteOp.payload_ciphertext).toBe('')
  })
})

// ── Required test 2: AD-binding ──────────────────────────────────────────────

describe('pushOnce — associated-data binding (row substitution is rejected)', () => {
  it('a ciphertext for trades:abc does NOT decrypt under trades:def', async () => {
    const dataKey = generateDataKey()
    const queue = new FakeQueue([row({ tableName: 'trades', recordId: 'abc' })])
    const api = new ScriptedApi([ok200(1)])
    await pushOnce({
      queue,
      api,
      ctx: ctxWith({ dataKey }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })

    const record = decodeCiphertext(at(at(api.calls, 0).input.ops, 0).payload_ciphertext)
    // Correct AD succeeds…
    expect(() => decryptRecord(record, dataKey, adFor('trades', 'abc'))).not.toThrow()
    // …wrong record id fails the tag check (row-substitution defence, security.md §4.4).
    expect(() => decryptRecord(record, dataKey, adFor('trades', 'def'))).toThrow()
    // …wrong table also fails.
    expect(() => decryptRecord(record, dataKey, adFor('accounts', 'abc'))).toThrow()
  })
})

// ── Required test 3: rate-limit respect (push surfaces it for the runner) ─────

describe('pushOnce — rate limiting', () => {
  it('429 with Retry-After is surfaced as rate-limited carrying the delay (no row removal)', async () => {
    const queue = new FakeQueue([row()])
    const api = new ScriptedApi([{ status: 429, body: null, retryAfterMs: 12_000 }])
    const outcome = await pushOnce({
      queue,
      api,
      ctx: ctxWith({ dataKey: generateDataKey() }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })
    expect(outcome).toEqual<PushOutcome>({ kind: 'rate-limited', retryAfterMs: 12_000 })
    expect(queue.size()).toBe(1) // nothing acked, nothing removed
  })

  it('429 without Retry-After surfaces retryAfterMs: null', async () => {
    const api = new ScriptedApi([{ status: 429, body: null }])
    const outcome = await pushOnce({
      queue: new FakeQueue([row()]),
      api,
      ctx: ctxWith({ dataKey: generateDataKey() }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })
    expect(outcome).toEqual<PushOutcome>({ kind: 'rate-limited', retryAfterMs: null })
  })
})

// ── Outcome coverage ─────────────────────────────────────────────────────────

describe('pushOnce — outcomes', () => {
  it('empty queue → idle (no API call)', async () => {
    const api = new ScriptedApi([])
    const outcome = await pushOnce({
      queue: new FakeQueue([]),
      api,
      ctx: ctxWith({ dataKey: generateDataKey() }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })
    expect(outcome).toEqual<PushOutcome>({ kind: 'idle' })
    expect(api.calls).toHaveLength(0)
  })

  it('not-ready when no device / key / token', async () => {
    const base = {
      queue: new FakeQueue([row()]),
      api: new ScriptedApi([]),
      encrypt: createEncryptOp(),
      log: silentLog,
    }
    const noDevice = await pushOnce({
      ...base,
      ctx: ctxWith({ dataKey: generateDataKey(), getDeviceId: () => null }),
    })
    expect(noDevice.kind).toBe('not-ready')

    const locked = await pushOnce({
      ...base,
      ctx: ctxWith({ dataKey: generateDataKey(), getDataKey: () => null }),
    })
    expect(locked.kind).toBe('not-ready')

    const loggedOut = await pushOnce({
      ...base,
      ctx: ctxWith({ dataKey: generateDataKey(), getAccessToken: () => null }),
    })
    expect(loggedOut.kind).toBe('not-ready')
  })

  it('401 → refresh once → retry with new token → success', async () => {
    const dataKey = generateDataKey()
    const queue = new FakeQueue([row()])
    const api = new ScriptedApi([{ status: 401, body: null }, ok200(1)])
    const refresh = vi.fn(() => Promise.resolve('tok-2'))
    const outcome = await pushOnce({
      queue,
      api,
      ctx: ctxWith({ dataKey, refresh }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })
    expect(outcome.kind).toBe('pushed')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(at(api.calls, 0).token).toBe('tok-1') // first attempt with old token
    expect(at(api.calls, 1).token).toBe('tok-2') // retry with refreshed token
    expect(queue.size()).toBe(0)
  })

  it('401 that survives refresh → auth-expired (refresh attempted once)', async () => {
    const queue = new FakeQueue([row()])
    const api = new ScriptedApi([
      { status: 401, body: null },
      { status: 401, body: null },
    ])
    const refresh = vi.fn(() => Promise.resolve('tok-2'))
    const outcome = await pushOnce({
      queue,
      api,
      ctx: ctxWith({ dataKey: generateDataKey(), refresh }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })
    expect(outcome).toEqual<PushOutcome>({ kind: 'auth-expired' })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(queue.size()).toBe(1)
  })

  it('401 with a failed refresh → auth-expired without a retry', async () => {
    const api = new ScriptedApi([{ status: 401, body: null }])
    const outcome = await pushOnce({
      queue: new FakeQueue([row()]),
      api,
      ctx: ctxWith({ dataKey: generateDataKey(), refresh: () => Promise.resolve(null) }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })
    expect(outcome).toEqual<PushOutcome>({ kind: 'auth-expired' })
    expect(api.calls).toHaveLength(1)
  })

  it('non-401 4xx → client-error (rows retained)', async () => {
    const queue = new FakeQueue([row()])
    const outcome = await pushOnce({
      queue,
      api: new ScriptedApi([{ status: 400, body: { error: { code: 'VALIDATION_FAILED' } } }]),
      ctx: ctxWith({ dataKey: generateDataKey() }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })
    expect(outcome.kind).toBe('client-error')
    expect(queue.size()).toBe(1)
  })

  it('402 → upgrade-required (rows retained, distinct from a generic 4xx)', async () => {
    const queue = new FakeQueue([row()])
    const outcome = await pushOnce({
      queue,
      api: new ScriptedApi([
        { status: 402, body: { error: { code: 'UPGRADE_REQUIRED', message: 'pro required' } } },
      ]),
      ctx: ctxWith({ dataKey: generateDataKey() }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })
    expect(outcome).toEqual<PushOutcome>({ kind: 'upgrade-required' })
    expect(queue.size()).toBe(1) // unpushed ops are never dropped on a paywall
  })

  it('5xx → server-error (rows retained)', async () => {
    const queue = new FakeQueue([row()])
    const outcome = await pushOnce({
      queue,
      api: new ScriptedApi([{ status: 503, body: null }]),
      ctx: ctxWith({ dataKey: generateDataKey() }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })
    expect(outcome).toEqual<PushOutcome>({ kind: 'server-error', status: 503 })
    expect(queue.size()).toBe(1)
  })

  it('network failure → network-error (rows retained)', async () => {
    const queue = new FakeQueue([row()])
    const outcome = await pushOnce({
      queue,
      api: new ScriptedApi([{ status: 0, body: null, networkError: 'ECONNREFUSED' }]),
      ctx: ctxWith({ dataKey: generateDataKey() }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })
    expect(outcome).toEqual<PushOutcome>({ kind: 'network-error', message: 'ECONNREFUSED' })
    expect(queue.size()).toBe(1)
  })

  it('200 with a short/garbled ack does NOT remove rows (re-push is safe)', async () => {
    const queue = new FakeQueue([row(), row({ id: 2 })])
    const outcome = await pushOnce({
      queue,
      api: new ScriptedApi([{ status: 200, body: { op_ids: [1] } }]), // expected 2 ids
      ctx: ctxWith({ dataKey: generateDataKey() }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })
    expect(outcome).toEqual<PushOutcome>({ kind: 'server-error', status: 200 })
    expect(queue.size()).toBe(2)
  })

  it('drains multiple batches in one run and respects the batch size', async () => {
    const total = PUSH_BATCH_SIZE + 5
    const rows = Array.from({ length: total }, (_, i) => row({ id: i + 1 }))
    const queue = new FakeQueue(rows)
    const api = new ScriptedApi([ok200(PUSH_BATCH_SIZE), ok200(5)])
    const outcome = await pushOnce({
      queue,
      api,
      ctx: ctxWith({ dataKey: generateDataKey() }),
      encrypt: createEncryptOp(),
      log: silentLog,
    })
    expect(outcome).toEqual<PushOutcome>({ kind: 'pushed', opCount: total })
    expect(api.calls).toHaveLength(2)
    expect(at(api.calls, 0).input.ops).toHaveLength(PUSH_BATCH_SIZE)
    expect(at(api.calls, 1).input.ops).toHaveLength(5)
    expect(queue.size()).toBe(0)
  })
})
