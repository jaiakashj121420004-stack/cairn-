/**
 * cTrader historical backfill (Wave 4 / P0.3) — pure reconstruction logic.
 *
 * The live stream (`OA_EXECUTION_EVENT`) only reports fills that happen AFTER we
 * connect. To populate pre-existing trades, the adapter issues read-only
 * `ProtoOADealListReq`s on connect and feeds the returned deals here. This module
 * turns a flat list of `ProtoOADeal`s into the same {@link BrokerEvent} stream the
 * live path produces, so the existing accumulator + ingest reconstruct trades and
 * DEDUPE them against the live stream via `external_ref` (= positionId). No new
 * persistence path — backfilled events are "live-shaped" (`imported_at` stays null),
 * so a later statement import can still settle the authoritative money.
 *
 * Read-only: this module never sends anything; it only interprets read responses.
 *
 * Reconstruction rules (from the cTrader deal model):
 *   - A deal WITHOUT `closePositionDetail` is an opening (or scale-in) fill.
 *   - A deal WITH `closePositionDetail` is a reducing fill; `closedVolume` is how
 *     much of the position it closed and `entryPrice` is the position's entry.
 *   - Direction comes from an opening deal's `tradeSide`; a closing deal's
 *     `tradeSide` is the OPPOSITE of the position side (mapper.ts §direction note),
 *     so when only closing deals are in-window we invert it.
 *   - The reducing deal that brings cumulative closed volume up to the opened
 *     volume is the final `position_closed`; earlier reducing deals are
 *     `partial_close`. A position with no reducing deals stays open (one
 *     `position_opened` event), and the live stream will later close it.
 *
 * Backfilled trades carry no stop-loss / take-profit (the deal list omits the
 * position's protective orders); that is expected for historical rows.
 */

import { TRADE_SIDE } from './messages'
import type { CtraderSymbolInfo } from './mapper'
import type { CtraderDeal } from './messages'
import type { BrokerEvent } from '@cairn/shared-types'

/** cTrader volume units per 1.0 lot when a symbol omits its lot size (FX standard). */
const DEFAULT_LOT_SIZE_CENTI_UNITS = 10_000_000

/** cTrader's maximum span per deal-list request (Spotware caps this at ~1 week). */
export const DEAL_LIST_MAX_SPAN_MS = 604_800_000

export interface DealListWindow {
  readonly fromTimestamp: number
  readonly toTimestamp: number
}

/**
 * Plan the deal-list request windows covering `[now - lookbackMs, now]`, each no
 * wider than `maxSpanMs` (the API's per-request cap). Oldest window first. Returns
 * an empty array when `lookbackMs <= 0` (backfill disabled).
 */
export function planDealListWindows(
  nowMs: number,
  lookbackMs: number,
  maxSpanMs: number = DEAL_LIST_MAX_SPAN_MS,
): DealListWindow[] {
  if (lookbackMs <= 0 || maxSpanMs <= 0) return []
  const start = Math.max(0, nowMs - lookbackMs)
  const windows: DealListWindow[] = []
  let from = start
  while (from < nowMs) {
    const to = Math.min(from + maxSpanMs, nowMs)
    windows.push({ fromTimestamp: from, toTimestamp: to })
    from = to
  }
  return windows
}

export interface DealMapContext {
  /** Resolve a numeric symbolId to its name + lot size, or null if unknown. */
  readonly resolveSymbol: (symbolId: number) => CtraderSymbolInfo | null
  /** The authorised ctidTraderAccountId, as the BrokerEvent's brokerAccountId. */
  readonly brokerAccountId: string
}

function dealVolume(d: CtraderDeal): number {
  return d.filledVolume ?? d.volume
}

function closedVolume(d: CtraderDeal): number {
  return d.closePositionDetail?.closedVolume ?? dealVolume(d)
}

function toLots(volumeCentiUnits: number, lotSizeCentiUnits: number): number {
  if (lotSizeCentiUnits <= 0) return 0
  return volumeCentiUnits / lotSizeCentiUnits
}

/**
 * Reconstruct the {@link BrokerEvent}s for one position from its (time-sorted)
 * deals. Emits one `position_opened` followed by the reducing deals as
 * `partial_close` / `position_closed`.
 */
