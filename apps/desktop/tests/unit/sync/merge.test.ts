// @vitest-environment node
//
// Pull / merge / conflict / quarantine engine (docs/sync-protocol.md §4–8).
//
// The SQLite-backed store cannot run under vitest (better-sqlite3 is ABI-built for
// Electron's Node and won't load here — same constraint the migration suite documents),
// so — exactly as push.test uses a FakeQueue — these tests drive `pullOnce` against an
// in-memory FakeSyncStore and an in-process FakeVaultServer. The crypto, serialization,
// vector-clock, and decision logic are all the real production code.
import { beforeAll, describe, expect, it } from 'vitest'

import {
  adFor,
  buildEnvelope,
  createDecryptOp,
  createEncryptOp,
  decodeCiphertext,
  pullOnce,
  serializeEnvelope,
  validateSyncRow,
  isSyncableTable,
  VectorClockCache,
} from '../../../electron/services/sync'
import { decryptRecord, generateDataKey, initCrypto } from '../../../electron/services/crypto'
import type {
  ConflictRecord,
  AuditRecord,
  PullOutcome,
  QuarantineRecord,
  SyncContext,
  SyncLocalStore,
  SyncLogger,
  VaultApi,
  VaultHttpResult,
  VaultPullInput,
  VaultPushInput,
} from '../../../electron/services/sync'
import type { SyncOpType } from '@cairn/sync-protocol'

beforeAll(async () => {
  await initCrypto()
})

const silentLog: SyncLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
const encrypt = createEncryptOp()
const decrypt = createDecryptOp()

const DEVICE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const DEVICE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const DEVICE_Z = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

// ── In-process vault server: stores opaque ciphertext, assigns serial ids ──────

interface StoredOp {
  id: number
  device_id: string
  table_name: string
  record_id: string
  op_type: SyncOpType
  payload_ciphertext: string
  created_at: string
}

class FakeVaultServer {
  readonly ops: StoredOp[] = []
  private seq = 0

  push(deviceId: string, ops: VaultPushInput['ops']): number[] {
    const ids: number[] = []
    for (const op of ops) {
      this.seq += 1
      this.ops.push({
        id: this.seq,
        device_id: deviceId,
        table_name: op.table_name,
        record_id: op.record_id,
        op_type: op.op_type,
        payload_ciphertext: op.payload_ciphertext,
        created_at: new Date(1_700_000_000_000 + this.seq * 1000).toISOString(),
      })
      ids.push(this.seq)
    }
    return ids
  }

  pull(input: VaultPullInput): { ops: StoredOp[]; next_cursor: number | null } {
    const since = input.since_id ?? 0
    const ops = this.ops.filter((o) => o.id > since).sort((a, b) => a.id - b.id)
    return { ops, next_cursor: null } // single page is enough for these fixtures
  }
}

/** A {@link VaultApi} bound to a {@link FakeVaultServer}, for one device. */
function serverClient(server: FakeVaultServer, deviceId: string): VaultApi {
  return {
    push(input: VaultPushInput): Promise<VaultHttpResult> {
      return Promise.resolve({ status: 200, body: { op_ids: server.push(deviceId, input.ops) } })
    },
    pull(input: VaultPullInput): Promise<VaultHttpResult> {
      return Promise.resolve({ status: 200, body: server.pull(input) })
    },
  }
}

// ── In-memory SyncLocalStore (validation/decision logic is the real code) ──────

class FakeSyncStore implements SyncLocalStore {
  readonly rows = new Map<string, Map<string, Record<string, unknown>>>()
  readonly conflicts: ConflictRecord[] = []
  readonly quarantines: QuarantineRecord[] = []
  readonly audits: AuditRecord[] = []
  private cursor = 0

  private tbl(table: string): Map<string, Record<string, unknown>> {
    let m = this.rows.get(table)
    if (!m) {
      m = new Map()
      this.rows.set(table, m)
    }
    return m
  }

