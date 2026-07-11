// @vitest-environment node
//
// Integration tests for per-phase prop-firm account support (migration 0016 +
// electron/ipc/accounts.ts). Same sql.js + drizzle + mocked-ipcMain pattern as
// playbooks.test.ts. Exercises the real IPC handlers end-to-end:
//   • accounts:create persists + returns the per-phase ladder,
//   • the DENORMALIZATION CONTRACT — the account row mirrors the ACTIVE phase,
//   • accounts:advancePhase copies phase N+1 onto the account and blocks at the last phase,
//   • accounts:updatePhases upserts/soft-deletes phases, keeps stepCount in sync,
//     re-denormalizes the active phase, and preserves trading-day limits the UI omits,
//   • the sync write path enqueues account + account_phases ops.

import { vi, describe, it, expect, beforeAll, afterEach } from 'vitest'
import type { IpcResponse, Account } from '../../shared/types/index'

type IpcHandler = (e: unknown, raw: unknown) => unknown
const handlers = new Map<string, IpcHandler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((ch: string, fn: IpcHandler) => {
      handlers.set(ch, fn)
    }),
  },
  app: { getPath: () => '/tmp' },
}))

import initSqlJs from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import * as schema from '../../electron/db/schema'
import { applyAllMigrations } from '../helpers/test-migrations'
import type { CairnDb } from '../../electron/db/index'

let injectedDb: unknown
vi.mock('../../electron/db/index', () => ({ getDb: () => injectedDb }))

import { registerAccountHandlers } from '../../electron/ipc/accounts'
import { setSyncWriteContext, VectorClockCache } from '../../electron/services/sync'

const PROP_FIRM_ID = '00000000-0000-0000-0000-000000000001'
const SYNC_DEVICE_ID = '99999999-9999-9999-9999-999999999999'

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs()
  registerAccountHandlers()
})

afterEach(() => setSyncWriteContext(null))

