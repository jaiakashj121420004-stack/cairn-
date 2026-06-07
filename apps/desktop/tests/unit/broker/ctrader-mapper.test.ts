// @vitest-environment node
//
// Unit test: cTrader execution-event → BrokerEvent mapping (Wave 4 —
// docs/broker-integration.md §2.2 / §4). Replays a set of recorded, decoded
// ProtoOAExecutionEvent payloads (a EURUSD long opened, partially closed, then
// closed, plus an SL-widen modify and a non-lifecycle cancel) and asserts the
// normalised BrokerEvents. No network, no DB — the mapper is pure.

import { describe, it, expect } from 'vitest'
import { mapExecutionEvent } from '../../../electron/services/broker/ctrader/mapper'
import {
  EXECUTION_TYPE,
  POSITION_STATUS,
  TRADE_SIDE,
} from '../../../electron/services/broker/ctrader/messages'
import type { CtraderSymbolInfo } from '../../../electron/services/broker/ctrader/mapper'

const ACCOUNT_ID = 12345
const POSITION_ID = 777
const EURUSD_SYMBOL_ID = 1
// One standard FX lot = 10,000,000 cTrader volume centi-units.
const LOT = 10_000_000

const SYMBOLS: Record<number, CtraderSymbolInfo> = {
  [EURUSD_SYMBOL_ID]: { name: 'EURUSD', lotSizeCentiUnits: LOT },
}

const ctx = {
  resolveSymbol: (id: number): CtraderSymbolInfo | null => SYMBOLS[id] ?? null,
  nowMs: Date.UTC(2024, 0, 2, 10, 0),
}

const T0 = Date.UTC(2024, 0, 2, 9, 30)

function tradeData(volume: number) {
  return { symbolId: EURUSD_SYMBOL_ID, volume, tradeSide: TRADE_SIDE.BUY, openTimestamp: T0 }
}

