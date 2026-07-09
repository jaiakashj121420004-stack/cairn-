// @vitest-environment node
//
// Integration tests for the draft-trade lifecycle fixes.
// Exercises the registered trade + dashboard IPC handlers against a real sql.js
// DB, the same way two-phase-logging / mt5-import tests do. Covers:
//   1. trades:setOpen re-runs the full pre-trade rule evaluation and refuses
//      activation when a blocking rule fails (the gate moved to activation).
//   2. trades:setOpen succeeds when rules pass and stamps openedAt.
//   3. Activating a stale draft re-links it to TODAY's session and locks
//      today's session — never the session of the day the draft was written.
//   4. The duplicate-trade guard ignores planned drafts (a draft is a plan,
//      not an order) but still refuses a second placed duplicate.
//   5. dashboard:getStats todayTradeCount excludes planned drafts.

import { vi, describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import type { DashboardStats, IpcResponse, Trade } from '../../shared/types/index'

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
import { v7 as uuidv7 } from 'uuid'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../electron/db/schema'
import { runSeed } from '../../electron/db/seed'
import { getConfiguredTimeZone, tradingDayKey } from '../../electron/services/time/trading-day'
import type { CairnDb } from '../../electron/db/index'

let injectedDb: unknown
vi.mock('../../electron/db/index', () => ({ getDb: () => injectedDb }))

import { registerDashboardHandlers } from '../../electron/ipc/dashboard'
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
  '0011_sync',
  '0012_sync_merge',
  '0013_sync_clocks',
  '0014_live_detection_outcome',
  '0015_broker_account_map',
  '0016_account_phases',
  '0017_daily_locks',
].map((t) => readFileSync(join(__dirname, `../../electron/db/migrations/${t}.sql`), 'utf-8'))

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs()
  registerTradeHandlers()
  registerDashboardHandlers()
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

async function callAsync<T>(name: string, raw: unknown): Promise<IpcResponse<T>> {
  const fn = handlers.get(name)
  if (!fn) throw new Error(`handler not registered: ${name}`)
  return (await fn({ sender: makeSender() }, raw)) as IpcResponse<T>
}

function unwrap<T>(res: IpcResponse<T>): T {
  if (!res.ok) throw new Error(`expected ok, got ${res.error.code}: ${res.error.message}`)
  return res.data
}

