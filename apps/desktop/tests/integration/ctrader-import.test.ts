// @vitest-environment node
//
// Integration tests for the cTrader import IPC handlers.
// Same sql.js + drizzle-orm/sql-js harness as notebook.test.ts and mt5-import.test.ts.
// Covers: preview, commit, idempotency, partial close storage, unresolved-symbol rejection.

import { vi, describe, it, expect, beforeAll } from 'vitest'
import type { IpcResponse, ImportPreview, ImportCommitResult } from '../../shared/types/index'
import { readFileSync } from 'fs'
import { join } from 'path'

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

let injectedDb: unknown
vi.mock('../../electron/db/index', () => ({ getDb: () => injectedDb }))

import { registerImportHandlers } from '../../electron/ipc/import'

const FIXTURE_DIR = join(__dirname, '../fixtures/import/ctrader')
const SIMPLE_HTML = readFileSync(join(FIXTURE_DIR, 'ctrader-simple.html'), 'utf-8')
const PARTIALS_HTML = readFileSync(join(FIXTURE_DIR, 'ctrader-partials.html'), 'utf-8')

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs()
  registerImportHandlers()
})

// ─── Seed constants ───────────────────────────────────────────────────────────

const PROP_FIRM_ID = '00000000-0000-0000-0000-000000000001'
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000002'
const SETUP_ID = '00000000-0000-0000-0000-000000000003'
const EURUSD_PAIR_ID = '00000000-0000-0000-0000-000000000004'
const GBPUSD_PAIR_ID = '00000000-0000-0000-0000-000000000005'
const USDJPY_PAIR_ID = '00000000-0000-0000-0000-000000000006'
const AUDUSD_PAIR_ID = '00000000-0000-0000-0000-000000000007'

