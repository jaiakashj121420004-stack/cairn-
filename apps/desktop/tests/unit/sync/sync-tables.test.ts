// @vitest-environment node
//
// Per-table sync coverage for the Stage-4 tables registered in TABLE_SPECS
// (accounts, sessions, playbooks, notebook_entries, trade_partials) — the same
// FakeSyncStore + in-process FakeVaultServer harness as merge.test.ts, exercising the
// REAL crypto, serialization, vector-clock, schema-validation, and decision logic.
//
// Each table proves two invariants required by Stage 4:
//   1. round-trip: an edit on A pulled by B applies cleanly (B sees A's data),
//   2. concurrency: two offline edits to the same record surface a conflict on BOTH
//      devices (neither clock dominates) — never a silent overwrite.
import { beforeAll, describe, expect, it } from 'vitest'

import {
  adFor,
  buildEnvelope,
  createDecryptOp,
  createEncryptOp,
  isSyncableTable,
  pullOnce,
  serializeEnvelope,
  validateSyncRow,
  VectorClockCache,
} from '../../../electron/services/sync'
import { generateDataKey, initCrypto } from '../../../electron/services/crypto'
import type {
  AuditRecord,
  ConflictRecord,
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
import type { SyncOpType, VectorClock } from '@cairn/sync-protocol'

beforeAll(async () => {
  await initCrypto()
})

const silentLog: SyncLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
const encrypt = createEncryptOp()
const decrypt = createDecryptOp()
const DEVICE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const DEVICE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

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
    return {
      ops: this.ops.filter((o) => o.id > since).sort((a, b) => a.id - b.id),
      next_cursor: null,
    }
  }
}

function serverClient(server: FakeVaultServer, deviceId: string): VaultApi {
  return {
    push: (input) =>
      Promise.resolve({ status: 200, body: { op_ids: server.push(deviceId, input.ops) } }),
    pull: (input) => Promise.resolve({ status: 200, body: server.pull(input) } as VaultHttpResult),
  }
}

class FakeSyncStore implements SyncLocalStore {
  readonly rows = new Map<string, Map<string, Record<string, unknown>>>()
  readonly conflicts: ConflictRecord[] = []
  readonly quarantines: QuarantineRecord[] = []
  readonly audits: AuditRecord[] = []
  readonly clocks = new Map<string, string>()
  private cursor = 0
  private tbl(table: string): Map<string, Record<string, unknown>> {
    let m = this.rows.get(table)
    if (!m) {
      m = new Map()
      this.rows.set(table, m)
    }
    return m
  }
  knows = (table: string): boolean => isSyncableTable(table)
  validate = (table: string, data: unknown): Record<string, unknown> => validateSyncRow(table, data)
  snapshotRaw = (table: string, recordId: string): Record<string, unknown> | null =>
    this.tbl(table).get(recordId) ?? null
  upsert(table: string, data: Record<string, unknown>): void {
    this.tbl(table).set(String(data.id), data)
  }
  remove(table: string, recordId: string, updatedAt: number): void {
    const row = this.tbl(table).get(recordId)
    if (row) this.tbl(table).set(recordId, { ...row, deletedAt: updatedAt })
  }
  recordConflict = (c: ConflictRecord): void => void this.conflicts.push(c)
  quarantine = (q: QuarantineRecord): void => void this.quarantines.push(q)
  audit = (a: AuditRecord): void => void this.audits.push(a)
  setClock(table: string, recordId: string, clock: VectorClock): void {
    this.clocks.set(`${table} ${recordId}`, JSON.stringify(clock))
  }
  setCursor = (lastOpId: number): void => void (this.cursor = lastOpId)
  getCursor = (): number => this.cursor
  transaction(fn: () => void): void {
    fn()
  }
}

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

let nowSeq = 0
const now = (): number => 1_700_000_000_000 + ++nowSeq

function pull(dev: Device): Promise<PullOutcome> {
  const ctx: SyncContext = {
    getDeviceId: () => dev.id,
    getDataKey: () => dev.dataKey,
    getAccessToken: () => 'tok',
    refresh: () => Promise.resolve('tok'),
  }
  return pullOnce({
    api: dev.api,
    ctx,
    decrypt,
    store: dev.store,
    clock: dev.clock,
    log: silentLog,
    now,
  })
}

function pushEdit(
  dev: Device,
  server: FakeVaultServer,
  table: string,
  recordId: string,
  data: Record<string, unknown>,
): void {
  const clock = dev.clock.bumpLocal(table, recordId)
  const env = buildEnvelope({ opType: 'upsert', clock, updatedAt: now(), data })
  const ct = encrypt(
    new TextEncoder().encode(serializeEnvelope(env)),
    dev.dataKey,
    adFor(table, recordId),
  )
  server.push(dev.id, [
    { table_name: table, record_id: recordId, op_type: 'upsert', payload_ciphertext: ct },
  ])
}

// ── Per-table fixtures: a valid full row + a field the second edit changes ──────

