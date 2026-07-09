// @vitest-environment node
//
// Integration test: live-broker ingest (Wave 4 — docs/broker-integration.md §4/§6).
//
// Drives a recorded position_opened → partial_close → position_closed sequence
// through the transport-agnostic ingest service (a fake event source — no real
// transport in this slice) and asserts:
//   1. one trade row + one correctly integer-encoded partial,
//   2. replaying the same sequence inserts ZERO duplicates (external_ref dedupe),
//   3. lot/price encoding round-trips (fast-check property).

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import fc from 'fast-check'
import initSqlJs from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import { eq } from 'drizzle-orm'
import Decimal from 'decimal.js'
import * as schema from '../../electron/db/schema'
import { createBrokerIngestService } from '../../electron/services/broker/ingest'
import {
  commitWithReconcile,
  type PairDetail,
  type AccountDetail,
} from '../../electron/services/import-adapters/_shared/committer'
import { findExistingTrades } from '../../electron/services/import-adapters/_shared/deduper'
import { encodeLots, encodePrice } from '../../electron/services/import-adapters/_shared/encoder'
import type { CairnDb } from '../../electron/db/index'
import type { ImportCandidate } from '../../shared/types/index'
import type { BrokerEvent, BrokerAutoLogMode } from '@cairn/shared-types'
import type { SyncOpType } from '@cairn/sync-protocol'

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
].map((t) => readFileSync(join(__dirname, `../../electron/db/migrations/${t}.sql`), 'utf-8'))

const PROP_FIRM_ID = '00000000-0000-0000-0000-000000000001'
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000002'
const SETUP_ID = '00000000-0000-0000-0000-000000000003'
const EURUSD_PAIR_ID = '00000000-0000-0000-0000-000000000004'

const BROKER_ACCOUNT = 'MT5-DEMO-001'
const TRADE_ID = '11111111'

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs()
})

function makeDb(): CairnDb {
  const sqlite = new SQL.Database()
  for (const sql of MIGRATIONS) {
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const t = stmt.trim()
      if (t) sqlite.run(t)
    }
  }
  const db = drizzle(sqlite, { schema })
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

  db.insert(schema.pairs)
    .values({
      id: EURUSD_PAIR_ID,
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

  return db
}

/** A captured EURUSD long: open 0.10 lots, close half at 1.08600, rest at 1.08700. */
function makeSequence(): BrokerEvent[] {
  const t0 = Date.UTC(2024, 0, 2, 9, 30)
  const base = {
    broker: 'mt5' as const,
    brokerAccountId: BROKER_ACCOUNT,
    brokerTradeId: TRADE_ID,
    symbol: 'EURUSD',
    direction: 'long' as const,
    raw: null,
  }
  return [
    {
      ...base,
      type: 'position_opened',
      volumeLots: 0.1,
      price: 1.085,
      stopLoss: 1.084,
      takeProfit: 1.087,
      eventTimeMs: t0,
    },
    {
      ...base,
      type: 'partial_close',
      volumeLots: 0.05,
      price: 1.086,
      stopLoss: 1.084,
      takeProfit: 1.087,
      eventTimeMs: t0 + 60_000,
    },
    {
      ...base,
      type: 'position_closed',
      volumeLots: 0.05,
      price: 1.087,
      stopLoss: 1.084,
      takeProfit: 1.087,
      eventTimeMs: t0 + 120_000,
    },
  ]
}

interface Emitted {
  name: string
  payload: unknown
}

function makeService(
  db: CairnDb,
  emitted: Emitted[],
  mode: BrokerAutoLogMode = 'draft_awaiting_context',
) {
  let clock = Date.UTC(2024, 0, 2, 10, 0)
  return createBrokerIngestService({
    db,
    now: () => clock++,
    emit: (name, payload) => emitted.push({ name, payload }),
    resolveAccount: () => ({ accountId: ACCOUNT_ID, defaultSetupId: SETUP_ID }),
    getAutoLogMode: () => mode,
  })
}

function countTrades(db: CairnDb): number {
  return db.select().from(schema.trades).where(eq(schema.trades.externalRef, TRADE_ID)).all().length
}

describe('broker ingest — recorded sequence', () => {
  it('opened → partial → closed yields one trade + one integer-encoded partial', () => {
    const db = makeDb()
    const emitted: Emitted[] = []
    const svc = makeService(db, emitted)

    for (const event of makeSequence()) {
      const res = svc.apply(event)
      expect(res.ok).toBe(true)
    }

    expect(countTrades(db)).toBe(1)

    const trade = db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.externalRef, TRADE_ID))
      .get()
    if (!trade) throw new Error('trade row not found')
    expect(trade.status).toBe('closed')
    expect(trade.lotSize).toBe(10) // 0.10 × 100
    expect(trade.entryPrice).toBe(108_500) // 1.08500 × 10^5
    expect(trade.exitPrice).toBe(108_700)
    expect(trade.slPips).toBe(100) // |1.08500 − 1.08400| × 10^5

    const partials = db
      .select()
      .from(schema.tradePartials)
      .where(eq(schema.tradePartials.tradeId, trade.id))
      .all()
    expect(partials).toHaveLength(1)
    expect(partials[0]?.closeLots).toBe(5) // 0.05 × 100
    expect(partials[0]?.exitPrice).toBe(108_600) // 1.08600 × 10^5
    expect(partials[0]?.closePercentBps).toBe(5000) // 0.05 / 0.10 = 50.00%
    expect(partials[0]?.externalRef).toBe(`${TRADE_ID}_p0`)

    // Dashboard refresh events on the Wave 2 bus.
    expect(emitted.map((e) => e.name)).toEqual([
      'trade.placed',
      'trade.partial-closed',
      'trade.closed',
    ])
  })

  it('replaying the same sequence inserts zero duplicate rows (external_ref dedupe)', () => {
    const db = makeDb()
    const emitted: Emitted[] = []
    const svc = makeService(db, emitted)

    const seq = makeSequence()
    for (const event of seq) expect(svc.apply(event).ok).toBe(true)
    for (const event of seq) expect(svc.apply(event).ok).toBe(true)

    expect(countTrades(db)).toBe(1)

    const trade = db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.externalRef, TRADE_ID))
      .get()
    if (!trade) throw new Error('trade row not found')
    const partials = db
      .select()
      .from(schema.tradePartials)
      .where(eq(schema.tradePartials.tradeId, trade.id))
      .all()
    expect(partials).toHaveLength(1)

    // No partial row is orphaned under a different (duplicate) trade id.
    const allPartials = db.select().from(schema.tradePartials).all()
    expect(allPartials).toHaveLength(1)
  })

  it('rejects a partial/close for an unknown position rather than fabricating one', () => {
    const db = makeDb()
    const svc = makeService(db, [])
    const [, partial] = makeSequence()
    const res = svc.apply(partial)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('NO_OPEN_POSITION')
    expect(countTrades(db)).toBe(0)
  })
})

