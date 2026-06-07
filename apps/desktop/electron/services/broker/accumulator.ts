/**
 * Live-broker stream accumulator (Wave 4 — `docs/broker-integration.md` §4/§6).
 *
 * Folds the per-position {@link BrokerEvent} stream into a single
 * {@link ImportCandidate}, exactly mirroring how the Wave 3 reconcilers fold raw
 * statement deals/positions into one candidate. The candidate is then driven
 * through the SAME `_shared/committer.ts` write path the importers use — no fork.
 *
 * Pure: no DB access, no time read, no side effects. The ingest service owns the
 * keyed state map and the writes.
 *
 * Money/pips: broker-native numbers are converted to plain decimal *strings* with
 * decimal.js (no scientific notation, no float drift) so `_shared/encoder.ts` can
 * encode them to integers. Numbers never reach storage (CLAUDE.md §2.5 / §19.5).
 */

import Decimal from 'decimal.js'
import type { ImportCandidate, TradeDirection } from '../../../shared/types/index'
import type { BrokerEvent } from '@cairn/shared-types'

/** One accumulated partial close, in broker-native numbers. */
interface AccumPartial {
  externalRef: string
  exitTime: number
  exitPrice: number
  volumeLots: number
}

/**
 * In-memory fold of one live position. Holds broker-native numbers; converted to
 * the integer-encoded {@link ImportCandidate} only at write time.
 */
export interface AccumulatedTrade {
  broker: BrokerEvent['broker']
  brokerAccountId: string
  brokerTradeId: string
  symbol: string
  direction: TradeDirection
  entryTime: number
  entryPrice: number
  stopLoss: number | null
  takeProfit: number | null
  volumeLots: number // total entry lots
  exitTime: number | null
  exitPrice: number | null
  status: 'open' | 'closed'
  partials: AccumPartial[]
}

/** Plain non-exponential decimal string for the encoder (never a float repr). */
function dec(n: number): string {
  return new Decimal(n).toFixed()
}

/** True for events that mutate an existing position (require a prior open). */
export function requiresOpenPosition(type: BrokerEvent['type']): boolean {
  return type === 'position_modified' || type === 'partial_close' || type === 'position_closed'
}

/**
 * Fold one event into the accumulated state for its position.
 *
 * - `position_opened` initialises (or re-initialises) the position.
 * - `position_modified` updates SL/TP and running size.
 * - `partial_close` appends a partial keyed `${brokerTradeId}_p${index}`.
 * - `position_closed` records the exit and flips status to closed.
 *
 * `heartbeat` must be filtered out by the caller (it carries no trade data).
 * For a mutating event with no prior state, returns the unchanged `prev`
 * (`undefined`) — the caller surfaces that as a NO_OPEN_POSITION error rather
 * than fabricating an entry from a modify/close price.
 */
export function foldEvent(
  prev: AccumulatedTrade | undefined,
  event: BrokerEvent,
): AccumulatedTrade | undefined {
  switch (event.type) {
    case 'position_opened':
      return {
        broker: event.broker,
        brokerAccountId: event.brokerAccountId,
        brokerTradeId: event.brokerTradeId,
        symbol: event.symbol,
        direction: event.direction,
        entryTime: event.eventTimeMs,
        entryPrice: event.price,
        stopLoss: event.stopLoss,
        takeProfit: event.takeProfit,
        volumeLots: event.volumeLots,
        exitTime: null,
        exitPrice: null,
        status: 'open',
        partials: [],
      }

    case 'position_modified': {
      if (!prev) return undefined
      return {
        ...prev,
        stopLoss: event.stopLoss,
        takeProfit: event.takeProfit,
        volumeLots: event.volumeLots,
      }
    }

    case 'partial_close': {
      if (!prev) return undefined
      const partial: AccumPartial = {
        externalRef: `${prev.brokerTradeId}_p${prev.partials.length}`,
        exitTime: event.eventTimeMs,
        exitPrice: event.price,
        volumeLots: event.volumeLots,
      }
      return { ...prev, partials: [...prev.partials, partial] }
    }

    case 'position_closed': {
      if (!prev) return undefined
      return {
        ...prev,
        exitTime: event.eventTimeMs,
        exitPrice: event.price,
        status: 'closed',
      }
    }

    case 'heartbeat':
      break
  }
  return prev
}

/**
 * Project the accumulated state to an {@link ImportCandidate} for the committer.
 *
 * `external_ref = brokerTradeId` is the single dedupe key (CLAUDE.md / spec §6);
 * partials carry their own derived refs so they upsert independently.
 *
 * `pnlAmount`/`commission`/`swap` are "0": live `BrokerEvent`s carry no settled
 * P&L. On reconciliation a later statement import (which does) wins for monetary
 * fields (spec §6). `pnlR` is still derived from prices in the committer.
 */
export function toCandidate(state: AccumulatedTrade): ImportCandidate {
  return {
    externalRef: state.brokerTradeId,
    brokerTradeId: state.brokerTradeId,
    symbol: state.symbol,
    pairId: null,
    direction: state.direction,
    entryTime: state.entryTime,
    entryPrice: dec(state.entryPrice),
    exitTime: state.exitTime,
    exitPrice: state.exitPrice !== null ? dec(state.exitPrice) : null,
    stopLoss: state.stopLoss !== null ? dec(state.stopLoss) : null,
    takeProfit: state.takeProfit !== null ? dec(state.takeProfit) : null,
    volumeLots: dec(state.volumeLots),
    pnlAmount: '0',
    commission: '0',
    swap: '0',
    status: state.status,
    partialExits: state.partials.map((p) => ({
      externalRef: p.externalRef,
      exitTime: p.exitTime,
      exitPrice: dec(p.exitPrice),
      volumeLots: dec(p.volumeLots),
      pnlAmount: '0',
    })),
  }
}
