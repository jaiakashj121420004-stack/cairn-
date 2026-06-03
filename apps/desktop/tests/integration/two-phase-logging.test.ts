// @vitest-environment node
//
// Integration test for two-phase logging (v1.2 Wave 3).
// Exercises the registered trade IPC handlers against a real sql.js DB, the same
// way mt5-import / event-bus tests do. Covers the three required scenarios:
//   1. Phase-1 flow → trade enters the DB with phase_2_complete = false.
//   2. Minimal close → the reflection-queue count (badge) increments.
//   3. Phase-2 completion → the count decrements and honesty persists.

import { vi, describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import type { IpcResponse, Trade, TradeListItem } from '../../shared/types/index'

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
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../electron/db/schema'
import { runSeed } from '../../electron/db/seed'

let injectedDb: unknown
vi.mock('../../electron/db/index', () => ({ getDb: () => injectedDb }))

import { registerTradeHandlers } from '../../electron/ipc/trades'

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
].map((t) => readFileSync(join(__dirname, `../../electron/db/migrations/${t}.sql`), 'utf-8'))

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs()
  registerTradeHandlers()
})

function makeDb() {
  const sqlite = new SQL.Database()
  for (const sql of MIGRATIONS) {
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const t = stmt.trim()
      if (t) sqlite.run(t)
    }
  }
  const db = drizzle(sqlite, { schema })
  ;(runSeed as (db: unknown) => void)(db as unknown as BetterSQLite3Database<typeof schema>)
  injectedDb = db
  return db
}

function makeSender() {
  return { send: vi.fn(), isDestroyed: () => false }
}

function call<T>(name: string, raw: unknown): IpcResponse<T> {
  const fn = handlers.get(name)
  if (!fn) throw new Error(`handler not registered: ${name}`)
  return fn({ sender: makeSender() }, raw) as IpcResponse<T>
}

function unwrap<T>(res: IpcResponse<T>): T {
  if (!res.ok) throw new Error(`expected ok, got ${res.error.code}: ${res.error.message}`)
  return res.data
}

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000201'

