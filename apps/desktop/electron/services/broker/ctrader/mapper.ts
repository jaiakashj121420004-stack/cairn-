/**
 * cTrader execution-event → {@link BrokerEvent} mapper (Wave 4 —
 * `docs/broker-integration.md` §2.2 / §4).
 *
 * Pure: no I/O, no time read. The adapter supplies the symbol resolver (built
 * from the symbol list fetched after account auth) and a fallback clock. Both
 * transports normalise to the one `BrokerEvent` shape so the ingest service is
 * transport-agnostic.
 *
 * Numbers stay broker-native here (prices are protobuf doubles, volume is in
 * cTrader centi-units). The downstream ingest service decimal-encodes them to
 * integers — they are never written to SQLite as floats (CLAUDE.md §2.5 / §19.5).
 *
 * Direction note: a closing deal's `tradeSide` is the *opposite* of the position's
 * side, so direction is always taken from the position (`tradeData.tradeSide`),
 * never from the deal.
 */

import { EXECUTION_TYPE, POSITION_STATUS, TRADE_SIDE, executionEventSchema } from './messages'
import type { CtraderExecutionEvent } from './messages'
import type { BrokerEvent, BrokerEventType } from '@cairn/shared-types'

/** Symbol metadata the adapter resolves from `ProtoOASymbolsList`. */
export interface CtraderSymbolInfo {
  /** Broker symbol name (e.g. "EURUSD"), mapped to a Cairn pair downstream. */
  readonly name: string
  /** cTrader volume units per 1.0 lot (e.g. 10_000_000 for a standard FX lot). */
  readonly lotSizeCentiUnits: number
}

/** Context the adapter injects so the mapper stays pure. */
export interface CtraderMapContext {
  /** Resolve a numeric symbolId to its name + lot size, or null if unknown. */
  readonly resolveSymbol: (symbolId: number) => CtraderSymbolInfo | null
  /** Fallback event time when the payload carries none (UTC ms). */
  readonly nowMs: number
}

/** Default lot size when a symbol is unresolved (FX standard lot, centi-units). */
const DEFAULT_LOT_SIZE_CENTI_UNITS = 10_000_000

/** cTrader encodes "no protective order" as 0; normalise that to null. */
function nullableProtective(value: number | undefined): number | null {
  return value === undefined || value === 0 ? null : value
}

/** cTrader volume (centi-units) → lots, using the symbol's lot size. */
function volumeToLots(volumeCentiUnits: number, lotSizeCentiUnits: number): number {
  if (lotSizeCentiUnits <= 0) return 0
  return volumeCentiUnits / lotSizeCentiUnits
}

/**
 * Classify an execution event into a {@link BrokerEventType}, or `null` for the
 * many events that are not position-lifecycle (cancels, rejects, swaps, deposits).
 *
 * - `ORDER_REPLACED` → `position_modified` (SL/TP/size amended).
 * - `ORDER_FILLED` / `ORDER_PARTIAL_FILL` with a deal:
 *     - opening deal (no `closePositionDetail`) → `position_opened`,
 *     - reducing deal + position now `CLOSED` → `position_closed`,
 *     - reducing deal + position still `OPEN` → `partial_close`.
 */
function classify(e: CtraderExecutionEvent): BrokerEventType | null {
  if (e.executionType === EXECUTION_TYPE.ORDER_REPLACED) return 'position_modified'

  const isFill =
    e.executionType === EXECUTION_TYPE.ORDER_FILLED ||
    e.executionType === EXECUTION_TYPE.ORDER_PARTIAL_FILL
  if (!isFill || !e.deal) return null

  const isReducing = e.deal.closePositionDetail !== undefined
  if (!isReducing) return 'position_opened'

  const closed = e.position?.positionStatus === POSITION_STATUS.CLOSED
  return closed ? 'position_closed' : 'partial_close'
}

/**
 * Map a decoded `ProtoOAExecutionEvent` to a {@link BrokerEvent}, or `null` when
 * the event is not a position-lifecycle transition or lacks the position context
 * needed to describe a trade. Validates the payload shape first.
 */
export function mapExecutionEvent(raw: unknown, ctx: CtraderMapContext): BrokerEvent | null {
  const parsed = executionEventSchema.safeParse(raw)
  if (!parsed.success) return null
  const e = parsed.data

  const type = classify(e)
  if (!type) return null

  // Every mapped type needs the position for the dedupe key + direction.
  const pos = e.position
  if (!pos) return null

  const symbolId = pos.tradeData.symbolId
  const info = ctx.resolveSymbol(symbolId)
  // Unresolved symbols are NOT dropped — emit with a clear placeholder so the
  // ingest service surfaces UNRESOLVED_SYMBOL for resolution (spec §6).
  const symbol = info?.name ?? `ctrader:${symbolId}`
  const lotSize = info?.lotSizeCentiUnits ?? DEFAULT_LOT_SIZE_CENTI_UNITS

  const direction = pos.tradeData.tradeSide === TRADE_SIDE.SELL ? 'short' : 'long'

  // Volume + price depend on the lifecycle phase: an open/modify carries the
  // position total; a close/partial carries the deal's filled volume + price.
  let volumeCentiUnits: number
  let price: number
  let eventTimeMs: number
  if (type === 'position_opened' || type === 'position_modified') {
    volumeCentiUnits = pos.tradeData.volume
    price = pos.price ?? e.deal?.executionPrice ?? 0
    eventTimeMs =
      pos.utcLastUpdateTimestamp ??
      e.deal?.executionTimestamp ??
      pos.tradeData.openTimestamp ??
      ctx.nowMs
  } else {
    // partial_close / position_closed
    const deal = e.deal
    volumeCentiUnits = deal?.filledVolume ?? deal?.volume ?? 0
    price = deal?.executionPrice ?? pos.price ?? 0
    eventTimeMs = deal?.executionTimestamp ?? pos.utcLastUpdateTimestamp ?? ctx.nowMs
  }

  return {
    type,
    broker: 'ctrader',
    brokerAccountId: String(e.ctidTraderAccountId),
    brokerTradeId: String(pos.positionId),
    symbol,
    direction,
    volumeLots: volumeToLots(volumeCentiUnits, lotSize),
    price,
    stopLoss: nullableProtective(pos.stopLoss),
    takeProfit: nullableProtective(pos.takeProfit),
    eventTimeMs,
    raw,
  }
}
