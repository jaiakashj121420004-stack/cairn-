/**
 * MT5 deal reconciler.
 *
 * Groups raw deals from the Deals table into Cairn trade candidates.
 * Purely functional — no DB access.
 *
 * Reconciliation rules:
 *   - Group deals by `orderId`.
 *   - The "in" deal is the trade entry; "out" deals are exits.
 *   - If total exit lots ≈ entry lots: the LAST exit deal is the full close;
 *     earlier exits are partial closes.
 *   - If total exit lots < entry lots: position is still open; all exits so
 *     far are partial closes recorded in `partialExits`.
 *   - The caller (IPC handler) resolves `pairId` by matching `symbol` against
 *     the pairs table — `pairId` is `null` in the reconciler output.
 */

import type {
  Mt5TradeCandidate,
  Mt5PartialExit,
  TradeDirection,
} from '../../../../shared/types/index'
import type { RawDeal, RawOrder } from './parser'

const LOT_EPS = 0.0001  // float tolerance for "fully closed" check

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * Reconcile a flat list of deals into trade candidates.
 *
 * @param deals  All deals from the Deals table (balance rows already stripped).
 * @param orders All orders from the Orders table (for SL/TP lookup).
 * @returns      One candidate per orderId that has at least one "in" deal.
 */
export function reconcileDeals(
  deals: RawDeal[],
  orders: RawOrder[],
): Mt5TradeCandidate[] {
  const orderMap = buildOrderMap(orders)

  // Group by orderId, maintaining insertion order
  const groups = new Map<string, RawDeal[]>()
  for (const deal of deals) {
    let group = groups.get(deal.orderId)
    if (!group) {
      group = []
      groups.set(deal.orderId, group)
    }
    group.push(deal)
  }

  const candidates: Mt5TradeCandidate[] = []
  for (const [orderId, group] of groups) {
    const candidate = reconcileGroup(orderId, group, orderMap.get(orderId) ?? null)
    if (candidate) candidates.push(candidate)
  }
  return candidates
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildOrderMap(orders: RawOrder[]): Map<string, RawOrder> {
  const map = new Map<string, RawOrder>()
  for (const order of orders) {
    // Last entry wins if there are duplicates (shouldn't happen in practice)
    map.set(order.orderId, order)
  }
  return map
}

/**
 * Reconcile all deals for a single orderId into one Mt5TradeCandidate.
 * Returns null if there is no valid "in" deal (nothing to import).
 */
function reconcileGroup(
  orderId: string,
  deals: RawDeal[],
  order: RawOrder | null,
): Mt5TradeCandidate | null {
  // Sort chronologically
  const sorted = [...deals].sort((a, b) => a.timeMs - b.timeMs)

  const entryDeal = sorted.find(
    (d) => d.dealDirection === 'in' || d.dealDirection === 'in/out',
  )
  if (!entryDeal) return null  // no entry — skip (orphan exit, ignored)

  const exitDeals = sorted.filter(
    (d) => d !== entryDeal && (d.dealDirection === 'out' || d.dealDirection === 'in/out'),
  )

  const entryLots  = safeFloat(entryDeal.volumeLots)
  const totalExitLots = exitDeals.reduce((s, d) => s + safeFloat(d.volumeLots), 0)
  const isClosed   = exitDeals.length > 0 && Math.abs(totalExitLots - entryLots) < LOT_EPS

  // Sort exits chronologically
  const sortedExits = [...exitDeals].sort((a, b) => a.timeMs - b.timeMs)

  let partialExits: Mt5PartialExit[] = []
  let finalExit: RawDeal | null = null

  if (isClosed) {
    finalExit    = sortedExits[sortedExits.length - 1] ?? null
    partialExits = sortedExits.slice(0, -1).map(toPartialExit)
  } else {
    // Partially closed or still open — all exits so far are "partials"
    partialExits = sortedExits.map(toPartialExit)
  }

  // Sum P&L and commission across all exit deals
  const totalPnl  = exitDeals.reduce((s, d) => s + safeFloat(d.profit), 0)
  const totalComm = [entryDeal, ...exitDeals].reduce(
    (s, d) => s + safeFloat(d.commission),
    0,
  )
  const totalSwap = exitDeals.reduce((s, d) => s + safeFloat(d.swap), 0)

  const direction: TradeDirection =
    entryDeal.dealType === 'buy' ? 'long' : 'short'

  const sl = order?.stopLoss ?? null
  const tp = order?.takeProfit ?? null

  return {
    externalRef:  `mt5_order_${orderId}`,
    brokerTradeId: orderId,
    symbol:        entryDeal.symbol,
    pairId:        null,  // resolved by IPC handler against the pairs table
    direction,
    entryTime:     entryDeal.timeMs,
    entryPrice:    entryDeal.price,
    exitTime:      finalExit?.timeMs ?? null,
    exitPrice:     finalExit?.price ?? null,
    stopLoss:      isZeroPrice(sl) ? null : sl,
    takeProfit:    isZeroPrice(tp) ? null : tp,
    volumeLots:    entryDeal.volumeLots,
    pnlAmount:     totalPnl.toFixed(2),
    commission:    totalComm.toFixed(2),
    swap:          totalSwap.toFixed(2),
    status:        isClosed ? 'closed' : 'open',
    partialExits,
  }
}

function toPartialExit(deal: RawDeal): Mt5PartialExit {
  return {
    externalRef: `mt5_deal_${deal.dealId}`,
    exitTime:    deal.timeMs,
    exitPrice:   deal.price,
    volumeLots:  deal.volumeLots,
    pnlAmount:   deal.profit,
  }
}

function safeFloat(s: string): number {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/** Returns true for "0", "0.00000", "0.0", etc. — meaning the SL/TP was not set. */
function isZeroPrice(s: string | null): boolean {
  if (s === null) return true
  const n = parseFloat(s)
  return !Number.isFinite(n) || n === 0
}