  knows(table: string): boolean {
    return isSyncableTable(table)
  }
  validate(table: string, data: unknown): Record<string, unknown> {
    return validateSyncRow(table, data)
  }
  snapshotRaw(table: string, recordId: string): Record<string, unknown> | null {
    return this.tbl(table).get(recordId) ?? null
  }
  upsert(table: string, data: Record<string, unknown>): void {
    this.tbl(table).set(String(data.id), data)
  }
  remove(table: string, recordId: string, updatedAt: number): void {
    const row = this.tbl(table).get(recordId)
    if (row) this.tbl(table).set(recordId, { ...row, deletedAt: updatedAt })
  }
  recordConflict(c: ConflictRecord): void {
    this.conflicts.push(c)
  }
  quarantine(q: QuarantineRecord): void {
    this.quarantines.push(q)
  }
  audit(a: AuditRecord): void {
    this.audits.push(a)
  }
  setCursor(lastOpId: number): void {
    this.cursor = lastOpId
  }
  getCursor(): number {
    return this.cursor
  }
  transaction(fn: () => void): void {
    // Faithful atomicity: snapshot, run, restore on throw.
    const snap = {
      rows: new Map([...this.rows].map(([k, v]) => [k, new Map(v)])),
      conflicts: [...this.conflicts],
      quarantines: [...this.quarantines],
      audits: [...this.audits],
      cursor: this.cursor,
    }
    try {
      fn()
    } catch (e) {
      this.rows.clear()
      for (const [k, v] of snap.rows) this.rows.set(k, v)
      this.conflicts.length = 0
      this.conflicts.push(...snap.conflicts)
      this.quarantines.length = 0
      this.quarantines.push(...snap.quarantines)
      this.audits.length = 0
      this.audits.push(...snap.audits)
      this.cursor = snap.cursor
      throw e
    }
  }
}

// ── One device: store + clock + auth context + a server-bound API ──────────────

interface Device {
  readonly id: string
  readonly store: FakeSyncStore
  readonly clock: VectorClockCache
  readonly api: VaultApi
  readonly dataKey: Uint8Array
}

function makeDevice(id: string, server: FakeVaultServer, dataKey: Uint8Array): Device {
  const clock = new VectorClockCache(id)
  clock.hydrate(() => [])
  return { id, store: new FakeSyncStore(), clock, api: serverClient(server, id), dataKey }
}

function ctxOf(dev: Device): SyncContext {
  return {
    getDeviceId: () => dev.id,
    getDataKey: () => dev.dataKey,
    getAccessToken: () => 'tok',
    refresh: () => Promise.resolve('tok'),
  }
}

let nowSeq = 0
const now = (): number => 1_700_000_000_000 + ++nowSeq

function pull(dev: Device): Promise<PullOutcome> {
  return pullOnce({
    api: dev.api,
    ctx: ctxOf(dev),
    decrypt,
    store: dev.store,
    clock: dev.clock,
    log: silentLog,
    now,
  })
}

/** A full trades row that satisfies the table schema; override any field. */
function tradeRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'T',
    accountId: 'acc',
    pairId: 'pair',
    setupId: 'setup',
    mode: 'live',
    direction: 'long',
    status: 'open',
    entryPrice: 100,
    stopLossPrice: 90,
    takeProfitPrice: 120,
    slPips: 10,
    rrRatio: 200,
    lotSize: 100,
    riskAmountCents: 1000,
    riskPctBps: 100,
    plannedInvalidation: 'below ob',
    mssConfirmed: 1,
    htfBiasAligned: 1,
    preCalmScore: 5,
    preUrgencyScore: 5,
    preNeedScore: 5,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

/** Simulate a local edit on `dev` and push the resulting encrypted op to the server. */
function pushEdit(
  dev: Device,
  server: FakeVaultServer,
  recordId: string,
  opType: SyncOpType,
  data: Record<string, unknown> | null,
): void {
  const clock = dev.clock.bumpLocal('trades', recordId)
  const env = buildEnvelope({
    opType,
    clock,
    updatedAt: now(),
    data: opType === 'delete' ? undefined : (data ?? {}),
  })
  const ad = adFor('trades', recordId)
  const ct = encrypt(new TextEncoder().encode(serializeEnvelope(env)), dev.dataKey, ad)
  server.push(dev.id, [
    { table_name: 'trades', record_id: recordId, op_type: opType, payload_ciphertext: ct },
  ])
}

