// @vitest-environment node
//
// Integration test: MT5 loopback listener (Wave 4 — docs/broker-integration.md §2.1 / §8).
//
// Replays recorded EA frames (length-prefixed token envelopes) over a real
// loopback TCP connection into the listener and asserts:
//   1. the ingest service receives the exact BrokerEvents the EA sent, and
//      persists them to one trade row (full hand-off, listener → ingest → DB),
//   2. a frame carrying a wrong / absent pairing token is rejected — no event
//      reaches the ingest service and the connection is dropped.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { connect as tcpConnect } from 'net'
import initSqlJs from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import { eq } from 'drizzle-orm'
import * as schema from '../../electron/db/schema'
import { createBrokerIngestService } from '../../electron/services/broker/ingest'
import { createMt5Listener } from '../../electron/services/broker/mt5/listener'
import { encodeFrame } from '../../electron/services/broker/mt5/frame'
import type { Mt5Listener, Mt5RejectReason } from '../../electron/services/broker/mt5/listener'
import type { CairnDb } from '../../electron/db/index'
import type { BrokerEvent } from '@cairn/shared-types'
import type { Socket } from 'net'

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
].map((t) => readFileSync(join(__dirname, `../../electron/db/migrations/${t}.sql`), 'utf-8'))

const PROP_FIRM_ID = '00000000-0000-0000-0000-000000000001'
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000002'
const SETUP_ID = '00000000-0000-0000-0000-000000000003'
const EURUSD_PAIR_ID = '00000000-0000-0000-0000-000000000004'

const BROKER_ACCOUNT = 'MT5-DEMO-001'
const TRADE_ID = '987654321'
const TOKEN = 'test-pairing-token-deadbeef'

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

/** Recorded EA frames: a EURUSD long opened, partially closed, then closed. */
function recordedEvents(): BrokerEvent[] {
  const t0 = Date.UTC(2024, 0, 2, 9, 30)
  const base = {
    broker: 'mt5' as const,
    brokerAccountId: BROKER_ACCOUNT,
    brokerTradeId: TRADE_ID,
    symbol: 'EURUSD',
    direction: 'long' as const,
    raw: { deal: 1, entry: 0 },
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

let listener: Mt5Listener | null = null
let client: Socket | null = null

afterEach(async () => {
  client?.destroy()
  client = null
  await listener?.stop()
  listener = null
})

function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (cond()) {
        resolve()
        return
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('waitFor timed out'))
        return
      }
      setTimeout(tick, 10)
    }
    tick()
  })
}

function openClient(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const sock = tcpConnect({ host: '127.0.0.1', port }, () => resolve(sock))
    sock.on('error', reject)
  })
}

describe('mt5 listener — recorded frame replay', () => {
  it('hands the ingest service the exact BrokerEvents and persists one trade', async () => {
    const db = makeDb()
    let clock = Date.UTC(2024, 0, 2, 10, 0)
    const ingest = createBrokerIngestService({
      db,
      now: () => clock++,
      emit: () => {},
      resolveAccount: () => ({ accountId: ACCOUNT_ID, defaultSetupId: SETUP_ID }),
      getAutoLogMode: () => 'draft_awaiting_context',
    })

    const received: BrokerEvent[] = []
    listener = createMt5Listener({
      port: 0,
      token: TOKEN,
      onEvent: (e) => {
        received.push(e)
        ingest.apply(e)
      },
    })
    const started = await listener.start()
    expect(started.ok).toBe(true)
    if (!started.ok) return

    client = await openClient(started.data.port)
    const events = recordedEvents()
    for (const event of events) {
      client.write(encodeFrame({ token: TOKEN, event }))
    }

    await waitFor(() => received.length === events.length)

    // The ingest service received exactly the events the EA sent.
    expect(received).toEqual(events)

    // …and persisted them to a single, correctly-encoded trade row.
    const trade = db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.externalRef, TRADE_ID))
      .get()
    if (!trade) throw new Error('trade row not found')
    expect(trade.status).toBe('closed')
    expect(trade.lotSize).toBe(10) // 0.10 × 100
    expect(trade.entryPrice).toBe(108_500)
    expect(trade.exitPrice).toBe(108_700)

    const partials = db
      .select()
      .from(schema.tradePartials)
      .where(eq(schema.tradePartials.tradeId, trade.id))
      .all()
    expect(partials).toHaveLength(1)
    expect(partials[0]?.closeLots).toBe(5)
  })
})

describe('mt5 listener — token enforcement', () => {
  it('rejects a frame with the wrong token and forwards nothing', async () => {
    const received: BrokerEvent[] = []
    const rejects: Mt5RejectReason[] = []
    listener = createMt5Listener({
      port: 0,
      token: TOKEN,
      onEvent: (e) => received.push(e),
      onReject: (r) => rejects.push(r),
    })
    const started = await listener.start()
    expect(started.ok).toBe(true)
    if (!started.ok) return

    client = await openClient(started.data.port)
    const [open] = recordedEvents()
    client.write(encodeFrame({ token: 'WRONG-TOKEN', event: open }))

    await waitFor(() => rejects.includes('BAD_TOKEN'))
    expect(received).toHaveLength(0)
    expect(rejects).toContain('BAD_TOKEN')
  })

  it('rejects a frame with no token field and forwards nothing', async () => {
    const received: BrokerEvent[] = []
    const rejects: Mt5RejectReason[] = []
    listener = createMt5Listener({
      port: 0,
      token: TOKEN,
      onEvent: (e) => received.push(e),
      onReject: (r) => rejects.push(r),
    })
    const started = await listener.start()
    expect(started.ok).toBe(true)
    if (!started.ok) return

    client = await openClient(started.data.port)
    const [open] = recordedEvents()
    // Envelope missing the `token` field entirely.
    client.write(encodeFrame({ event: open }))

    await waitFor(() => rejects.length > 0)
    expect(received).toHaveLength(0)
    expect(rejects).toContain('BAD_ENVELOPE')
  })
})
