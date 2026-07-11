// @vitest-environment node
//
// Integration tests for the TradingView import IPC handlers.
// Same sql.js + drizzle-orm/sql-js harness as mt5-import.test.ts and ctrader-import.test.ts.
// Covers: preview resolves + dedupes; commit writes trades (and partials) with full integer/
// decimal encoding; re-committing the same file is deduped via external_ref; unresolved
// symbols block the commit.
//
// MAE/MFE (item 21): TradingView CSV exports Run-up/Drawdown as dollar P&L values, not as
// an OHLC price series, and provides no stop-loss. The shared committer requires both
// priceSeries AND stopLoss to populate mae_pips/mfe_pips. Both columns stay null for
// TradingView imports until a TV-specific price-series adapter is added.

import { vi, describe, it, expect, beforeAll } from 'vitest'
import type { IpcResponse, ImportPreview, ImportCommitResult } from '../../shared/types/index'
import { readFileSync } from 'fs'
import { join } from 'path'
import { eq } from 'drizzle-orm'

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

const FIXTURE_DIR = join(__dirname, '../fixtures/import/tradingview')
const SIMPLE_CSV = readFileSync(join(FIXTURE_DIR, 'tv-simple.csv'), 'utf-8')
const PARTIALS_CSV = readFileSync(join(FIXTURE_DIR, 'tv-partials.csv'), 'utf-8')

// Minimal CSV containing XYZABC — a symbol guaranteed not to be in the migration seeds.
// Used to test that unresolved symbols block the commit.
const XYZABC_CSV = [
  '"Trade #","Date/Time","Symbol","Type","Price","Contracts","Profit","Profit %","Cum. Profit","Run-up","Run-up %","Drawdown","Drawdown %"',
  '"1","2024-01-15 09:35","XYZABC","Entry Long","1.00000","0.10","","","","","","",""',
  '"1","2024-01-15 12:00","XYZABC","Exit Long","1.00100","0.10","10.00","1.00%","10.00","15.00","1.50%","3.00","0.30%"',
].join('\n')

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