describe('broker ingest — auto-log mode & honesty boundary (spec §3)', () => {
  function closedTrade(db: CairnDb) {
    const t = db.select().from(schema.trades).where(eq(schema.trades.externalRef, TRADE_ID)).get()
    if (!t) throw new Error('trade row not found')
    return t
  }

  it('draft mode: closed fill enters the reflection queue with honesty left unreviewed', () => {
    const db = makeDb()
    const svc = makeService(db, [], 'draft_awaiting_context')

    let last: { awaitingReflection: boolean } | null = null
    for (const event of makeSequence()) {
      const res = svc.apply(event)
      expect(res.ok).toBe(true)
      if (res.ok && res.data) last = res.data
    }

    const trade = closedTrade(db)
    expect(trade.status).toBe('closed')
    // Owed a reflection → in the queue (status closed AND phase_2_complete = 0).
    expect(trade.phase2Complete).toBe(0)
    expect(last?.awaitingReflection).toBe(true)

    // Honesty fields are NEVER fabricated — null/unreviewed, never "clean".
    expect(trade.isClean).toBeNull()
    expect(trade.followedPlanExactly).toBeNull()
    expect(trade.rulesBroken).toBeNull()
    expect(trade.postCalmScore).toBeNull()
  })

  it('fully-auto mode: closed fill never queues, honesty still unreviewed', () => {
    const db = makeDb()
    const svc = makeService(db, [], 'fully_auto')

    let last: { awaitingReflection: boolean } | null = null
    for (const event of makeSequence()) {
      const res = svc.apply(event)
      expect(res.ok).toBe(true)
      if (res.ok && res.data) last = res.data
    }

    const trade = closedTrade(db)
    expect(trade.status).toBe('closed')
    // Complete record → never enters the queue.
    expect(trade.phase2Complete).toBe(1)
    expect(last?.awaitingReflection).toBe(false)

    // Crucially, "complete" does NOT mean "clean" — honesty stays unreviewed.
    expect(trade.isClean).toBeNull()
    expect(trade.followedPlanExactly).toBeNull()
  })

  it('a replayed fill never overwrites a reflection the trader already entered', () => {
    const db = makeDb()
    const svc = makeService(db, [], 'draft_awaiting_context')

    const seq = makeSequence()
    for (const event of seq) expect(svc.apply(event).ok).toBe(true)

    // Trader reflects on the drafted trade (Phase 2): marks it clean.
    const id = closedTrade(db).id
    db.update(schema.trades)
      .set({
        followedPlanExactly: 1,
        enteredBeforeMss: 0,
        rulesBroken: '[]',
        isClean: 1,
        postCalmScore: 8,
        phase2Complete: 1,
      })
      .where(eq(schema.trades.id, id))
      .run()

    // The same fill is replayed (e.g. reconnect re-sends the close).
    for (const event of seq) expect(svc.apply(event).ok).toBe(true)

    const after = closedTrade(db)
    // Mechanical fields still upserted (one row), but the reflection survives.
    expect(after.id).toBe(id)
    expect(after.isClean).toBe(1)
    expect(after.followedPlanExactly).toBe(1)
    expect(after.postCalmScore).toBe(8)
    expect(after.phase2Complete).toBe(1)
  })
})