function fail<T>(res: IpcResponse<T>): { code: string; message: string; details?: unknown } {
  if (res.ok) throw new Error('expected failure, got ok')
  return res.error
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

function insertRule(
  db: ReturnType<typeof makeDb>,
  ruleKey: string,
  value: Record<string, unknown>,
): void {
  const now = Date.now()
  db.insert(schema.accountRules)
    .values({
      id: uuidv7(),
      accountId: ACCOUNT_ID,
      ruleKey,
      enabled: 1,
      value: JSON.stringify(value),
      priority: 10,
      createdAt: now,
      updatedAt: now,
    })
    .run()
}

function insertSession(db: ReturnType<typeof makeDb>, sessionDate: string): string {
  const id = uuidv7()
  const now = Date.now()
  db.insert(schema.sessions)
    .values({
      id,
      accountId: ACCOUNT_ID,
      sessionDate,
      dailyBias: 'bullish',
      dailyBiasReason: 'r',
      h4Bias: 'bullish',
      h4BiasReason: 'r',
      h1Bias: 'bullish',
      h1BiasReason: 'r',
      htfLiquidityTarget: null,
      dxyBias: 'bearish',
      smtNotes: null,
      sessionPlan: null,
      keyLevels: null,
      lockedAt: null,
      createdAt: now,
      updatedAt: now,
    } as typeof schema.sessions.$inferInsert)
    .run()
  return id
}

interface CreateOverrides {
  status?: 'planned' | 'open'
  direction?: 'long' | 'short'
  sessionId?: string | null
}

function createTradeRes(
  pairId: string,
  setupId: string,
  overrides: CreateOverrides = {},
): IpcResponse<Trade> {
  return call<Trade>('trades:create', {
    accountId: ACCOUNT_ID,
    sessionId: overrides.sessionId ?? null,
    pairId,
    setupId,
    mode: 'sim',
    direction: overrides.direction ?? 'long',
    status: overrides.status ?? 'planned',
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
  })
}

function readRow(db: ReturnType<typeof makeDb>, id: string) {
  return db.select().from(schema.trades).where(eq(schema.trades.id, id)).get()
}

// ─── Rules gate at activation ─────────────────────────────────────────────────

describe('trades:setOpen — rules gate', () => {
  it('refuses activation when a blocking rule fails, leaving the trade planned', () => {
    const db = makeDb()
    const { pairId, setupId } = seed(db)
    insertRule(db, 'max_trades_per_day', { maxTrades: 1 })

    // One placed trade consumes the cap; the draft itself must not.
    unwrap(createTradeRes(pairId, setupId, { status: 'open', direction: 'short' }))
    const draft = unwrap(createTradeRes(pairId, setupId, { status: 'planned', direction: 'long' }))

    const res = call<Trade>('trades:setOpen', { tradeId: draft.id, accountId: ACCOUNT_ID })
    const err = fail(res)
    expect(err.code).toBe('RULES_BLOCKED')
    expect(err.message).toContain('Max Trades per Day')
    expect(Array.isArray(err.details)).toBe(true)

    // The trade is untouched: still a plan, never opened, no session locked.
    const row = readRow(db, draft.id)
    expect(row?.status).toBe('planned')
    expect(row?.openedAt ?? null).toBeNull()

    // The blocked attempt is recorded against the draft.
    const violations = db
      .select()
      .from(schema.ruleViolations)
      .where(eq(schema.ruleViolations.tradeId, draft.id))
      .all()
    expect(violations.map((v) => v.ruleKey)).toContain('max_trades_per_day')
  })

  it('activates the draft when all rules pass and stamps openedAt', () => {
    const db = makeDb()
    const { pairId, setupId } = seed(db)
    insertRule(db, 'max_trades_per_day', { maxTrades: 5 })

    const draft = unwrap(createTradeRes(pairId, setupId, { status: 'planned' }))
    expect(draft.openedAt).toBeNull()

    const activated = unwrap(
      call<Trade>('trades:setOpen', { tradeId: draft.id, accountId: ACCOUNT_ID }),
    )
    expect(activated.status).toBe('open')
    expect(typeof activated.openedAt).toBe('number')

    const row = readRow(db, draft.id)
    expect(row?.status).toBe('open')
    expect(row?.openedAt).toBe(activated.openedAt)
  })

  it('refuses to activate a trade that is not planned', () => {
    const db = makeDb()
    const { pairId, setupId } = seed(db)
    const open = unwrap(createTradeRes(pairId, setupId, { status: 'open' }))

    const res = call<Trade>('trades:setOpen', { tradeId: open.id, accountId: ACCOUNT_ID })
    expect(fail(res).code).toBe('CONFLICT')
  })
})

// ─── Session re-link on activation ────────────────────────────────────────────

describe('trades:setOpen — session re-link', () => {
  it("re-links a stale draft to today's session and locks today's session, not the old one", () => {
    const db = makeDb()
    const { pairId, setupId } = seed(db)

    const oldSessionId = insertSession(db, '2026-01-02')
    const todayKey = tradingDayKey(Date.now(), getConfiguredTimeZone(db as unknown as CairnDb))
    const todaySessionId = insertSession(db, todayKey)

    const draft = unwrap(
      createTradeRes(pairId, setupId, { status: 'planned', sessionId: oldSessionId }),
    )
    expect(draft.sessionId).toBe(oldSessionId)

    const activated = unwrap(
      call<Trade>('trades:setOpen', { tradeId: draft.id, accountId: ACCOUNT_ID }),
    )
    expect(activated.sessionId).toBe(todaySessionId)

    const oldSession = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, oldSessionId))
      .get()
    const todaySession = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, todaySessionId))
      .get()
    expect(oldSession?.lockedAt).toBeNull()
    expect(todaySession?.lockedAt).not.toBeNull()
  })

  it('keeps the original sessionId when no session exists today (none is created)', () => {
    const db = makeDb()
    const { pairId, setupId } = seed(db)
    const oldSessionId = insertSession(db, '2026-01-02')

    const draft = unwrap(
      createTradeRes(pairId, setupId, { status: 'planned', sessionId: oldSessionId }),
    )
    const activated = unwrap(
      call<Trade>('trades:setOpen', { tradeId: draft.id, accountId: ACCOUNT_ID }),
    )
    expect(activated.sessionId).toBe(oldSessionId)

    // The stale session must NOT be locked by today's activation.
    const oldSession = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, oldSessionId))
      .get()
    expect(oldSession?.lockedAt).toBeNull()

    const sessions = db.select().from(schema.sessions).all()
    expect(sessions.length).toBe(1)
  })
})

// ─── Duplicate guard ──────────────────────────────────────────────────────────

describe('trades:create — duplicate guard ignores planned drafts', () => {
  it('allows placing the real trade while a matching draft exists', () => {
    const db = makeDb()
    const { pairId, setupId } = seed(db)

    unwrap(createTradeRes(pairId, setupId, { status: 'planned', direction: 'long' }))
    // Same account + pair + direction seconds later — the draft is a plan,
    // not an order, so this must succeed.
    const placed = createTradeRes(pairId, setupId, { status: 'open', direction: 'long' })
    expect(placed.ok).toBe(true)

    // A second identical PLACED trade within 5 minutes is still refused.
    const dup = createTradeRes(pairId, setupId, { status: 'open', direction: 'long' })
    expect(fail(dup).code).toBe('DUPLICATE_TRADE')
  })
})

// ─── Dashboard today count ────────────────────────────────────────────────────

describe('dashboard:getStats — todayTradeCount', () => {
  it('excludes planned drafts from the daily trade count', async () => {
    const db = makeDb()
    const { pairId, setupId } = seed(db)

    unwrap(createTradeRes(pairId, setupId, { status: 'planned', direction: 'long' }))
    unwrap(createTradeRes(pairId, setupId, { status: 'open', direction: 'short' }))

    const stats = unwrap(
      await callAsync<DashboardStats>('dashboard:getStats', { accountId: ACCOUNT_ID }),
    )
    expect(stats.todayTradeCount).toBe(1)

    // 6. advancedMetrics is always present on the DTO (never optional — see
    // advanced-metrics.ts) and correctly reports "not enough data" rather
    // than throwing or fabricating a number when the account has zero
    // closed trades (this fixture only creates a planned + an open trade).
    expect(stats.advancedMetrics.sharpeRatioX100).toEqual({ value: null, sufficient: false })
    expect(stats.advancedMetrics.maxDrawdown).toEqual({ value: null, sufficient: false })
    expect(stats.advancedMetrics.kellyPctBps).toEqual({ value: null, sufficient: false })
  })
})