describe('cTrader mapper — recorded execution events', () => {
  it('maps an opening fill to position_opened', () => {
    const payload = {
      ctidTraderAccountId: ACCOUNT_ID,
      executionType: EXECUTION_TYPE.ORDER_FILLED,
      position: {
        positionId: POSITION_ID,
        positionStatus: POSITION_STATUS.OPEN,
        tradeData: tradeData(LOT / 10), // 0.1 lot
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
    }
    const event = mapExecutionEvent(payload, ctx)
    expect(event).not.toBeNull()
    expect(event).toMatchObject({
      type: 'position_opened',
      broker: 'ctrader',
      brokerAccountId: String(ACCOUNT_ID),
      brokerTradeId: String(POSITION_ID),
      symbol: 'EURUSD',
      direction: 'long',
      price: 1.085,
      stopLoss: 1.084,
      takeProfit: 1.087,
      eventTimeMs: T0,
    })
    expect(event?.volumeLots).toBeCloseTo(0.1, 10)
  })

  it('maps a reducing fill on an open position to partial_close (closed lots only)', () => {
    const payload = {
      ctidTraderAccountId: ACCOUNT_ID,
      executionType: EXECUTION_TYPE.ORDER_PARTIAL_FILL,
      position: {
        positionId: POSITION_ID,
        positionStatus: POSITION_STATUS.OPEN,
        tradeData: tradeData(LOT / 20), // 0.05 lot remaining
        price: 1.085,
        stopLoss: 1.084,
        takeProfit: 1.087,
      },
      deal: {
        dealId: 2,
        positionId: POSITION_ID,
        symbolId: EURUSD_SYMBOL_ID,
        tradeSide: TRADE_SIDE.SELL, // closing deal side is opposite — must NOT drive direction
        volume: LOT / 20,
        filledVolume: LOT / 20,
        executionPrice: 1.086,
        executionTimestamp: T0 + 60_000,
        closePositionDetail: { entryPrice: 1.085, profit: 50, closedVolume: LOT / 20 },
      },
    }
    const event = mapExecutionEvent(payload, ctx)
    expect(event).toMatchObject({
      type: 'partial_close',
      direction: 'long', // from the position, not the deal
      price: 1.086,
      eventTimeMs: T0 + 60_000,
    })
    expect(event?.volumeLots).toBeCloseTo(0.05, 10)
  })

  it('maps a reducing fill that closes the position to position_closed', () => {
    const payload = {
      ctidTraderAccountId: ACCOUNT_ID,
      executionType: EXECUTION_TYPE.ORDER_FILLED,
      position: {
        positionId: POSITION_ID,
        positionStatus: POSITION_STATUS.CLOSED,
        tradeData: tradeData(0),
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
    }
    const event = mapExecutionEvent(payload, ctx)
    expect(event).toMatchObject({
      type: 'position_closed',
      direction: 'long',
      price: 1.087,
      eventTimeMs: T0 + 120_000,
    })
    expect(event?.volumeLots).toBeCloseTo(0.05, 10)
  })

  it('maps ORDER_REPLACED to position_modified with the new protective levels', () => {
    const payload = {
      ctidTraderAccountId: ACCOUNT_ID,
      executionType: EXECUTION_TYPE.ORDER_REPLACED,
      position: {
        positionId: POSITION_ID,
        positionStatus: POSITION_STATUS.OPEN,
        tradeData: tradeData(LOT / 10),
        price: 1.085,
        stopLoss: 1.0835, // widened against a long
        takeProfit: 1.087,
      },
    }
    const event = mapExecutionEvent(payload, ctx)
    expect(event).toMatchObject({ type: 'position_modified', stopLoss: 1.0835, takeProfit: 1.087 })
  })

  it('treats a zero protective level as null', () => {
    const payload = {
      ctidTraderAccountId: ACCOUNT_ID,
      executionType: EXECUTION_TYPE.ORDER_REPLACED,
      position: {
        positionId: POSITION_ID,
        positionStatus: POSITION_STATUS.OPEN,
        tradeData: tradeData(LOT / 10),
        price: 1.085,
        stopLoss: 0,
        takeProfit: 0,
      },
    }
    const event = mapExecutionEvent(payload, ctx)
    expect(event?.stopLoss).toBeNull()
    expect(event?.takeProfit).toBeNull()
  })

  it('returns null for non-lifecycle events (cancel/reject)', () => {
    const payload = {
      ctidTraderAccountId: ACCOUNT_ID,
      executionType: EXECUTION_TYPE.ORDER_CANCELLED,
      position: {
        positionId: POSITION_ID,
        positionStatus: POSITION_STATUS.OPEN,
        tradeData: tradeData(LOT / 10),
      },
    }
    expect(mapExecutionEvent(payload, ctx)).toBeNull()
  })

  it('surfaces an unresolved symbol with a placeholder rather than dropping it', () => {
    const payload = {
      ctidTraderAccountId: ACCOUNT_ID,
      executionType: EXECUTION_TYPE.ORDER_FILLED,
      position: {
        positionId: 888,
        positionStatus: POSITION_STATUS.OPEN,
        tradeData: { symbolId: 99, volume: LOT, tradeSide: TRADE_SIDE.BUY },
        price: 1.2,
      },
      deal: {
        dealId: 9,
        positionId: 888,
        symbolId: 99,
        tradeSide: TRADE_SIDE.BUY,
        volume: LOT,
        filledVolume: LOT,
        executionPrice: 1.2,
        executionTimestamp: T0,
      },
    }
    const event = mapExecutionEvent(payload, ctx)
    expect(event?.symbol).toBe('ctrader:99')
  })

  it('rejects a malformed payload (returns null, never throws)', () => {
    expect(mapExecutionEvent({ nonsense: true }, ctx)).toBeNull()
    expect(mapExecutionEvent(null, ctx)).toBeNull()
  })
})