describe('import:previewTradingView', () => {
  it('returns 3 auto-resolved candidates for the simple fixture (EURUSD, GBPUSD, USDJPY)', () => {
    makeDb()
    const preview = unwrap(
      call<ImportPreview>('import:previewTradingView', {
        csv: SIMPLE_CSV,
        accountId: ACCOUNT_ID,
      }),
    )
    expect(preview.candidates).toHaveLength(3)
    expect(preview.unresolvedSymbols).toHaveLength(0)
    expect(preview.parseErrors).toHaveLength(0)
    expect(preview.skippedCount).toBe(0)
  })

  it('all 3 simple candidates are closed trades', () => {
    makeDb()
    const preview = unwrap(
      call<ImportPreview>('import:previewTradingView', {
        csv: SIMPLE_CSV,
        accountId: ACCOUNT_ID,
      }),
    )
    for (const c of preview.candidates) expect(c.status).toBe('closed')
  })

  it('partials fixture: both EURUSD and GBPJPY auto-resolve (GBPJPY is a migration-seeded pair)', () => {
    // GBPJPY is seeded by migration 0002_v11, so it resolves automatically.
    makeDb()
    const preview = unwrap(
      call<ImportPreview>('import:previewTradingView', {
        csv: PARTIALS_CSV,
        accountId: ACCOUNT_ID,
      }),
    )
    expect(preview.candidates).toHaveLength(2)
    expect(preview.candidates.map((c) => c.symbol)).toContain('EURUSD')
    expect(preview.candidates.map((c) => c.symbol)).toContain('GBPJPY')
    expect(preview.unresolvedSymbols).toHaveLength(0)
    expect(preview.skippedCount).toBe(0)
  })

  it('XYZABC (not a migration-seeded pair) appears in unresolvedSymbols', () => {
    makeDb()
    const preview = unwrap(
      call<ImportPreview>('import:previewTradingView', {
        csv: XYZABC_CSV,
        accountId: ACCOUNT_ID,
      }),
    )
    expect(preview.candidates).toHaveLength(0)
    expect(preview.unresolvedSymbols).toContain('XYZABC')
  })

  it('rejects an invalid accountId', () => {
    makeDb()
    const res = call<ImportPreview>('import:previewTradingView', {
      csv: SIMPLE_CSV,
      accountId: 'not-a-uuid',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_ERROR')
  })
})

// ─── Commit happy path ────────────────────────────────────────────────────────

describe('import:commitTradingView — happy path', () => {
  it('imports 3 trades from the simple fixture, 0 partials, 0 skipped', () => {
    makeDb()
    const result = unwrap(
      call<ImportCommitResult>('import:commitTradingView', {
        csv: SIMPLE_CSV,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    expect(result.imported).toBe(3)
    expect(result.partials).toBe(0)
    expect(result.skipped).toBe(0)
  })

  it('stores tv_trade_N externalRefs on committed trades', () => {
    const { db } = makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitTradingView', {
        csv: SIMPLE_CSV,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    const refs = db
      .select({ externalRef: schema.trades.externalRef })
      .from(schema.trades)
      .all()
      .map((r) => r.externalRef)
      .filter(Boolean)
    expect(refs).toContain('tv_trade_1')
    expect(refs).toContain('tv_trade_2')
    expect(refs).toContain('tv_trade_3')
  })

  it('sets brokerSource = "tradingview" on all imported trades', () => {
    const { db } = makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitTradingView', {
        csv: SIMPLE_CSV,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    const rows = db.select({ brokerSource: schema.trades.brokerSource }).from(schema.trades).all()
    for (const row of rows) expect(row.brokerSource).toBe('tradingview')
  })

  it('stores EURUSD entry/exit price and P&L with full integer encoding', () => {
    // encodePrice(price, pipDecimal) = Math.round(price × 10^(pipDecimal+1))
    // EURUSD pipDecimal=4 → ×10^5
    //   entryPrice 1.08523 → 108523
    //   exitPrice  1.08700 → 108700
    // encodeCents(17.70)  → 1770
    const { db } = makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitTradingView', {
        csv: SIMPLE_CSV,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    const trade = db
      .select({
        entryPrice: schema.trades.entryPrice,
        exitPrice: schema.trades.exitPrice,
        pnlCents: schema.trades.pnlCents,
        lotSize: schema.trades.lotSize,
      })
      .from(schema.trades)
      .where(eq(schema.trades.externalRef, 'tv_trade_1'))
      .get()
    expect(trade?.entryPrice).toBe(108523)
    expect(trade?.exitPrice).toBe(108700)
    expect(trade?.pnlCents).toBe(1770)
    expect(trade?.lotSize).toBe(10) // encodeLots(0.10) = 10
  })

  it('stores USDJPY entry price with correct pipDecimal=2 encoding', () => {
    // USDJPY pipDecimal=2 → encodePrice(147.250, 2) = Math.round(147.250 × 10^3) = 147250
    const { db } = makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitTradingView', {
        csv: SIMPLE_CSV,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    const trade = db
      .select({ entryPrice: schema.trades.entryPrice })
      .from(schema.trades)
      .where(eq(schema.trades.externalRef, 'tv_trade_3'))
      .get()
    expect(trade?.entryPrice).toBe(147250)
  })

  it('imports 2 trades + 1 partial from the partials fixture (GBPJPY auto-resolves)', () => {
    // GBPJPY is seeded by migration 0002_v11 — no symbolMap needed.
    makeDb()
    const result = unwrap(
      call<ImportCommitResult>('import:commitTradingView', {
        csv: PARTIALS_CSV,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    expect(result.imported).toBe(2)
    expect(result.partials).toBe(1)
    expect(result.skipped).toBe(0)
  })

  it('stores the partial externalRef tv_trade_1_exit_0 in trade_partials', () => {
    const { db } = makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitTradingView', {
        csv: PARTIALS_CSV,
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
    expect(partials).toContain('tv_trade_1_exit_0')
  })

  it('mae_pips and mfe_pips are null — TV CSV carries no OHLC series or stop-loss (item 21)', () => {
    // TradingView's Run-up / Drawdown columns are dollar P&L values, not price distances.
    // The committer requires priceSeries + stopLoss to compute MAE/MFE; neither is
    // provided by the TV reconciler. Both columns must stay null (no interpolation, no
    // guessing — §2.5 data integrity). This test will need updating when item 21 adds
    // a TV-specific price-series extraction path.
    const { db } = makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitTradingView', {
        csv: SIMPLE_CSV,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    const rows = db
      .select({
        maePips: schema.trades.maePips,
        mfePips: schema.trades.mfePips,
      })
      .from(schema.trades)
      .all()
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.maePips).toBeNull()
      expect(row.mfePips).toBeNull()
    }
  })
})

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe('import:commitTradingView — idempotency', () => {
  it('second import of the same file returns imported=0 and skipped=3', () => {
    makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitTradingView', {
        csv: SIMPLE_CSV,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    const second = unwrap(
      call<ImportCommitResult>('import:commitTradingView', {
        csv: SIMPLE_CSV,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    expect(second.imported).toBe(0)
    expect(second.partials).toBe(0)
    expect(second.skipped).toBe(3)
  })

  it('preview after full import shows 0 candidates and skippedCount = 3', () => {
    makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitTradingView', {
        csv: SIMPLE_CSV,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    const preview = unwrap(
      call<ImportPreview>('import:previewTradingView', {
        csv: SIMPLE_CSV,
        accountId: ACCOUNT_ID,
      }),
    )
    expect(preview.candidates).toHaveLength(0)
    expect(preview.skippedCount).toBe(3)
  })

  it('re-importing partials fixture after simple commit dedupes both trades by externalRef', () => {
    // Simple produces tv_trade_1 (EURUSD), tv_trade_2 (GBPUSD), tv_trade_3 (USDJPY).
    // Partials has tv_trade_1 (EURUSD) and tv_trade_2 (GBPJPY).
    // Both externalRefs already exist from the simple import → both skipped, imported=0.
    makeDb()
    unwrap(
      call<ImportCommitResult>('import:commitTradingView', {
        csv: SIMPLE_CSV,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    const result = unwrap(
      call<ImportCommitResult>('import:commitTradingView', {
        csv: PARTIALS_CSV,
        accountId: ACCOUNT_ID,
        symbolMap: {},
        defaultSetupId: SETUP_ID,
      }),
    )
    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(2)
  })
})

// ─── Validation errors ────────────────────────────────────────────────────────

describe('import:commitTradingView — validation errors', () => {
  it('rejects commit when a symbol is unresolved (XYZABC not in migration seeds)', () => {
    makeDb()
    const res = call<ImportCommitResult>('import:commitTradingView', {
      csv: XYZABC_CSV,
      accountId: ACCOUNT_ID,
      symbolMap: {},
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
    const res = call<ImportCommitResult>('import:commitTradingView', {
      csv: SIMPLE_CSV,
      accountId: ACCOUNT_ID,
      symbolMap: {},
      defaultSetupId: '00000000-0000-0000-0000-999999999999',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND')
  })

  it('rejects commit with an invalid accountId', () => {
    makeDb()
    const res = call<ImportCommitResult>('import:commitTradingView', {
      csv: SIMPLE_CSV,
      accountId: 'not-a-uuid',
      symbolMap: {},
      defaultSetupId: SETUP_ID,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_ERROR')
  })
})
