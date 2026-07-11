// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DEAL_LIST_MAX_SPAN_MS,
  dealsToBrokerEvents,
  planDealListWindows,
} from '../../../electron/services/broker/ctrader/backfill'
import { TRADE_SIDE } from '../../../electron/services/broker/ctrader/messages'
import type { CtraderDeal } from '../../../electron/services/broker/ctrader/messages'
import type { CtraderSymbolInfo } from '../../../electron/services/broker/ctrader/mapper'

const ONE_LOT = 10_000_000 // cTrader centi-units per 1.0 lot

function resolveSymbol(id: number): CtraderSymbolInfo | null {
  return id === 1 ? { name: 'EURUSD', lotSizeCentiUnits: ONE_LOT } : null
}

const ctx = { resolveSymbol, brokerAccountId: '42' }

function deal(
  overrides: Partial<CtraderDeal> & Pick<CtraderDeal, 'dealId' | 'positionId'>,
): CtraderDeal {
  return {
    symbolId: 1,
    tradeSide: TRADE_SIDE.BUY,
    volume: ONE_LOT,
    ...overrides,
  }
}

describe('planDealListWindows', () => {
  it('returns nothing when backfill is disabled (lookback <= 0)', () => {
    expect(planDealListWindows(1_000_000, 0)).toEqual([])
    expect(planDealListWindows(1_000_000, -5)).toEqual([])
  })

  it('produces one window when the lookback fits the max span', () => {
    const windows = planDealListWindows(1000, 500, 1000)
    expect(windows).toEqual([{ fromTimestamp: 500, toTimestamp: 1000 }])
  })

  it('chunks the lookback into contiguous windows no wider than the max span', () => {
    const windows = planDealListWindows(1000, 500, 200)
    expect(windows).toEqual([
      { fromTimestamp: 500, toTimestamp: 700 },
      { fromTimestamp: 700, toTimestamp: 900 },
      { fromTimestamp: 900, toTimestamp: 1000 },
    ])
    // Contiguous + fully covering [now-lookback, now].
    expect(windows[0]?.fromTimestamp).toBe(500)
    expect(windows[windows.length - 1]?.toTimestamp).toBe(1000)
  })

  it('defaults the span to the Spotware ~1-week cap', () => {
    const windows = planDealListWindows(DEAL_LIST_MAX_SPAN_MS * 2, DEAL_LIST_MAX_SPAN_MS * 2)
    expect(windows.length).toBe(2)
  })
})

describe('dealsToBrokerEvents', () => {
  it('reconstructs a full open→close long trade', () => {
    const events = dealsToBrokerEvents(
      [
        deal({
          dealId: 1,
          positionId: 100,
          tradeSide: TRADE_SIDE.BUY,
          executionPrice: 1.1,
          executionTimestamp: 1000,
        }),
        deal({
          dealId: 2,
          positionId: 100,
          tradeSide: TRADE_SIDE.SELL,
          executionPrice: 1.12,
          executionTimestamp: 2000,
          closePositionDetail: { entryPrice: 1.1, closedVolume: ONE_LOT, profit: 200 },
        }),
      ],
      ctx,
    )
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      type: 'position_opened',
      brokerTradeId: '100',
      symbol: 'EURUSD',
      direction: 'long',
      volumeLots: 1,
      price: 1.1,
      stopLoss: null,
      takeProfit: null,
      eventTimeMs: 1000,
    })
    expect(events[1]).toMatchObject({
      type: 'position_closed',
      brokerTradeId: '100',
      direction: 'long',
      volumeLots: 1,
      price: 1.12,
      eventTimeMs: 2000,
    })
  })

  it('splits a scaled-out position into partial_close then position_closed', () => {
    const events = dealsToBrokerEvents(
      [
        deal({
          dealId: 1,
          positionId: 7,
          tradeSide: TRADE_SIDE.BUY,
          executionPrice: 1.1,
          executionTimestamp: 1000,
        }),
        deal({
          dealId: 2,
          positionId: 7,
          tradeSide: TRADE_SIDE.SELL,
          volume: 4_000_000,
          executionPrice: 1.11,
          executionTimestamp: 1500,
          closePositionDetail: { entryPrice: 1.1, closedVolume: 4_000_000 },
        }),
        deal({
          dealId: 3,
          positionId: 7,
          tradeSide: TRADE_SIDE.SELL,
          volume: 6_000_000,
          executionPrice: 1.12,
          executionTimestamp: 2000,
          closePositionDetail: { entryPrice: 1.1, closedVolume: 6_000_000 },
        }),
      ],
      ctx,
    )
    expect(events.map((e) => e.type)).toEqual([
      'position_opened',
      'partial_close',
      'position_closed',
    ])
    expect(events[1]).toMatchObject({ volumeLots: 0.4, price: 1.11 })
    expect(events[2]).toMatchObject({ volumeLots: 0.6, price: 1.12 })
  })

  it('reconstructs the entry from closePositionDetail when the open predates the window (inverts side)', () => {
    const events = dealsToBrokerEvents(
      [
        deal({
          dealId: 9,
          positionId: 200,
          tradeSide: TRADE_SIDE.SELL, // closing deal side; position was a LONG
          volume: 5_000_000,
          executionPrice: 1.3,
          executionTimestamp: 5000,
          closePositionDetail: { entryPrice: 1.25, closedVolume: 5_000_000 },
        }),
      ],
      ctx,
    )
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      type: 'position_opened',
      direction: 'long', // inverted from the SELL closing deal
      price: 1.25, // entry from closePositionDetail
      volumeLots: 0.5,
      eventTimeMs: 4999,
    })
    expect(events[1]).toMatchObject({ type: 'position_closed', direction: 'long', price: 1.3 })
  })

  it('emits only an open event for a position still open in the window', () => {
    const events = dealsToBrokerEvents(
      [
        deal({
          dealId: 1,
          positionId: 300,
          tradeSide: TRADE_SIDE.BUY,
          executionPrice: 1.1,
          executionTimestamp: 1000,
        }),
      ],
      ctx,
    )
    expect(events).toEqual([
      expect.objectContaining({ type: 'position_opened', brokerTradeId: '300', direction: 'long' }),
    ])
  })

  it('groups deals by position independently', () => {
    const events = dealsToBrokerEvents(
      [
        deal({ dealId: 1, positionId: 1, executionTimestamp: 1000 }),
        deal({ dealId: 2, positionId: 2, executionTimestamp: 1100 }),
      ],
      ctx,
    )
    const ids = new Set(events.map((e) => e.brokerTradeId))
    expect(ids).toEqual(new Set(['1', '2']))
  })

  it('falls back to a placeholder symbol when unresolved', () => {
    const events = dealsToBrokerEvents(
      [deal({ dealId: 1, positionId: 5, symbolId: 999, executionTimestamp: 1000 })],
      ctx,
    )
    expect(events[0]?.symbol).toBe('ctrader:999')
  })
})