// ── Required test 1: two-device offline edit → conflict in BOTH DBs ────────────

describe('two-device concurrent edit', () => {
  it('records a conflict on both devices when neither clock dominates', async () => {
    const server = new FakeVaultServer()
    const dataKey = generateDataKey()
    const a = makeDevice(DEVICE_A, server, dataKey)
    const b = makeDevice(DEVICE_B, server, dataKey)

    // Both edit T offline, from a common (empty) history → {A:1} vs {B:1}: concurrent.
    pushEdit(a, server, 'T', 'upsert', tradeRow({ pnlCents: 111 }))
    pushEdit(b, server, 'T', 'upsert', tradeRow({ pnlCents: 222 }))

    const ra = await pull(a)
    const rb = await pull(b)

    expect(ra).toEqual<PullOutcome>({ kind: 'pulled', applied: 0, conflicts: 1, quarantined: 0 })
    expect(rb).toEqual<PullOutcome>({ kind: 'pulled', applied: 0, conflicts: 1, quarantined: 0 })

    // Both sides retained, with the right causality recorded.
    expect(a.store.conflicts).toHaveLength(1)
    expect(b.store.conflicts).toHaveLength(1)
    expect(a.store.conflicts[0]?.localClock).toEqual({ [DEVICE_A]: 1 })
    expect(a.store.conflicts[0]?.remoteClock).toEqual({ [DEVICE_B]: 1 })
    expect(a.store.audits.some((e) => e.event === 'sync.conflict')).toBe(true)
  })
})

// ── Required test 2: linear edit (B pulled first) → no conflict, B sees A ──────

describe('linear edit', () => {
  it('B pulls A, then edits on top — no conflict, B has A’s change', async () => {
    const server = new FakeVaultServer()
    const dataKey = generateDataKey()
    const a = makeDevice(DEVICE_A, server, dataKey)
    const b = makeDevice(DEVICE_B, server, dataKey)

    pushEdit(a, server, 'T', 'upsert', tradeRow({ pnlCents: 111 }))

    // B pulls first: A's op causally dominates B's empty history → fast-forward apply.
    const rb1 = await pull(b)
    expect(rb1).toEqual<PullOutcome>({ kind: 'pulled', applied: 1, conflicts: 0, quarantined: 0 })
    expect(b.store.rows.get('trades')?.get('T')?.pnlCents).toBe(111) // B sees A's change
    expect(b.clock.get('trades', 'T')).toEqual({ [DEVICE_A]: 1 })

    // B edits on top of what it absorbed → {A:1, B:1}: dominates A, not concurrent.
    pushEdit(b, server, 'T', 'upsert', tradeRow({ pnlCents: 333 }))

    const ra = await pull(a)
    expect(ra.kind).toBe('pulled')
    expect(a.store.conflicts).toHaveLength(0)
    expect(b.store.conflicts).toHaveLength(0)
    expect(a.store.rows.get('trades')?.get('T')?.pnlCents).toBe(333)
  })
})

// ── Required test 3: wrong-AD op (row substitution) → quarantined ─────────────

