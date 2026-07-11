// @vitest-environment node
//
// Integration test for playbook CRUD IPC handlers.
// Uses the same sql.js + drizzle pattern as notebook.test.ts.

import { vi, describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { IpcResponse, Playbook } from '../../shared/types/index'

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

let injectedDb: unknown
vi.mock('../../electron/db/index', () => ({ getDb: () => injectedDb }))

import { registerPlaybookHandlers } from '../../electron/ipc/playbooks'

const MIGRATIONS = [
  '0001_initial',
  '0002_v11',
  '0003_opened_at',
  '0004_consolidate_partials',
  '0005_dismissed_insights',
  '0006_notebook',
  '0007_notebook_account',
  '0008_external_ref',
  '0009_phase2',
  '0010_playbooks',
  '0011_sync',
  '0012_sync_merge',
  '0013_sync_clocks',
  '0014_live_detection_outcome',
  '0015_broker_account_map',
  '0016_account_phases',
  '0017_daily_locks',
  '0018_pre_trade_gate',
].map((t) => readFileSync(join(__dirname, `../../electron/db/migrations/${t}.sql`), 'utf-8'))

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs()
  registerPlaybookHandlers()
})

// ─── Test DB ──────────────────────────────────────────────────────────────────

const FIRM_ID = '00000000-0000-0000-0000-000000000001'
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000002'
const SETUP_ID = '00000000-0000-0000-0000-000000000003'
const PAIR_ID = '00000000-0000-0000-0000-000000000004'
const KZ_ID = '00000000-0000-0000-0000-000000000005'