/** Fresh migrated DB with a single seeded prop firm; wired as the injected `getDb()`. */
function makeDb(): CairnDb {
  const sqlite = new SQL.Database()
  applyAllMigrations(sqlite)
  const db = drizzle(sqlite, { schema })
  injectedDb = db
  const now = Date.UTC(2026, 0, 1)
  db.insert(schema.propFirms)
    .values({
      id: PROP_FIRM_ID,
      name: 'Test Firm',
      defaultStepCount: 2,
      notes: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run()
  return db as unknown as CairnDb
}

function call<T>(name: string, raw: unknown): IpcResponse<T> {
  const fn = handlers.get(name)
  if (!fn) throw new Error(`handler not registered: ${name}`)
  return fn({}, raw) as IpcResponse<T>
}

function unwrap<T>(res: IpcResponse<T>): T {
  if (!res.ok) throw new Error(`expected ok, got ${res.error.code}: ${res.error.message}`)
  return res.data
}

// ─── Input builders ─────────────────────────────────────────────────────────

type Overrides = Record<string, unknown>

/** A valid `accounts:create` payload; override any field (including `phases`). */
function createInput(overrides: Overrides = {}): Overrides {
  return {
    displayName: 'Test Account',
    propFirmId: PROP_FIRM_ID,
    stepCount: 2,
    currentPhase: 1,
    accountSizeCents: 1_000_000,
    leverage: 100,
    dailyDrawdownType: 'percent_of_balance',
    dailyDrawdownValue: 500,
    totalDrawdownType: 'percent_of_balance',
    totalDrawdownValue: 1000,
    drawdownBasis: 'initial_balance',
    profitTargetPct: 800,
    weekendHoldingAllowed: false,
    newsTradingAllowed: false,
    challengeCostCents: 0,
    startDate: Date.UTC(2026, 0, 1),
    ...overrides,
  }
}

/** One phase-input entry (bps). `target: null` = no target (funded phase). */
function phaseInput(
  n: number,
  target: number | null,
  daily: number,
  total: number,
  extra: Overrides = {},
): Overrides {
  return {
    phaseNumber: n,
    profitTargetPct: target,
    dailyDrawdownType: 'percent_of_balance',
    dailyDrawdownValue: daily,
    totalDrawdownType: 'percent_of_balance',
    totalDrawdownValue: total,
    ...extra,
  }
}

const phaseByNumber = (acc: Account, n: number) => acc.phases.find((p) => p.phaseNumber === n)

// ─── accounts:create ──────────────────────────────────────────────────────────

describe('accounts:create — per-phase ladder', () => {
  it('round-trips a 2-phase account (phases persisted + returned, active phase denormalized)', () => {
    makeDb()
    const acc = unwrap<Account>(
      call('accounts:create', {
        ...createInput(),
        phases: [phaseInput(1, 800, 500, 1000), phaseInput(2, 500, 400, 800)],
      }),
    )

    // Returned DTO carries the full ladder, ordered by phase number.
    expect(acc.phases.map((p) => p.phaseNumber)).toEqual([1, 2])
    expect(phaseByNumber(acc, 1)?.profitTargetPct).toBe(800)
    expect(phaseByNumber(acc, 2)?.profitTargetPct).toBe(500)
    expect(phaseByNumber(acc, 2)?.dailyDrawdownValue).toBe(400)
    expect(phaseByNumber(acc, 2)?.totalDrawdownValue).toBe(800)

    // Denormalization contract: the account row mirrors the ACTIVE phase (1).
    expect(acc.currentPhase).toBe(1)
    expect(acc.profitTargetPct).toBe(800)
    expect(acc.dailyDrawdownValue).toBe(500)
    expect(acc.totalDrawdownValue).toBe(1000)

    // Persisted — accounts:list returns the ladder too.
    const listed = unwrap<Account[]>(call('accounts:list', undefined))
    expect(listed.find((a) => a.id === acc.id)?.phases.length).toBe(2)
  })

  it('inherits top-level trading-day + consistency limits when supplied phases omit them', () => {
    makeDb()
    const acc = unwrap<Account>(
      call('accounts:create', {
        ...createInput({ minTradingDays: 7, maxTradingDays: 25, consistencyRulePct: 1500 }),
        // Phases carry no trading-day fields (the PhaseRulesFields UI never sets them).
        phases: [phaseInput(1, 800, 500, 1000), phaseInput(2, 500, 400, 800)],
      }),
    )
    // Account row keeps the account-wide limits …
    expect(acc.minTradingDays).toBe(7)
    expect(acc.maxTradingDays).toBe(25)
    expect(acc.consistencyRulePct).toBe(1500)
    // … and every stored phase row inherits them (matches the 0016 backfill).
    expect(phaseByNumber(acc, 1)?.minTradingDays).toBe(7)
    expect(phaseByNumber(acc, 2)?.maxTradingDays).toBe(25)
    expect(phaseByNumber(acc, 2)?.consistencyRulePct).toBe(1500)
  })

  it('synthesizes one phase per step from the single values when no phases are supplied', () => {
    makeDb()
    const acc = unwrap<Account>(
      call('accounts:create', createInput({ stepCount: 3, currentPhase: 1, profitTargetPct: 800 })),
    )
    expect(acc.phases.map((p) => p.phaseNumber)).toEqual([1, 2, 3])
    for (const p of acc.phases) {
      expect(p.profitTargetPct).toBe(800)
      expect(p.dailyDrawdownValue).toBe(500)
      expect(p.totalDrawdownValue).toBe(1000)
    }
  })

  it('stores a 0 single target as a null phase target (funded phase)', () => {
    makeDb()
    const acc = unwrap<Account>(
      call('accounts:create', createInput({ stepCount: 1, currentPhase: 1, profitTargetPct: 0 })),
    )
    expect(phaseByNumber(acc, 1)?.profitTargetPct).toBeNull()
    expect(acc.profitTargetPct).toBe(0) // account column is NOT NULL → 0 means "no target"
  })

  it('rejects a phases array whose length does not match stepCount', () => {
    makeDb()
    const res = call<Account>('accounts:create', {
      ...createInput({ stepCount: 3 }),
      phases: [phaseInput(1, 800, 500, 1000), phaseInput(2, 500, 400, 800)],
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_ERROR')
  })
})

// ─── accounts:advancePhase ──────────────────────────────────────────────────

describe('accounts:advancePhase', () => {
  it('copies phase N+1 onto the account row and bumps current_phase (one step)', () => {
    makeDb()
    const acc = unwrap<Account>(
      call('accounts:create', {
        ...createInput({ stepCount: 2, currentPhase: 1 }),
        phases: [phaseInput(1, 800, 500, 1000), phaseInput(2, 500, 400, 800)],
      }),
    )

    const advanced = unwrap<Account>(call('accounts:advancePhase', { accountId: acc.id }))
    expect(advanced.currentPhase).toBe(2)
    // Denormalization contract: phase 2's values are now on the account row.
    expect(advanced.profitTargetPct).toBe(500)
    expect(advanced.dailyDrawdownValue).toBe(400)
    expect(advanced.totalDrawdownValue).toBe(800)
    // The ladder itself is unchanged (advancePhase never edits phase rows).
    expect(advanced.phases.map((p) => p.phaseNumber)).toEqual([1, 2])
  })

  it('denormalizes a null-target next phase to a 0 account target (advancing to funded)', () => {
    makeDb()
    const acc = unwrap<Account>(
      call('accounts:create', {
        ...createInput({ stepCount: 2, currentPhase: 1 }),
        phases: [phaseInput(1, 800, 500, 1000), phaseInput(2, null, 400, 800)],
      }),
    )
    const advanced = unwrap<Account>(call('accounts:advancePhase', { accountId: acc.id }))
    expect(advanced.currentPhase).toBe(2)
    expect(advanced.profitTargetPct).toBe(0)
  })

  it('blocks advancing past the final phase', () => {
    makeDb()
    const acc = unwrap<Account>(
      call('accounts:create', {
        ...createInput({ stepCount: 2, currentPhase: 2 }),
        phases: [phaseInput(1, 800, 500, 1000), phaseInput(2, 500, 400, 800)],
      }),
    )
    const res = call<Account>('accounts:advancePhase', { accountId: acc.id })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns NOT_FOUND for an unknown account', () => {
    makeDb()
    const res = call<Account>('accounts:advancePhase', {
      accountId: '00000000-0000-0000-0000-0000000000aa',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND')
  })
})

// ─── accounts:updatePhases ──────────────────────────────────────────────────

describe('accounts:updatePhases', () => {
  it('adds a phase, growing stepCount to match', () => {
    makeDb()
    const acc = unwrap<Account>(
      call('accounts:create', {
        ...createInput({ stepCount: 2, currentPhase: 1 }),
        phases: [phaseInput(1, 800, 500, 1000), phaseInput(2, 500, 400, 800)],
      }),
    )
    const updated = unwrap<Account>(
      call('accounts:updatePhases', {
        accountId: acc.id,
        phases: [
          phaseInput(1, 800, 500, 1000),
          phaseInput(2, 500, 400, 800),
          phaseInput(3, 300, 400, 800),
        ],
      }),
    )
    expect(updated.stepCount).toBe(3)
    expect(updated.phases.map((p) => p.phaseNumber)).toEqual([1, 2, 3])
    expect(phaseByNumber(updated, 3)?.profitTargetPct).toBe(300)
  })

  it('removes phases, clamps current_phase, soft-deletes them, and re-denormalizes the active phase', () => {
    makeDb()
    const acc = unwrap<Account>(
      call('accounts:create', {
        ...createInput({ stepCount: 3, currentPhase: 2 }),
        phases: [
          phaseInput(1, 800, 500, 1000),
          phaseInput(2, 500, 400, 800),
          phaseInput(3, 300, 300, 600),
        ],
      }),
    )
    const updated = unwrap<Account>(
      call('accounts:updatePhases', {
        accountId: acc.id,
        phases: [phaseInput(1, 850, 550, 1100)],
      }),
    )
    expect(updated.stepCount).toBe(1)
    expect(updated.currentPhase).toBe(1) // clamped down from 2
    expect(updated.phases.map((p) => p.phaseNumber)).toEqual([1]) // 2 & 3 soft-deleted
    // The (new) active phase's values are re-denormalized onto the account row.
    expect(updated.profitTargetPct).toBe(850)
    expect(updated.dailyDrawdownValue).toBe(550)
    expect(updated.totalDrawdownValue).toBe(1100)
    expect(phaseByNumber(updated, 1)?.profitTargetPct).toBe(850)
  })

  it('re-denormalizes an edited active phase onto the account row', () => {
    makeDb()
    const acc = unwrap<Account>(
      call('accounts:create', {
        ...createInput({ stepCount: 2, currentPhase: 1 }),
        phases: [phaseInput(1, 800, 500, 1000), phaseInput(2, 500, 400, 800)],
      }),
    )
    const updated = unwrap<Account>(
      call('accounts:updatePhases', {
        accountId: acc.id,
        phases: [phaseInput(1, 999, 600, 1200), phaseInput(2, 500, 400, 800)],
      }),
    )
    expect(updated.profitTargetPct).toBe(999)
    expect(updated.dailyDrawdownValue).toBe(600)
    expect(updated.totalDrawdownValue).toBe(1200)
  })

  it('preserves trading-day + consistency limits when the edited phases omit them', () => {
    makeDb()
    // Created via the synthesized path (no phases) so every phase carries the limits.
    const acc = unwrap<Account>(
      call(
        'accounts:create',
        createInput({
          stepCount: 2,
          currentPhase: 1,
          minTradingDays: 5,
          maxTradingDays: 20,
          consistencyRulePct: 3000,
        }),
      ),
    )
    expect(acc.minTradingDays).toBe(5)

    // Edit only the profit target — the UI never sends min/max/consistency.
    const updated = unwrap<Account>(
      call('accounts:updatePhases', {
        accountId: acc.id,
        phases: [phaseInput(1, 950, 500, 1000), phaseInput(2, 500, 500, 1000)],
      }),
    )
    // Preserved on the account row …
    expect(updated.minTradingDays).toBe(5)
    expect(updated.maxTradingDays).toBe(20)
    expect(updated.consistencyRulePct).toBe(3000)
    // … and on the surviving phase rows.
    expect(phaseByNumber(updated, 1)?.minTradingDays).toBe(5)
    expect(phaseByNumber(updated, 2)?.consistencyRulePct).toBe(3000)
    // The edited target still denormalizes.
    expect(updated.profitTargetPct).toBe(950)
  })

  it('returns NOT_FOUND for an unknown account', () => {
    makeDb()
    const res = call<Account>('accounts:updatePhases', {
      accountId: '00000000-0000-0000-0000-0000000000bb',
      phases: [phaseInput(1, 800, 500, 1000)],
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND')
  })
})

// ─── Sync enqueue ─────────────────────────────────────────────────────────────

interface QueueRow {
  tableName: string
  recordId: string
  opType: string
}

/** All `sync_queue` rows currently in the injected DB. */
function queuedOps(db: CairnDb): QueueRow[] {
  return db
    .select({
      tableName: schema.syncQueue.tableName,
      recordId: schema.syncQueue.recordId,
      opType: schema.syncQueue.opType,
    })
    .from(schema.syncQueue)
    .all()
}

function enableSync(db: CairnDb, now = 1000): void {
  const clock = new VectorClockCache(SYNC_DEVICE_ID)
  clock.hydrate(() => [])
  setSyncWriteContext({ db, clock, now: () => now })
}

describe('accounts — sync enqueue', () => {
  it('enqueues the account plus one upsert per phase row on create', () => {
    const db = makeDb()
    enableSync(db)
    const acc = unwrap<Account>(
      call('accounts:create', {
        ...createInput({ stepCount: 2, currentPhase: 1 }),
        phases: [phaseInput(1, 800, 500, 1000), phaseInput(2, 500, 400, 800)],
      }),
    )

    const ops = queuedOps(db)
    expect(ops.some((o) => o.tableName === 'accounts' && o.recordId === acc.id)).toBe(true)
    const phaseOps = ops.filter((o) => o.tableName === 'account_phases')
    expect(phaseOps.length).toBe(2)
    expect(phaseOps.every((o) => o.opType === 'upsert')).toBe(true)
    // Every enqueued phase op targets a real created phase row.
    const phaseIds = new Set(acc.phases.map((p) => p.id))
    expect(phaseOps.every((o) => phaseIds.has(o.recordId))).toBe(true)
  })

  it('enqueues a surviving-phase upsert + a delete per removed phase on updatePhases', () => {
    const db = makeDb()
    // Create BEFORE enabling sync so only the updatePhases ops land in the queue.
    const acc = unwrap<Account>(
      call('accounts:create', {
        ...createInput({ stepCount: 3, currentPhase: 1 }),
        phases: [
          phaseInput(1, 800, 500, 1000),
          phaseInput(2, 500, 400, 800),
          phaseInput(3, 300, 300, 600),
        ],
      }),
    )
    enableSync(db, 2000)
    unwrap<Account>(
      call('accounts:updatePhases', {
        accountId: acc.id,
        phases: [phaseInput(1, 800, 500, 1000)], // shrink 3 → 1
      }),
    )

    const ops = queuedOps(db)
    const phaseUpserts = ops.filter(
      (o) => o.tableName === 'account_phases' && o.opType === 'upsert',
    )
    const phaseDeletes = ops.filter(
      (o) => o.tableName === 'account_phases' && o.opType === 'delete',
    )
    expect(phaseUpserts.length).toBe(1) // surviving phase 1
    expect(phaseDeletes.length).toBe(2) // phases 2 & 3 tombstoned
    expect(ops.some((o) => o.tableName === 'accounts' && o.opType === 'upsert')).toBe(true)
  })
})