function reconstructPosition(
  positionId: number,
  sorted: readonly CtraderDeal[],
  ctx: DealMapContext,
): BrokerEvent[] {
  const opening = sorted.filter((d) => d.closePositionDetail === undefined)
  const closing = sorted.filter((d) => d.closePositionDetail !== undefined)

  const firstOpen = opening[0]
  const firstClose = closing[0]

  let symbolId: number
  let direction: 'long' | 'short'
  let entryPrice: number
  let openVolume: number
  let openTs: number

  if (firstOpen) {
    symbolId = firstOpen.symbolId
    direction = firstOpen.tradeSide === TRADE_SIDE.SELL ? 'short' : 'long'
    entryPrice = firstOpen.executionPrice ?? 0
    openVolume = opening.reduce((sum, d) => sum + dealVolume(d), 0)
    openTs = firstOpen.executionTimestamp ?? 0
  } else if (firstClose) {
    // Position opened before the backfill window: reconstruct the entry from the
    // closing deal's closePositionDetail. The closing deal side is inverted.
    symbolId = firstClose.symbolId
    direction = firstClose.tradeSide === TRADE_SIDE.SELL ? 'long' : 'short'
    entryPrice = firstClose.closePositionDetail?.entryPrice ?? firstClose.executionPrice ?? 0
    openVolume = closing.reduce((sum, d) => sum + closedVolume(d), 0)
    openTs = (firstClose.executionTimestamp ?? 1) - 1
  } else {
    return []
  }

  const info = ctx.resolveSymbol(symbolId)
  const symbol = info?.name ?? `ctrader:${symbolId}`
  const lot = info?.lotSizeCentiUnits ?? DEFAULT_LOT_SIZE_CENTI_UNITS

  const events: BrokerEvent[] = [
    {
      type: 'position_opened',
      broker: 'ctrader',
      brokerAccountId: ctx.brokerAccountId,
      brokerTradeId: String(positionId),
      symbol,
      direction,
      volumeLots: toLots(openVolume, lot),
      price: entryPrice,
      stopLoss: null,
      takeProfit: null,
      eventTimeMs: openTs,
      raw: { source: 'backfill', positionId },
    },
  ]

  let cumulativeClosed = 0
  for (let i = 0; i < closing.length; i++) {
    const d = closing[i]
    if (!d) continue
    const vol = closedVolume(d)
    cumulativeClosed += vol
    const isLast = i === closing.length - 1
    const fullyClosed = isLast || cumulativeClosed >= openVolume
    events.push({
      type: fullyClosed ? 'position_closed' : 'partial_close',
      broker: 'ctrader',
      brokerAccountId: ctx.brokerAccountId,
      brokerTradeId: String(positionId),
      symbol,
      direction,
      volumeLots: toLots(vol, lot),
      price: d.executionPrice ?? 0,
      stopLoss: null,
      takeProfit: null,
      eventTimeMs: d.executionTimestamp ?? openTs,
      raw: { source: 'backfill', dealId: d.dealId },
    })
  }

  return events
}

/**
 * Convert a batch of backfilled deals into a chronological-per-position
 * {@link BrokerEvent} stream ready to feed the ingest service. Deals are grouped
 * by positionId; each group is reconstructed independently. Events within a group
 * are ordered opened → …closes; groups are otherwise independent (the ingest
 * accumulator keys on positionId, so cross-group interleaving is irrelevant).
 */
export function dealsToBrokerEvents(
  deals: readonly CtraderDeal[],
  ctx: DealMapContext,
): BrokerEvent[] {
  const byPosition = new Map<number, CtraderDeal[]>()
  for (const d of deals) {
    const group = byPosition.get(d.positionId) ?? []
    group.push(d)
    byPosition.set(d.positionId, group)
  }

  const events: BrokerEvent[] = []
  for (const [positionId, group] of byPosition) {
    const sorted = [...group].sort(
      (a, b) => (a.executionTimestamp ?? 0) - (b.executionTimestamp ?? 0) || a.dealId - b.dealId,
    )
    events.push(...reconstructPosition(positionId, sorted, ctx))
  }
  return events
}
