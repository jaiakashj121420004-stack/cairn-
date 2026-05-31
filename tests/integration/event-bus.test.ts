// @vitest-environment node
//
// Verifies that the mutating trade IPC handlers emit a cairn:event on
// e.sender after each DB write commits.
//
// Electron is mocked; the DB is a sql.js in-memory instance with all
// migrations + seed applied — the same fidelity used in migrations.test.ts
// and db.test.ts, without the better-sqlite3 native module.

import { vi, describe, it, expect, beforeAll } from 'vitest'
import type { IpcResponse, Trade } from '../../shared/types/index'

// ── Capture ipcMain.handle registrations ─────────────────────────────────────
// Vitest hoists vi.mock() above all imports, so this map is populated before
// any handler module code runs.
type IpcHandler = (e: MockEvent, raw: unknown) => unknown
const handlers = new Map<string, IpcHandler>()

interface MockEvent {
  sender: { send: ReturnType<typeof vi.fn>; isDestroyed: () => boolean }
}

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn((ch: string, fn: IpcHandler) => { handlers.set(ch, fn) }) },
  app: { getPath: () => '/tmp' },
  dialog: { showOpenDialog: vi.fn() },
}))

// ── sql.js DB backing ─────────────────────────────────────────────────────────
import initSqlJs from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import { eq } from 'drizzle-orm'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../electron/db/schema'
import { runSeed } from '../../electron/db/seed'

// Lazily resolved by the mock — set before each handler call
let injectedDb: unknown

vi.mock('../../electron/db/index', () => ({ getDb: () => injectedDb }))

// Must be imported after the vi.mock() declarations (Vitest hoisting ensures
// the mocks are active by the time this module is first required).
import { registerTradeHandlers } from '../../electron/ipc/trades'

const MIGRATIONS = [
  readFileSync(join(__dirname, '../../electron/db/migrations/0001_initial.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../electron/db/migrations/0002_v11.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../electron/db/migrations/0003_opened_at.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../electron/db/migrations/0004_consolidate_partials.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../electron/db/migrations/0005_dismissed_insights.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../electron/db/migrations/0006_notebook.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../electron/db/migrations/0007_notebook_account.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../electron/db/migrations/0008_external_ref.sql'), 'utf-8'),
]

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs()
  registerTradeHandlers()
})

// ── helpers ───────────────────────────────────────────────────────────────────

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

function makeSender(): MockEvent['sender'] {
  return { send: vi.fn(), isDestroyed: () => false }
}

function callHandler(name: string, sender: MockEvent['sender'], raw: unknown): unknown {
  const fn = handlers.get(name)
  if (!fn) throw new Error(`Handler not registered: ${name}`)
  return fn({ sender }, raw)
}

function findEvent(
  sender: MockEvent['sender'],
  eventName: string,
): { name: string; payload: Record<string, unknown> } | undefined {
  const call = sender.send.mock.calls.find(
    ([ch, ev]: [string, { name: string }]) => ch === 'cairn:event' && ev.name === eventName,
  )
  return call ? (call[1] as { name: string; payload: Record<string, unknown> }) : undefined
}