function seed(db: ReturnType<typeof makeDb>) {
  const pair = db.select().from(schema.pairs).where(eq(schema.pairs.symbol, 'EURUSD')).get()
  const setup = db.select().from(schema.setups).limit(1).all()[0]
  if (!pair || !setup) throw new Error('seed data missing')
  const firm = db.select().from(schema.propFirms).limit(1).all()[0]
  if (!firm) throw new Error('seed missing propFirm')
  const now = Date.now()
  db.insert(schema.accounts)
    .values({
      id: ACCOUNT_ID,
      displayName: 'TestAccount',
      propFirmId: firm.id,
      stepCount: 1,
      currentPhase: 1,
      accountSizeCents: 10_000_00,
      leverage: 100,
      dailyDrawdownType: 'percent_of_balance',
      dailyDrawdownValue: 500,
      totalDrawdownType: 'percent_of_balance',
      totalDrawdownValue: 1000,
      drawdownBasis: 'initial_balance',
      profitTargetPct: 1000,
      weekendHoldingAllowed: 0,
      newsTradingAllowed: 0,
      challengeCostCents: 0,
      startDate: now,
      status: 'active',
      peakEquityCents: 10_000_00,
      currentEquityCents: 10_000_00,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  return { pairId: pair.id, setupId: setup.id }
}

/** Create an open trade the way the fast-path gate does (a normal trades:create). */
function createFastPathTrade(pairId: string, setupId: string): Trade {
  return unwrap<Trade>(
    call('trades:create', {
      accountId: ACCOUNT_ID,
      pairId,
      setupId,
      mode: 'sim',
      direction: 'long',
      status: 'open',
      entryPrice: 109_000_0,
      stopLossPrice: 108_900_0,
      takeProfitPrice: 109_200_0,
      slPips: 100,
      rrRatio: 200,
      lotSize: 10,
      riskAmountCents: 100_00,
      riskPctBps: 100,
      plannedInvalidation: 'below the OB — liquidity sweep fails',
      mssConfirmed: 1,
      htfBiasAligned: 1,
      preCalmScore: 7,
      preUrgencyScore: 3,
      preNeedScore: 2,
    }),
  )
}

function pendingCount(): number {
  return unwrap<number>(call('trades:countAwaitingReflection', { accountId: null }))
}

function readRow(db: ReturnType<typeof makeDb>, id: string) {
  return db.select().from(schema.trades).where(eq(schema.trades.id, id)).get()
}

// ─── Scenario 1 ────────────────────────────────────────────────────────────────

describe('Phase 1 — the Gate', () => {
  it('a fast-path trade enters the DB with phase_2_complete = false', () => {
    const db = makeDb()
    const { pairId, setupId } = seed(db)

    const trade = createFastPathTrade(pairId, setupId)

    expect(trade.phase2Complete).toBe(0)
    const row = readRow(db, trade.id)
    expect(row?.phase2Complete).toBe(0)
    // An open trade is not yet owed reflection, so it must not be in the queue.
    expect(pendingCount()).toBe(0)
  })
})

// ─── Scenario 2 ────────────────────────────────────────────────────────────────

describe('Phase 1 → minimal close', () => {
  it('closing a trade minimally adds it to the reflection queue (badge 0 → 1)', () => {
    const db = makeDb()
    const { pairId, setupId } = seed(db)
    const trade = createFastPathTrade(pairId, setupId)

    expect(pendingCount()).toBe(0)

    const closed = unwrap<Trade>(
      call('trades:closeMinimal', {
        tradeId: trade.id,
        exitPrice: 109_200_0,
        exitTime: Date.now() + 60_000,
        exitReason: 'tp',
      }),
    )

    // Exit facts recorded; reflection still owed.
    expect(closed.status).toBe('closed')
    expect(closed.pnlCents).not.toBeNull()
    expect(closed.phase2Complete).toBe(0)

    // Badge increments.
    expect(pendingCount()).toBe(1)

    const queue = unwrap<TradeListItem[]>(
      call('trades:listAwaitingReflection', { accountId: null }),
    )
    expect(queue.map((t) => t.id)).toContain(trade.id)
  })
})

// ─── Scenario 3 ────────────────────────────────────────────────────────────────

describe('Phase 2 — completing the deferred reflection', () => {
  it('completing Phase 2 clears the trade from the queue (badge 1 → 0) and persists honesty', () => {
    const db = makeDb()
    const { pairId, setupId } = seed(db)
    const trade = createFastPathTrade(pairId, setupId)
    unwrap<Trade>(
      call('trades:closeMinimal', {
        tradeId: trade.id,
        exitPrice: 109_200_0,
        exitTime: Date.now() + 60_000,
        exitReason: 'tp',
      }),
    )
    expect(pendingCount()).toBe(1)

    const reflected = unwrap<Trade>(
      call('trades:completePhase2', {
        tradeId: trade.id,
        followedPlanExactly: true,
        slMoved: false,
        enteredBeforeMss: false,
        rulesBroken: [],
        postCalmScore: 8,
        whatIDidRight: 'Waited for the sweep.',
        maePips: 35,
        mfePips: 210,
      }),
    )

    // Badge decrements; reflection captured.
    expect(pendingCount()).toBe(0)
    expect(reflected.phase2Complete).toBe(1)
    expect(reflected.followedPlanExactly).toBe(1)
    expect(reflected.postCalmScore).toBe(8)
    expect(reflected.isClean).toBe(1) // clean: no rules broken, plan followed, MSS ok
    expect(reflected.maePips).toBe(35)

    const queue = unwrap<TradeListItem[]>(
      call('trades:listAwaitingReflection', { accountId: null }),
    )
    expect(queue.map((t) => t.id)).not.toContain(trade.id)
  })

  it('rejects a second Phase-2 completion (idempotency guard)', () => {
    const db = makeDb()
    const { pairId, setupId } = seed(db)
    const trade = createFastPathTrade(pairId, setupId)
    unwrap<Trade>(
      call('trades:closeMinimal', {
        tradeId: trade.id,
        exitPrice: 109_200_0,
        exitTime: Date.now() + 60_000,
        exitReason: 'tp',
      }),
    )
    unwrap<Trade>(
      call('trades:completePhase2', {
        tradeId: trade.id,
        followedPlanExactly: true,
        slMoved: false,
        enteredBeforeMss: false,
        rulesBroken: [],
        postCalmScore: 7,
      }),
    )

    const second = call<Trade>('trades:completePhase2', {
      tradeId: trade.id,
      followedPlanExactly: true,
      slMoved: false,
      enteredBeforeMss: false,
      rulesBroken: [],
      postCalmScore: 7,
    })
    expect(second.ok).toBe(false)
  })

  it('a rule-breaking reflection marks the trade not-clean and records a violation', () => {
    const db = makeDb()
    const { pairId, setupId } = seed(db)
    const trade = createFastPathTrade(pairId, setupId)
    unwrap<Trade>(
      call('trades:closeMinimal', {
        tradeId: trade.id,
        exitPrice: 108_900_0,
        exitTime: Date.now() + 60_000,
        exitReason: 'sl',
      }),
    )

    const reflected = unwrap<Trade>(
      call('trades:completePhase2', {
        tradeId: trade.id,
        followedPlanExactly: false,
        planChangesDescription: 'Widened the stop.',
        slMoved: true,
        slMovedReason: 'Hoped it would come back.',
        enteredBeforeMss: false,
        rulesBroken: ['no_sl_widening'],
        postCalmScore: 4,
      }),
    )

    expect(reflected.isClean).toBe(0)
    const violations = db
      .select()
      .from(schema.ruleViolations)
      .where(eq(schema.ruleViolations.tradeId, trade.id))
      .all()
    expect(violations.map((v) => v.ruleKey)).toContain('no_sl_widening')
  })
})