function makeDb() {
  const sqlite = new SQL.Database()
  applyAllMigrations(sqlite)
  const db = drizzle(sqlite, { schema })
  injectedDb = db

  const now = Date.UTC(2024, 0, 1)
  db.insert(schema.propFirms)
    .values({
      id: PROP_FIRM_ID,
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
      propFirmId: PROP_FIRM_ID,
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
      name: 'ICT OB',
      category: 'ict',
      description: null,
      color: '#4CAF50',
      active: 1,
      displayOrder: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  for (const [id, symbol, pd] of [
    [EURUSD_PAIR_ID, 'EURUSD', 4],
    [GBPUSD_PAIR_ID, 'GBPUSD', 4],
    [USDJPY_PAIR_ID, 'USDJPY', 2],
    [AUDUSD_PAIR_ID, 'AUDUSD', 4],
  ] as [string, string, number][]) {
    db.insert(schema.pairs)
      .values({
        id,
        symbol,
        displayName: symbol,
        assetClass: 'forex',
        pipDecimal: pd,
        pipValuePerStandardLotCents: 1000,
        correlatedWith: null,
        active: 1,
        displayOrder: 1,
        notes: null,
        createdAt: now,
        updatedAt: now,
      })
      .run()
  }
  return { db }
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

// ─── Preview tests ────────────────────────────────────────────────────────────

describe('import:previewCtrader', () => {
  it('returns 3 auto-resolved candidates + 1 unresolved (XYZABC)', () => {
    makeDb()
    const preview = unwrap(
      call<ImportPreview>('import:previewCtrader', {
        html: SIMPLE_HTML,
        accountId: ACCOUNT_ID,
      }),
    )
    expect(preview.candidates).toHaveLength(3)
    expect(preview.unresolvedSymbols).toContain('XYZABC')
    expect(preview.parseErrors).toHaveLength(0)
    expect(preview.skippedCount).toBe(0)
  })

  it('does not include XYZABC in candidates', () => {
    makeDb()
    const preview = unwrap(
      call<ImportPreview>('import:previewCtrader', {
        html: SIMPLE_HTML,
        accountId: ACCOUNT_ID,
      }),
    )
    expect(preview.candidates.map((c) => c.symbol)).not.toContain('XYZABC')
  })

  it('USDJPY candidate has status open', () => {
    makeDb()
    const preview = unwrap(
      call<ImportPreview>('import:previewCtrader', {
        html: SIMPLE_HTML,
        accountId: ACCOUNT_ID,
      }),
    )
    const uj = preview.candidates.find((c) => c.symbol === 'USDJPY')
    expect(uj?.status).toBe('open')
  })

  it('rejects an invalid accountId', () => {
    makeDb()
    const res = call<ImportPreview>('import:previewCtrader', {
      html: SIMPLE_HTML,
      accountId: 'not-a-uuid',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_ERROR')
  })
})

// ─── Commit happy path ────────────────────────────────────────────────────────

describe('import:commitCtrader — happy path', () => {
  it('imports 4 trades (EURUSD + GBPUSD + USDJPY + XYZABC→EURUSD) and 0 partials (simple)', () => {
    makeDb()
    const result = unwrap(
      call<ImportCommitResult>('import:commitCtrader', {
        html: SIMPLE_HTML,
        accountId: ACCOUNT_ID,
        symbolMap: { XYZABC: EURUSD_PAIR_ID },
        defaultSetupId: SETUP_ID,
      }),
    )
    expect(result.imported).toBe(4)
    expect(result.partials).toBe(0)
    expect(result.skipped).toBe(0)
  })

  it('stores ctrader_pos_ externalRefs on committed trades', () => {
    const { db } = makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitCtrader', {
        html: SIMPLE_HTML,
        accountId: ACCOUNT_ID,
        symbolMap: { XYZABC: EURUSD_PAIR_ID },
        defaultSetupId: SETUP_ID,
      }),
    )
    const refs = db
      .select({ externalRef: schema.trades.externalRef })
      .from(schema.trades)
      .all()
      .map((r) => r.externalRef)
      .filter(Boolean)
    expect(refs).toContain('ctrader_pos_11111111')
    expect(refs).toContain('ctrader_pos_22222222')
    expect(refs).toContain('ctrader_pos_33333333')
  })

  it('sets brokerSource = "ctrader" on all imported trades', () => {
    const { db } = makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitCtrader', {
        html: SIMPLE_HTML,
        accountId: ACCOUNT_ID,
        symbolMap: { XYZABC: EURUSD_PAIR_ID },
        defaultSetupId: SETUP_ID,
      }),
    )
    const rows = db.select({ brokerSource: schema.trades.brokerSource }).from(schema.trades).all()
    for (const row of rows) expect(row.brokerSource).toBe('ctrader')
  })

  it('imports 3 candidates + 1 partial from the partials fixture', () => {
    makeDb()
    // GBPUSD pos 55555555 has 2 rows → 1 trade + 1 partial
    const result = unwrap(
      call<ImportCommitResult>('import:commitCtrader', {
        html: PARTIALS_HTML,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    expect(result.imported).toBe(3) // GBPUSD + AUDUSD + USDJPY
    expect(result.partials).toBe(1) // GBPUSD partial close
    expect(result.skipped).toBe(0)
  })

  it('stores the partial externalRef ctrader_pos_55555555_p0 in trade_partials', () => {
    const { db } = makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitCtrader', {
        html: PARTIALS_HTML,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    const partials = db
      .select({ externalRef: schema.tradePartials.externalRef })
      .from(schema.tradePartials)
      .all()
      .map((r) => r.externalRef)
      .filter(Boolean)
    expect(partials).toContain('ctrader_pos_55555555_p0')
  })
})

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe('import:commitCtrader — idempotency', () => {
  it('second import of the same file returns imported=0 and correct skipped count', () => {
    makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitCtrader', {
        html: SIMPLE_HTML,
        accountId: ACCOUNT_ID,
        symbolMap: { XYZABC: EURUSD_PAIR_ID },
        defaultSetupId: SETUP_ID,
      }),
    )
    const second = unwrap(
      call<ImportCommitResult>('import:commitCtrader', {
        html: SIMPLE_HTML,
        accountId: ACCOUNT_ID,
        symbolMap: { XYZABC: EURUSD_PAIR_ID },
        defaultSetupId: SETUP_ID,
      }),
    )
    expect(second.imported).toBe(0)
    expect(second.partials).toBe(0)
    expect(second.skipped).toBe(4)
  })

  it('preview after full import shows skippedCount = 3 for auto-resolved symbols', () => {
    makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitCtrader', {
        html: SIMPLE_HTML,
        accountId: ACCOUNT_ID,
        symbolMap: { XYZABC: EURUSD_PAIR_ID },
        defaultSetupId: SETUP_ID,
      }),
    )
    const preview = unwrap(
      call<ImportPreview>('import:previewCtrader', {
        html: SIMPLE_HTML,
        accountId: ACCOUNT_ID,
      }),
    )
    expect(preview.candidates).toHaveLength(0)
    expect(preview.skippedCount).toBe(3)
    expect(preview.unresolvedSymbols).toContain('XYZABC')
  })

  it('cross-adapter: USDJPY imported via cTrader blocks a cTrader re-import of the same pos', () => {
    // Both fixtures use positionId 33333333 for USDJPY.
    // After simple commit, importing partials should skip USDJPY (already in DB).
    makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitCtrader', {
        html: SIMPLE_HTML,
        accountId: ACCOUNT_ID,
        symbolMap: { XYZABC: EURUSD_PAIR_ID },
        defaultSetupId: SETUP_ID,
      }),
    )
    const result = unwrap(
      call<ImportCommitResult>('import:commitCtrader', {
        html: PARTIALS_HTML,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    // USDJPY is already imported → skipped; GBPUSD + AUDUSD are new
    expect(result.imported).toBe(2)
    expect(result.skipped).toBe(1)
  })
})

// ─── Validation errors ────────────────────────────────────────────────────────

describe('import:commitCtrader — validation errors', () => {
  it('rejects commit when a symbol is unresolved', () => {
    makeDb()
    const res = call<ImportCommitResult>('import:commitCtrader', {
      html: SIMPLE_HTML,
      accountId: ACCOUNT_ID,
      symbolMap: {}, // XYZABC not mapped
      defaultSetupId: SETUP_ID,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('UNRESOLVED_SYMBOLS')
      expect((res.error.details as { unresolvedSymbols: string[] }).unresolvedSymbols).toContain(
        'XYZABC',
      )
    }
  })

  it('rejects commit with an unknown defaultSetupId', () => {
    makeDb()
    const res = call<ImportCommitResult>('import:commitCtrader', {
      html: SIMPLE_HTML,
      accountId: ACCOUNT_ID,
      symbolMap: { XYZABC: EURUSD_PAIR_ID },
      defaultSetupId: '00000000-0000-0000-0000-999999999999',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND')
  })
})