describe('broker ingest — sync enqueue (spec §7)', () => {
  it('enqueues the streamed trade and its partials for sync', () => {
    const db = makeDb()
    const enqueued: { table: string; id: string; op: SyncOpType }[] = []
    let clock = Date.UTC(2024, 0, 2, 10, 0)
    const svc = createBrokerIngestService({
      db,
      now: () => clock++,
      emit: () => {},
      resolveAccount: () => ({ accountId: ACCOUNT_ID, defaultSetupId: SETUP_ID }),
      getAutoLogMode: () => 'draft_awaiting_context',
      enqueue: (table, id, op) => enqueued.push({ table, id, op }),
    })

    for (const event of makeSequence()) expect(svc.apply(event).ok).toBe(true)

    const trade = db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.externalRef, TRADE_ID))
      .get()
    if (!trade) throw new Error('trade row not found')

    // The persisted trade is queued (every applied event re-queues the canonical row).
    const tradeOps = enqueued.filter((e) => e.table === 'trades')
    expect(tradeOps.length).toBeGreaterThan(0)
    expect(tradeOps.every((e) => e.id === trade.id && e.op === 'upsert')).toBe(true)

    // The partial is queued too, so it converges to the web app.
    const partialOps = enqueued.filter((e) => e.table === 'trade_partials')
    expect(partialOps.length).toBeGreaterThan(0)
    expect(partialOps.every((e) => e.op === 'upsert')).toBe(true)
  })
})

