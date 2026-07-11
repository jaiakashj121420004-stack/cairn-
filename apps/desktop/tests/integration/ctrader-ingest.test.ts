// @vitest-environment node
//
// Integration test: cTrader adapter → ingest → DB (Wave 4 —
// docs/broker-integration.md §2.2 / §4 / §6). Drives the adapter with a FAKE
// connection (no TLS, no Spotware) through the full handshake, then replays
// recorded ProtoOAExecutionEvent payloads and asserts they normalise to
// BrokerEvents and persist to a single, correctly-encoded trade row. The network
// is entirely mocked — no live calls in CI (CLAUDE.md §19.10).

import { describe, it, expect, beforeAll } from 'vitest'
import { ok } from '@cairn/shared-types'
import initSqlJs from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import { eq } from 'drizzle-orm'
import * as schema from '../../electron/db/schema'
import { createBrokerIngestService } from '../../electron/services/broker/ingest'
import { createCtraderAdapter } from '../../electron/services/broker/ctrader/adapter'
import {
  EXECUTION_TYPE,
  PAYLOAD,
  POSITION_STATUS,
  TRADE_SIDE,
} from '../../electron/services/broker/ctrader/messages'
import { applyAllMigrations } from '../helpers/test-migrations'
import type {
  CtraderConnection,
  CtraderMessage,
} from '../../electron/services/broker/ctrader/connection'
import type { CairnDb } from '../../electron/db/index'

const PROP_FIRM_ID = '00000000-0000-0000-0000-000000000001'
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000002'
const SETUP_ID = '00000000-0000-0000-0000-000000000003'
const EURUSD_PAIR_ID = '00000000-0000-0000-0000-000000000004'

const CTID = 12345
const POSITION_ID = 777
const EURUSD_SYMBOL_ID = 1
const LOT = 10_000_000 // cTrader volume centi-units per standard lot
const T0 = Date.UTC(2024, 0, 2, 9, 30)

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs()
})