function makeDb() {
  const sqlite = new SQL.Database()
  for (const sql of MIGRATIONS) {
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const t = stmt.trim()
      if (t) sqlite.run(t)
    }
  }
  const db = drizzle(sqlite, { schema })
  injectedDb = db
  const now = Date.UTC(2024, 0, 1)

  db.insert(schema.propFirms)
    .values({
      id: FIRM_ID,
      name: 'Test Firm',
      defaultStepCount: 1,
      notes: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run()
  db.insert(schema.accounts)
    .values({
      id: ACCOUNT_ID,
      displayName: 'Demo',
      templateId: null,
      propFirmId: FIRM_ID,
      stepCount: 1,
      currentPhase: 1,
      accountSizeCents: 1_000_000,
      leverage: 100,
      dailyDrawdownType: 'percent_of_balance',
      dailyDrawdownValue: 500,
      totalDrawdownType: 'percent_of_balance',
      totalDrawdownValue: 1000,
      drawdownBasis: 'initial_balance',
      profitTargetPct: 1000,
      minTradingDays: null,
      maxTradingDays: null,
      weekendHoldingAllowed: 0,
      newsTradingAllowed: 1,
      consistencyRulePct: null,
      challengeCostCents: 10000,
      startDate: now,
      status: 'active',
      endDate: null,
      endReason: null,
      peakEquityCents: 1_000_000,
      currentEquityCents: 1_000_000,
      notes: null,
      dailyTradeLimit: null,
      maxDailyLossPct: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run()
  db.insert(schema.setups)
    .values({
      id: SETUP_ID,
      name: 'ICT FVG',
      category: 'ict',
      description: null,
      color: '#4CAF50',
      active: 1,
      displayOrder: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(schema.pairs)
    .values({
      id: PAIR_ID,
      symbol: 'EURUSD',
      displayName: 'EUR/USD',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 1000,
      correlatedWith: null,
      active: 1,
      displayOrder: 1,
      notes: null,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(schema.killzones)
    .values({
      id: KZ_ID,
      name: 'London Open',
      startTimeUtc: '07:00',
      endTimeUtc: '10:00',
      color: '#4CAF50',
      active: 1,
      displayOrder: 1,
      notes: null,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return db
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('playbooks:create', () => {
  it('creates a playbook and returns it with all fields', () => {
    makeDb()
    const pb = unwrap<Playbook>(
      call('playbooks:create', {
        accountId: ACCOUNT_ID,
        name: 'ICT FVG Long — London',
        setupId: SETUP_ID,
        pairId: PAIR_ID,
        killzoneId: KZ_ID,
        defaultRiskPct: 150, // 1.50%
        defaultInvalidationChip: 'below-ob',
        requiredConfluenceMd: '# Required\n- OB unmitigated\n- MSS confirmed',
      }),
    )

    expect(pb.name).toBe('ICT FVG Long — London')
    expect(pb.accountId).toBe(ACCOUNT_ID)
    expect(pb.setupId).toBe(SETUP_ID)
    expect(pb.pairId).toBe(PAIR_ID)
    expect(pb.killzoneId).toBe(KZ_ID)
    expect(pb.defaultRiskPct).toBe(150)
    expect(pb.defaultInvalidationChip).toBe('below-ob')
    expect(pb.requiredConfluenceMd).toContain('OB unmitigated')
    expect(pb.version).toBe(1)
    expect(pb.deletedAt).toBeNull()
  })

  it('creates a minimal playbook (only required fields)', () => {
    makeDb()
    const pb = unwrap<Playbook>(
      call('playbooks:create', {
        accountId: ACCOUNT_ID,
        name: 'EURUSD OB',
        setupId: SETUP_ID,
      }),
    )
    expect(pb.pairId).toBeNull()
    expect(pb.killzoneId).toBeNull()
    expect(pb.defaultRiskPct).toBeNull()
    expect(pb.defaultInvalidationChip).toBeNull()
    expect(pb.requiredConfluenceMd).toBeNull()
  })

  it('rejects when name is empty', () => {
    makeDb()
    const res = call<Playbook>('playbooks:create', {
      accountId: ACCOUNT_ID,
      name: '',
      setupId: SETUP_ID,
    })
    expect(res.ok).toBe(false)
  })

  it('rejects when setupId is missing', () => {
    makeDb()
    const res = call<Playbook>('playbooks:create', { accountId: ACCOUNT_ID, name: 'X' })
    expect(res.ok).toBe(false)
  })
})

describe('playbooks:list', () => {
  it('returns all non-deleted playbooks for the account, ordered by name', () => {
    makeDb()
    unwrap(call('playbooks:create', { accountId: ACCOUNT_ID, name: 'Zebra OB', setupId: SETUP_ID }))
    unwrap(
      call('playbooks:create', { accountId: ACCOUNT_ID, name: 'Alpha FVG', setupId: SETUP_ID }),
    )

    const list = unwrap<Playbook[]>(call('playbooks:list', { accountId: ACCOUNT_ID }))
    expect(list.length).toBeGreaterThanOrEqual(2)
    const names = list.map((p) => p.name)
    // Alphabetical: Alpha before Zebra
    expect(names.indexOf('Alpha FVG')).toBeLessThan(names.indexOf('Zebra OB'))
  })

  it('does not return soft-deleted playbooks', () => {
    makeDb()
    const pb = unwrap<Playbook>(
      call('playbooks:create', { accountId: ACCOUNT_ID, name: 'Deleted PB', setupId: SETUP_ID }),
    )
    unwrap(call('playbooks:delete', { id: pb.id }))

    const list = unwrap<Playbook[]>(call('playbooks:list', { accountId: ACCOUNT_ID }))
    expect(list.map((p) => p.name)).not.toContain('Deleted PB')
  })
})

describe('playbooks:update', () => {
  it('updates allowed fields and bumps version', () => {
    makeDb()
    const pb = unwrap<Playbook>(
      call('playbooks:create', {
        accountId: ACCOUNT_ID,
        name: 'Original Name',
        setupId: SETUP_ID,
      }),
    )
    expect(pb.version).toBe(1)

    const updated = unwrap<Playbook>(
      call('playbooks:update', {
        id: pb.id,
        name: 'Updated Name',
        defaultRiskPct: 200,
      }),
    )
    expect(updated.name).toBe('Updated Name')
    expect(updated.defaultRiskPct).toBe(200)
    expect(updated.version).toBe(2)
  })

  it('can null out optional fields', () => {
    makeDb()
    const pb = unwrap<Playbook>(
      call('playbooks:create', {
        accountId: ACCOUNT_ID,
        name: 'With Pair',
        setupId: SETUP_ID,
        pairId: PAIR_ID,
      }),
    )
    const updated = unwrap<Playbook>(call('playbooks:update', { id: pb.id, pairId: null }))
    expect(updated.pairId).toBeNull()
  })

  it('returns NOT_FOUND for an unknown id', () => {
    makeDb()
    const res = call<Playbook>('playbooks:update', {
      id: '00000000-0000-0000-0000-000000000099',
      name: 'Ghost',
    })
    expect(res.ok).toBe(false)
  })
})

describe('playbooks:delete', () => {
  it('soft-deletes a playbook (it is not returned by list)', () => {
    makeDb()
    const pb = unwrap<Playbook>(
      call('playbooks:create', {
        accountId: ACCOUNT_ID,
        name: 'To Delete',
        setupId: SETUP_ID,
      }),
    )
    unwrap(call('playbooks:delete', { id: pb.id }))

    const list = unwrap<Playbook[]>(call('playbooks:list', { accountId: ACCOUNT_ID }))
    expect(list.map((p) => p.id)).not.toContain(pb.id)
  })

  it('playbooks:get returns NOT_FOUND after soft-delete', () => {
    makeDb()
    const pb = unwrap<Playbook>(
      call('playbooks:create', {
        accountId: ACCOUNT_ID,
        name: 'To Delete Get',
        setupId: SETUP_ID,
      }),
    )
    unwrap(call('playbooks:delete', { id: pb.id }))
    const res = call<Playbook>('playbooks:get', { id: pb.id })
    expect(res.ok).toBe(false)
  })
})