describe('broker ingest ↔ statement reconciliation (spec §6)', () => {
  const PAIR: PairDetail = {
    id: EURUSD_PAIR_ID,
    pipDecimal: 4,
    pipValuePerStandardLotCents: 1000,
  }
  const ACCOUNT: AccountDetail = { id: ACCOUNT_ID, accountSizeCents: 1_000_000 }

  /**
   * The day's statement for the same broker trade. Carries the broker's settled
   * P&L ($152.50) and a DIFFERENT exit time than the live stream saw, so the test
   * can prove the statement wins money while the live timing survives.
   */
  function statementCandidate(): ImportCandidate {
    return {
      externalRef: TRADE_ID,
      brokerTradeId: TRADE_ID,
      symbol: 'EURUSD',
      pairId: EURUSD_PAIR_ID,
      direction: 'long',
      entryTime: Date.UTC(2024, 0, 2, 9, 30),
      entryPrice: '1.08500',
      exitTime: Date.UTC(2024, 0, 2, 15, 0), // ← differs from the live close time
      exitPrice: '1.08700',
      stopLoss: '1.08400',
      takeProfit: '1.08700',
      volumeLots: '0.10',
      pnlAmount: '152.50', // settled money the live stream never carried
      commission: '0',
      swap: '0',
      status: 'closed',
      partialExits: [],
    }
  }

  function reconcileStatement(db: CairnDb, nowMs: number) {
    const candidates = [statementCandidate()]
    const existing = findExistingTrades(
      db,
      candidates.map((c) => c.externalRef),
    )
    return commitWithReconcile(
      db,
      candidates,
      existing,
      { accountId: ACCOUNT_ID, defaultSetupId: SETUP_ID, brokerSource: 'mt5', nowMs },
      new Map([[EURUSD_PAIR_ID, PAIR]]),
      ACCOUNT,
    )
  }

  function liveTrade(db: CairnDb) {
    const t = db.select().from(schema.trades).where(eq(schema.trades.externalRef, TRADE_ID)).get()
    if (!t) throw new Error('trade row not found')
    return t
  }

  it('settles a live row with the statement: statement wins money, live keeps timing', () => {
    const db = makeDb()
    const svc = makeService(db, [])
    for (const event of makeSequence()) expect(svc.apply(event).ok).toBe(true)

    // Live capture carries no settled P&L (spec §6) and is not statement-stamped.
    const before = liveTrade(db)
    expect(before.pnlCents).toBe(0)
    expect(before.importedAt).toBeNull()
    const liveExitTime = before.exitTime

    const result = reconcileStatement(db, Date.UTC(2024, 0, 2, 18, 0))

    // One row, routed as a reconcile (not a fresh insert, not a skip).
    expect(result.imported).toBe(0)
    expect(result.reconciled).toBe(1)
    expect(result.skipped).toBe(0)
    expect(
      db.select().from(schema.trades).where(eq(schema.trades.externalRef, TRADE_ID)).all(),
    ).toHaveLength(1)

    const after = liveTrade(db)
    // Statement WINS monetary: $152.50 → 15250 cents.
    expect(after.pnlCents).toBe(15_250)
    expect(after.importedAt).not.toBeNull() // now marked settled
    // Live WINS intra-trade timing: the live close time survives the statement's.
    expect(after.exitTime).toBe(liveExitTime)
    // Live WINS its partial history — no duplicate partial inserted by the statement.
    expect(
      db
        .select()
        .from(schema.tradePartials)
        .where(eq(schema.tradePartials.tradeId, after.id))
        .all(),
    ).toHaveLength(1)
  })

  it('a replayed live event after settlement does not clobber the settled money', () => {
    const db = makeDb()
    const svc = makeService(db, [])
    const seq = makeSequence()
    for (const event of seq) expect(svc.apply(event).ok).toBe(true)
    reconcileStatement(db, Date.UTC(2024, 0, 2, 18, 0))
    expect(liveTrade(db).pnlCents).toBe(15_250)

    // Broker reconnects and re-sends the whole sequence (incl. the close at $0).
    for (const event of seq) expect(svc.apply(event).ok).toBe(true)

    const after = liveTrade(db)
    // Statement's settled money survives the replay; the marker is intact.
    expect(after.pnlCents).toBe(15_250)
    expect(after.importedAt).not.toBeNull()
    // Still one row, one partial — dedupe held throughout.
    expect(
      db.select().from(schema.trades).where(eq(schema.trades.externalRef, TRADE_ID)).all(),
    ).toHaveLength(1)
    expect(db.select().from(schema.tradePartials).all()).toHaveLength(1)
  })

  it('re-importing the same statement is an idempotent skip, not a second reconcile', () => {
    const db = makeDb()
    const svc = makeService(db, [])
    for (const event of makeSequence()) expect(svc.apply(event).ok).toBe(true)

    expect(reconcileStatement(db, Date.UTC(2024, 0, 2, 18, 0)).reconciled).toBe(1)
    // Second import of the same file: the row is now settled → skipped.
    const second = reconcileStatement(db, Date.UTC(2024, 0, 2, 19, 0))
    expect(second.reconciled).toBe(0)
    expect(second.skipped).toBe(1)
  })
})

describe('broker ingest — encoding round-trip (property)', () => {
  it('lots encode/decode round-trips within half a hundredth-lot', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 500, noNaN: true, noDefaultInfinity: true }),
        (lots) => {
          const encoded = encodeLots(new Decimal(lots).toFixed())
          const decoded = encoded / 100
          return Math.abs(decoded - lots) <= 0.005 + 1e-9
        },
      ),
    )
  })

  it('price encode/decode round-trips within half a tick', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.0001, max: 100_000, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 1, max: 4 }),
        (price, pipDecimal) => {
          const unit = Math.pow(10, pipDecimal + 1)
          const encoded = encodePrice(new Decimal(price).toFixed(), pipDecimal)
          const decoded = encoded / unit
          return Math.abs(decoded - price) <= 0.5 / unit + 1e-9
        },
      ),
    )
  })
})