function makeDb(): CairnDb {
  const sqlite = new SQL.Database()
  applyAllMigrations(sqlite)
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

/** A fake CtraderConnection that lets the test push inbound decoded messages. */
function makeFakeConnection(): {
  conn: CtraderConnection
  push: (msg: CtraderMessage) => void
  sent: CtraderMessage[]
} {
  const handlers: Array<(m: CtraderMessage) => void> = []
  const sent: CtraderMessage[] = []
  const conn: CtraderConnection = {
    send: (m) => sent.push(m),
    onMessage: (h) => handlers.push(h),
    onClose: () => {},
    close: () => {},
  }
  return { conn, push: (m) => handlers.forEach((h) => h(m)), sent }
}

/** The recorded handshake + execution stream for a EURUSD long, partial, close. */
function recordedMessages(): CtraderMessage[] {
  const base = {
    ctidTraderAccountId: CTID,
    position: { positionId: POSITION_ID },
  }
  return [
    { payloadType: PAYLOAD.OA_APPLICATION_AUTH_RES, payload: {} },
    { payloadType: PAYLOAD.OA_ACCOUNT_AUTH_RES, payload: { ctidTraderAccountId: CTID } },
    {
      payloadType: PAYLOAD.OA_SYMBOLS_LIST_RES,
      payload: { symbol: [{ symbolId: EURUSD_SYMBOL_ID, symbolName: 'EURUSD', lotSize: LOT }] },
    },
    {
      payloadType: PAYLOAD.OA_EXECUTION_EVENT,
      payload: {
        ...base,
        executionType: EXECUTION_TYPE.ORDER_FILLED,
        position: {
          positionId: POSITION_ID,
          positionStatus: POSITION_STATUS.OPEN,
          tradeData: {
            symbolId: EURUSD_SYMBOL_ID,
            volume: LOT / 10,
            tradeSide: TRADE_SIDE.BUY,
            openTimestamp: T0,
          },
          price: 1.085,
          stopLoss: 1.084,
          takeProfit: 1.087,
        },
        deal: {
          dealId: 1,
          positionId: POSITION_ID,
          symbolId: EURUSD_SYMBOL_ID,
          tradeSide: TRADE_SIDE.BUY,
          volume: LOT / 10,
          filledVolume: LOT / 10,
          executionPrice: 1.085,
          executionTimestamp: T0,
        },
      },
    },
    {
      payloadType: PAYLOAD.OA_EXECUTION_EVENT,
      payload: {
        ...base,
        executionType: EXECUTION_TYPE.ORDER_PARTIAL_FILL,
        position: {
          positionId: POSITION_ID,
          positionStatus: POSITION_STATUS.OPEN,
          tradeData: { symbolId: EURUSD_SYMBOL_ID, volume: LOT / 20, tradeSide: TRADE_SIDE.BUY },
          price: 1.085,
          stopLoss: 1.084,
          takeProfit: 1.087,
        },
        deal: {
          dealId: 2,
          positionId: POSITION_ID,
          symbolId: EURUSD_SYMBOL_ID,
          tradeSide: TRADE_SIDE.SELL,
          volume: LOT / 20,
          filledVolume: LOT / 20,
          executionPrice: 1.086,
          executionTimestamp: T0 + 60_000,
          closePositionDetail: { entryPrice: 1.085, profit: 50 },
        },
      },
    },
    {
      payloadType: PAYLOAD.OA_EXECUTION_EVENT,
      payload: {
        ...base,
        executionType: EXECUTION_TYPE.ORDER_FILLED,
        position: {
          positionId: POSITION_ID,
          positionStatus: POSITION_STATUS.CLOSED,
          tradeData: { symbolId: EURUSD_SYMBOL_ID, volume: 0, tradeSide: TRADE_SIDE.BUY },
          price: 1.085,
        },
        deal: {
          dealId: 3,
          positionId: POSITION_ID,
          symbolId: EURUSD_SYMBOL_ID,
          tradeSide: TRADE_SIDE.SELL,
          volume: LOT / 20,
          filledVolume: LOT / 20,
          executionPrice: 1.087,
          executionTimestamp: T0 + 120_000,
          closePositionDetail: { entryPrice: 1.085, profit: 100 },
        },
      },
    },
  ]
}

describe('cTrader adapter → ingest — recorded execution replay', () => {
  it('persists the streamed position to one correctly-encoded trade row', async () => {
    const db = makeDb()
    let clock = Date.UTC(2024, 0, 2, 10, 0)
    const ingest = createBrokerIngestService({
      db,
      now: () => clock++,
      emit: () => {},
      resolveAccount: () => ({ accountId: ACCOUNT_ID, defaultSetupId: SETUP_ID }),
      getAutoLogMode: () => 'draft_awaiting_context',
    })

    const fake = makeFakeConnection()
    const adapter = createCtraderAdapter({
      clientId: 'cid',
      clientSecret: 'secret',
      accountId: CTID,
      getAccessToken: () => Promise.resolve(ok('access-token')),
      openConnection: () => Promise.resolve(ok(fake.conn)),
      now: () => clock,
      heartbeatMs: 0,
      schedule: () => {},
      backoffMs: [1],
    })

    const applied: boolean[] = []
    adapter.onEvent((e) => {
      applied.push(ingest.apply(e).ok)
    })

    const connected = await adapter.connect({ broker: 'ctrader', brokerAccountId: String(CTID) })
    expect(connected.ok).toBe(true)

    // The adapter opened the handshake read-only with an application-auth request.
    expect(fake.sent[0]?.payloadType).toBe(PAYLOAD.OA_APPLICATION_AUTH_REQ)

    for (const msg of recordedMessages()) fake.push(msg)
    await Promise.resolve() // let the async account-auth microtask settle

    expect(adapter.status()).toBe('connected')
    expect(applied.every(Boolean)).toBe(true)

    const trade = db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.externalRef, String(POSITION_ID)))
      .get()
    if (!trade) throw new Error('trade row not found')
    expect(trade.status).toBe('closed')
    expect(trade.lotSize).toBe(10) // 0.10 lot × 100
    expect(trade.entryPrice).toBe(108_500)
    expect(trade.exitPrice).toBe(108_700)
    expect(trade.brokerSource).toBe('ctrader')

    const partials = db
      .select()
      .from(schema.tradePartials)
      .where(eq(schema.tradePartials.tradeId, trade.id))
      .all()
    expect(partials).toHaveLength(1)
    expect(partials[0]?.closeLots).toBe(5) // 0.05 lot × 100
  })

  it('dedupes a replayed stream to the same row (external_ref upsert)', async () => {
    const db = makeDb()
    let clock = Date.UTC(2024, 0, 2, 10, 0)
    const ingest = createBrokerIngestService({
      db,
      now: () => clock++,
      emit: () => {},
      resolveAccount: () => ({ accountId: ACCOUNT_ID, defaultSetupId: SETUP_ID }),
      getAutoLogMode: () => 'draft_awaiting_context',
    })
    const fake = makeFakeConnection()
    const adapter = createCtraderAdapter({
      clientId: 'cid',
      clientSecret: 'secret',
      accountId: CTID,
      getAccessToken: () => Promise.resolve(ok('access-token')),
      openConnection: () => Promise.resolve(ok(fake.conn)),
      now: () => clock,
      heartbeatMs: 0,
      schedule: () => {},
    })
    adapter.onEvent((e) => void ingest.apply(e))
    await adapter.connect({ broker: 'ctrader', brokerAccountId: String(CTID) })

    const stream = recordedMessages()
    for (const msg of stream) fake.push(msg)
    for (const msg of stream) fake.push(msg) // replay the whole stream again
    await Promise.resolve()

    const trades = db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.externalRef, String(POSITION_ID)))
      .all()
    expect(trades).toHaveLength(1)
  })

  it('backfills a deal-list into a trade that converges with the live stream', async () => {
    const db = makeDb()
    let clock = Date.UTC(2024, 0, 3, 10, 0)
    const ingest = createBrokerIngestService({
      db,
      now: () => clock++,
      emit: () => {},
      resolveAccount: () => ({ accountId: ACCOUNT_ID, defaultSetupId: SETUP_ID }),
      getAutoLogMode: () => 'draft_awaiting_context',
    })
    const fake = makeFakeConnection()
    const adapter = createCtraderAdapter({
      clientId: 'cid',
      clientSecret: 'secret',
      accountId: CTID,
      getAccessToken: () => Promise.resolve(ok('access-token')),
      openConnection: () => Promise.resolve(ok(fake.conn)),
      now: () => clock,
      heartbeatMs: 0,
      schedule: () => {},
      backfillLookbackMs: 7 * 24 * 60 * 60 * 1000,
    })
    adapter.onEvent((e) => void ingest.apply(e))
    await adapter.connect({ broker: 'ctrader', brokerAccountId: String(CTID) })

    fake.push({ payloadType: PAYLOAD.OA_APPLICATION_AUTH_RES, payload: {} })
    await Promise.resolve()
    fake.push({ payloadType: PAYLOAD.OA_ACCOUNT_AUTH_RES, payload: { ctidTraderAccountId: CTID } })
    fake.push({
      payloadType: PAYLOAD.OA_SYMBOLS_LIST_RES,
      payload: { symbol: [{ symbolId: EURUSD_SYMBOL_ID, symbolName: 'EURUSD', lotSize: LOT }] },
    })

    // Symbols known → the adapter issues a read-only deal-list request for backfill.
    expect(fake.sent.some((m) => m.payloadType === PAYLOAD.OA_DEAL_LIST_REQ)).toBe(true)

    const BACKFILL_POS = 888
    // History returns a single opening deal — the position is still open.
    fake.push({
      payloadType: PAYLOAD.OA_DEAL_LIST_RES,
      payload: {
        ctidTraderAccountId: CTID,
        hasMore: false,
        deal: [
          {
            dealId: 501,
            positionId: BACKFILL_POS,
            symbolId: EURUSD_SYMBOL_ID,
            tradeSide: TRADE_SIDE.BUY,
            volume: LOT,
            filledVolume: LOT,
            executionPrice: 1.1,
            executionTimestamp: T0,
          },
        ],
      },
    })

    const openedRow = db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.externalRef, String(BACKFILL_POS)))
      .get()
    expect(openedRow?.status).toBe('open')

    // The LIVE stream then closes the same position → converges on the SAME row.
    fake.push({
      payloadType: PAYLOAD.OA_EXECUTION_EVENT,
      payload: {
        ctidTraderAccountId: CTID,
        executionType: EXECUTION_TYPE.ORDER_FILLED,
        position: {
          positionId: BACKFILL_POS,
          positionStatus: POSITION_STATUS.CLOSED,
          tradeData: { symbolId: EURUSD_SYMBOL_ID, volume: 0, tradeSide: TRADE_SIDE.BUY },
          price: 1.1,
        },
        deal: {
          dealId: 502,
          positionId: BACKFILL_POS,
          symbolId: EURUSD_SYMBOL_ID,
          tradeSide: TRADE_SIDE.SELL,
          volume: LOT,
          filledVolume: LOT,
          executionPrice: 1.12,
          executionTimestamp: T0 + 120_000,
          closePositionDetail: { entryPrice: 1.1, profit: 100 },
        },
      },
    })

    const rows = db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.externalRef, String(BACKFILL_POS)))
      .all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('closed')
  })
})