// Minimal account row — enough for all three handler tests
function insertAccount(db: ReturnType<typeof makeDb>, id: string) {
  const firm = db.select().from(schema.propFirms).limit(1).all()[0]
  if (!firm) throw new Error('seed missing propFirm')
  const now = Date.now()
  db.insert(schema.accounts).values({
    id, displayName: 'TestAccount', propFirmId: firm.id, stepCount: 1,
    currentPhase: 1, accountSizeCents: 10_000_00, leverage: 100,
    dailyDrawdownType: 'percent_of_balance', dailyDrawdownValue: 500,
    totalDrawdownType: 'percent_of_balance', totalDrawdownValue: 1000,
    drawdownBasis: 'initial_balance', profitTargetPct: 1000,
    weekendHoldingAllowed: 0, newsTradingAllowed: 0, challengeCostCents: 0,
    startDate: now, status: 'active',
    peakEquityCents: 10_000_00, currentEquityCents: 10_000_00,
    createdAt: now, updatedAt: now,
  }).run()
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('cairn:event — trade.placed (trades:create)', () => {
  it('fires with correct tradeId and accountId after a successful insert', () => {
    const db = makeDb()
    const pair = db.select().from(schema.pairs).where(eq(schema.pairs.symbol, 'EURUSD')).get()
    const setup = db.select().from(schema.setups).limit(1).all()[0]
    if (!pair || !setup) throw new Error('seed data missing')

    const accountId = '00000000-0000-0000-0000-000000000011'
    insertAccount(db, accountId)

    const sender = makeSender()
    const res = callHandler('trades:create', sender, {
      accountId, pairId: pair.id, setupId: setup.id,
      mode: 'sim', direction: 'long', status: 'open',
      entryPrice: 109_000_0, stopLossPrice: 108_900_0, takeProfitPrice: 109_200_0,
      slPips: 100, rrRatio: 200, lotSize: 10,
      riskAmountCents: 100_00, riskPctBps: 100,
      plannedInvalidation: 'below the OB — liquidity sweep fails',
      mssConfirmed: 1, htfBiasAligned: 1,
      preCalmScore: 7, preUrgencyScore: 3, preNeedScore: 2,
    }) as IpcResponse<Trade>

    expect(res.ok).toBe(true)

    const event = findEvent(sender, 'trade.placed')
    expect(event).toBeDefined()
    if (!event) return
    expect(event.payload.accountId).toBe(accountId)
    expect(typeof event.payload.tradeId).toBe('string')
    expect((event.payload.tradeId as string).length).toBeGreaterThan(0)
  })
})

describe('cairn:event — trade.closed (trades:close)', () => {
  it('fires with tradeId, accountId, and pnlCents after close commits', () => {
    const db = makeDb()
    const pair = db.select().from(schema.pairs).where(eq(schema.pairs.symbol, 'EURUSD')).get()
    const setup = db.select().from(schema.setups).limit(1).all()[0]
    if (!pair || !setup) throw new Error('seed data missing')

    const accountId = '00000000-0000-0000-0000-000000000022'
    const tradeId   = '00000000-0000-0000-0000-000000000099'
    const now = Date.now()
    insertAccount(db, accountId)

    db.insert(schema.trades).values({
      id: tradeId, accountId, pairId: pair.id, setupId: setup.id,
      mode: 'sim', direction: 'long', status: 'open',
      entryPrice: 109_000_0, stopLossPrice: 108_900_0, takeProfitPrice: 109_200_0,
      slPips: 100, rrRatio: 200, lotSize: 10,
      riskAmountCents: 100_00, riskPctBps: 100,
      plannedInvalidation: 'below the OB',
      mssConfirmed: 1, htfBiasAligned: 1,
      preCalmScore: 7, preUrgencyScore: 3, preNeedScore: 2,
      openedAt: now, createdAt: now, updatedAt: now,
    }).run()

    const sender = makeSender()
    const res = callHandler('trades:close', sender, {
      tradeId, exitPrice: 109_200_0, exitTime: now + 60_000,
      exitReason: 'tp', followedPlanExactly: true,
      slMoved: false, enteredBeforeMss: false,
      rulesBroken: [], postCalmScore: 8,
    }) as IpcResponse<Trade>

    expect(res.ok).toBe(true)

    const event = findEvent(sender, 'trade.closed')
    expect(event).toBeDefined()
    if (!event) return
    expect(event.payload.tradeId).toBe(tradeId)
    expect(event.payload.accountId).toBe(accountId)
    expect(typeof event.payload.pnlCents).toBe('number')
    expect(Number.isInteger(event.payload.pnlCents)).toBe(true)
  })

  it('fires rule.violated for each broken rule', () => {
    const db = makeDb()
    const pair = db.select().from(schema.pairs).where(eq(schema.pairs.symbol, 'EURUSD')).get()
    const setup = db.select().from(schema.setups).limit(1).all()[0]
    if (!pair || !setup) throw new Error('seed data missing')

    const accountId = '00000000-0000-0000-0000-000000000033'
    const tradeId   = '00000000-0000-0000-0000-000000000098'
    const now = Date.now()
    insertAccount(db, accountId)

    db.insert(schema.trades).values({
      id: tradeId, accountId, pairId: pair.id, setupId: setup.id,
      mode: 'live', direction: 'short', status: 'open',
      entryPrice: 109_000_0, stopLossPrice: 109_100_0, takeProfitPrice: 108_700_0,
      slPips: 100, rrRatio: 300, lotSize: 5,
      riskAmountCents: 50_00, riskPctBps: 50,
      plannedInvalidation: 'above the FVG invalidation zone',
      mssConfirmed: 1, htfBiasAligned: 0,
      preCalmScore: 4, preUrgencyScore: 8, preNeedScore: 7,
      openedAt: now, createdAt: now, updatedAt: now,
    }).run()

    const sender = makeSender()
    callHandler('trades:close', sender, {
      tradeId, exitPrice: 109_100_0, exitTime: now + 120_000,
      exitReason: 'sl', followedPlanExactly: false,
      planChangesDescription: 'moved SL',
      slMoved: true, slMovedReason: 'panic',
      enteredBeforeMss: true,
      rulesBroken: ['no_sl_widening', 'require_mss_confirmation'],
      postCalmScore: 3,
    })

    const violations = sender.send.mock.calls.filter(
      ([ch, ev]: [string, { name: string }]) => ch === 'cairn:event' && ev.name === 'rule.violated',
    )
    expect(violations.length).toBe(2)
    const keys = violations.map(([, ev]: [string, { name: string; payload: { ruleKey: string } }]) => ev.payload.ruleKey)
    expect(keys).toContain('no_sl_widening')
    expect(keys).toContain('require_mss_confirmation')
  })
})

describe('cairn:event — trade.partial-closed (trades:partialClose)', () => {
  it('fires with tradeId and accountId after partial close commits', () => {
    const db = makeDb()
    const pair = db.select().from(schema.pairs).where(eq(schema.pairs.symbol, 'EURUSD')).get()
    const setup = db.select().from(schema.setups).limit(1).all()[0]
    if (!pair || !setup) throw new Error('seed data missing')

    const accountId = '00000000-0000-0000-0000-000000000044'
    const tradeId   = '00000000-0000-0000-0000-000000000097'
    const now = Date.now()
    insertAccount(db, accountId)

    db.insert(schema.trades).values({
      id: tradeId, accountId, pairId: pair.id, setupId: setup.id,
      mode: 'sim', direction: 'long', status: 'open',
      entryPrice: 109_000_0, stopLossPrice: 108_900_0, takeProfitPrice: 109_200_0,
      slPips: 100, rrRatio: 200, lotSize: 50,
      riskAmountCents: 100_00, riskPctBps: 100,
      plannedInvalidation: 'below the OB',
      mssConfirmed: 1, htfBiasAligned: 1,
      preCalmScore: 7, preUrgencyScore: 3, preNeedScore: 2,
      openedAt: now, createdAt: now, updatedAt: now,
    }).run()

    const sender = makeSender()
    const res = callHandler('trades:partialClose', sender, {
      tradeId, exitPrice: 109_150_0, exitTime: now + 30_000, closeLots: 25,
    }) as IpcResponse<Trade>

    expect(res.ok).toBe(true)

    const event = findEvent(sender, 'trade.partial-closed')
    expect(event).toBeDefined()
    if (!event) return
    expect(event.payload.tradeId).toBe(tradeId)
    expect(event.payload.accountId).toBe(accountId)
  })
})