interface TableCase {
  readonly table: string
  readonly id: string
  row(over: Record<string, unknown>): Record<string, unknown>
  /** A field that distinguishes the two edits (typed to match the column). */
  readonly probe: string
  /** Three type-correct distinct values: round-trip uses A; conflict uses A vs B. */
  readonly valA: string | number
  readonly valB: string | number
}

const CASES: TableCase[] = [
  {
    table: 'accounts',
    id: 'acc-1',
    probe: 'currentEquityCents',
    valA: 4242,
    valB: 222,
    row: (over) => ({
      id: 'acc-1',
      displayName: 'Eval',
      propFirmId: 'firm',
      stepCount: 1,
      currentPhase: 1,
      accountSizeCents: 5_000_000,
      leverage: 100,
      dailyDrawdownType: 'percent_of_balance',
      dailyDrawdownValue: 500,
      totalDrawdownType: 'percent_of_balance',
      totalDrawdownValue: 1000,
      drawdownBasis: 'initial_balance',
      profitTargetPct: 800,
      weekendHoldingAllowed: 0,
      newsTradingAllowed: 0,
      challengeCostCents: 10_000,
      startDate: 1,
      status: 'active',
      peakEquityCents: 5_000_000,
      currentEquityCents: 5_000_000,
      createdAt: 1,
      updatedAt: 1,
      ...over,
    }),
  },
  {
    table: 'sessions',
    id: 'sess-1',
    probe: 'dailyBiasReason',
    valA: 'reason from A',
    valB: 'reason from B',
    row: (over) => ({
      id: 'sess-1',
      accountId: 'acc',
      sessionDate: '2026-06-06',
      dailyBias: 'bullish',
      dailyBiasReason: 'liquidity sweep',
      h4Bias: 'bullish',
      h4BiasReason: 'ob',
      h1Bias: 'bullish',
      h1BiasReason: 'fvg',
      createdAt: 1,
      updatedAt: 1,
      ...over,
    }),
  },
  {
    table: 'playbooks',
    id: 'pb-1',
    probe: 'name',
    valA: 'NY AM from A',
    valB: 'NY AM from B',
    row: (over) => ({
      id: 'pb-1',
      accountId: 'acc',
      name: 'NY AM reversal',
      setupId: 'setup',
      version: 1,
      createdAt: 1,
      updatedAt: 1,
      ...over,
    }),
  },
  {
    table: 'notebook_entries',
    id: 'nb-1',
    probe: 'content',
    valA: 'content from A',
    valB: 'content from B',
    row: (over) => ({
      id: 'nb-1',
      title: 'Weekly review',
      content: 'notes',
      pinned: 0,
      version: 1,
      createdAt: 1,
      updatedAt: 1,
      ...over,
    }),
  },
  {
    table: 'trade_partials',
    id: 'tp-1',
    probe: 'closePercentBps',
    valA: 4242,
    valB: 222,
    row: (over) => ({
      id: 'tp-1',
      tradeId: 'trade',
      closePercentBps: 5000,
      exitPrice: 109123,
      exitTime: 1000,
      createdAt: 1,
      ...over,
    }),
  },
]

describe.each(CASES)('sync round-trip + conflict for $table', (c) => {
  it('round-trip: an edit on A is pulled and applied by B', async () => {
    const server = new FakeVaultServer()
    const dataKey = generateDataKey()
    const a = makeDevice(DEVICE_A, server, dataKey)
    const b = makeDevice(DEVICE_B, server, dataKey)

    pushEdit(a, server, c.table, c.id, c.row({ [c.probe]: c.valA }))

    const rb = await pull(b)
    expect(rb).toEqual<PullOutcome>({ kind: 'pulled', applied: 1, conflicts: 0, quarantined: 0 })
    expect(b.store.rows.get(c.table)?.get(c.id)?.[c.probe]).toBe(c.valA)
    // B's durable clock now carries A's component (restart-safe causality).
    expect(b.store.clocks.get(`${c.table} ${c.id}`)).toBe(JSON.stringify({ [DEVICE_A]: 1 }))
  })

  it('two-device concurrent edit surfaces a conflict on BOTH devices', async () => {
    const server = new FakeVaultServer()
    const dataKey = generateDataKey()
    const a = makeDevice(DEVICE_A, server, dataKey)
    const b = makeDevice(DEVICE_B, server, dataKey)

    pushEdit(a, server, c.table, c.id, c.row({ [c.probe]: c.valA }))
    pushEdit(b, server, c.table, c.id, c.row({ [c.probe]: c.valB }))

    const ra = await pull(a)
    const rb = await pull(b)
    expect(ra).toEqual<PullOutcome>({ kind: 'pulled', applied: 0, conflicts: 1, quarantined: 0 })
    expect(rb).toEqual<PullOutcome>({ kind: 'pulled', applied: 0, conflicts: 1, quarantined: 0 })
    expect(a.store.conflicts[0]?.localClock).toEqual({ [DEVICE_A]: 1 })
    expect(a.store.conflicts[0]?.remoteClock).toEqual({ [DEVICE_B]: 1 })
    expect(a.store.audits.some((e) => e.event === 'sync.conflict')).toBe(true)
  })
})