describe('wrong associated-data attack', () => {
  it('an op whose AD does not bind fails to decrypt and is quarantined (not dropped)', async () => {
    const server = new FakeVaultServer()
    const dataKey = generateDataKey()
    const b = makeDevice(DEVICE_B, server, dataKey)

    // Encrypt a valid envelope but bind it to a DIFFERENT record id, then serve it under T.
    const env = buildEnvelope({
      opType: 'upsert',
      clock: { [DEVICE_A]: 1 },
      updatedAt: now(),
      data: tradeRow(),
    })
    const wrongAd = adFor('trades', 'OTHER')
    const ct = encrypt(new TextEncoder().encode(serializeEnvelope(env)), dataKey, wrongAd)
    // device_id is A (foreign to the puller B) → an isolated tampered op, not a wrong key.
    server.push(DEVICE_A, [
      { table_name: 'trades', record_id: 'T', op_type: 'upsert', payload_ciphertext: ct },
    ])

    const rb = await pull(b)
    expect(rb).toEqual<PullOutcome>({ kind: 'pulled', applied: 0, conflicts: 0, quarantined: 1 })
    expect(b.store.quarantines[0]?.reason).toBe('DECRYPT_FAILED')
    expect(b.store.quarantines[0]?.payloadCiphertext).toBe(ct) // raw bytes preserved
    expect(b.store.rows.get('trades')?.get('T')).toBeUndefined() // nothing applied
    expect(b.store.audits.some((e) => e.event === 'sync.quarantine')).toBe(true)
  })
})

// ── Required test 4: the server cannot decrypt what it stored ─────────────────

describe('server stores ciphertext it cannot read', () => {
  it('the raw stored payload does not decrypt without the data key', async () => {
    const server = new FakeVaultServer()
    const dataKey = generateDataKey()
    const a = makeDevice(DEVICE_A, server, dataKey)

    pushEdit(a, server, 'T', 'upsert', tradeRow({ pnlCents: 111 }))

    const stored = server.ops[0]?.payload_ciphertext
    expect(stored).toBeTruthy()
    const record = decodeCiphertext(stored ?? '')
    const ad = adFor('trades', 'T')

    // With a different key (everything the server could ever try), decryption fails.
    const wrongKey = generateDataKey()
    expect(() => decryptRecord(record, wrongKey, ad)).toThrow()
    // Sanity: only the real data key recovers the plaintext.
    expect(() => decryptRecord(record, dataKey, ad)).not.toThrow()
  })
})

// ── Extra coverage: schema-invalid → quarantine; own-op decrypt fail → wrong-key

describe('quarantine + wrong-key paths', () => {
  it('a decrypted-but-malformed row is quarantined as SCHEMA_INVALID', async () => {
    const server = new FakeVaultServer()
    const dataKey = generateDataKey()
    const b = makeDevice(DEVICE_B, server, dataKey)

    // Correct AD (decrypts fine) but data missing required columns → schema rejects it.
    const env = buildEnvelope({
      opType: 'upsert',
      clock: { [DEVICE_Z]: 1 },
      updatedAt: now(),
      data: { id: 'T' },
    })
    const ct = encrypt(
      new TextEncoder().encode(serializeEnvelope(env)),
      dataKey,
      adFor('trades', 'T'),
    )
    server.push(DEVICE_Z, [
      { table_name: 'trades', record_id: 'T', op_type: 'upsert', payload_ciphertext: ct },
    ])

    const rb = await pull(b)
    expect(rb.kind).toBe('pulled')
    expect(b.store.quarantines[0]?.reason).toBe('SCHEMA_INVALID')
    expect(b.store.rows.get('trades')?.get('T')).toBeUndefined()
  })

  it('our OWN op failing to decrypt is the loud wrong-key case (apply nothing)', async () => {
    const server = new FakeVaultServer()
    const a = makeDevice(DEVICE_A, server, generateDataKey())

    // Encrypt under a different key than A now holds, attributed to A → key is wrong.
    const env = buildEnvelope({
      opType: 'upsert',
      clock: { [DEVICE_A]: 1 },
      updatedAt: now(),
      data: tradeRow(),
    })
    const ct = encrypt(
      new TextEncoder().encode(serializeEnvelope(env)),
      generateDataKey(),
      adFor('trades', 'T'),
    )
    server.push(DEVICE_A, [
      { table_name: 'trades', record_id: 'T', op_type: 'upsert', payload_ciphertext: ct },
    ])

    const ra = await pull(a)
    expect(ra.kind).toBe('wrong-key')
    expect(a.store.quarantines).toHaveLength(0) // §8: halt, don't quarantine our own vault
    expect(a.store.rows.get('trades')?.get('T')).toBeUndefined()
  })
})
