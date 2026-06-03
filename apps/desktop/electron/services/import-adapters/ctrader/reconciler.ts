/**
 * cTrader position reconciler.
 *
 * Groups RawClosedPosition rows by positionId and folds them into
 * ImportCandidates. Multiple rows with the same positionId represent partial
 * closes of the same original position:
 *
 *   - All rows share the same openTime + openPrice (same entry).
 *   - Rows are sorted by closeTime; the LAST row is the final close.
 *   - All earlier rows become ImportPartialExit entries.
 *   - The total volumeLots = sum of all row volumes (= original position size).
 *   - pnlAmount = sum of all grossProfit values.
 *
 * RawOpenPosition rows are straightforward: one row → one open ImportCandidate.
 *
 * pairId is left null; the IPC handler resolves it against the pairs table.
 */

import type { RawClosedPosition, RawOpenPosition } from './parser'
import type {
  ImportCandidate,
  ImportPartialExit,
  TradeDirection,
} from '../../../../shared/types/index'

const LOT_EPS = 0.0001

// ─── Public ───────────────────────────────────────────────────────────────────

export function reconcilePositions(
  closedPositions: RawClosedPosition[],
  openPositions: RawOpenPosition[],
): ImportCandidate[] {
  const candidates: ImportCandidate[] = []

  // ── Closed positions ──────────────────────────────────────────────────────
  // Group by positionId to merge partial closes.
  const groups = new Map<string, RawClosedPosition[]>()
  for (const row of closedPositions) {
    let group = groups.get(row.positionId)
    if (!group) {
      group = []
      groups.set(row.positionId, group)
    }
    group.push(row)
  }

  for (const [positionId, rows] of groups) {
    const candidate = reconcileClosedGroup(positionId, rows)
    if (candidate) candidates.push(candidate)
  }

  // ── Open positions ────────────────────────────────────────────────────────
  for (const row of openPositions) {
    const candidate = reconcileOpenRow(row)
    if (candidate) candidates.push(candidate)
  }

  return candidates
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function reconcileClosedGroup(
  positionId: string,
  rows: RawClosedPosition[],
): ImportCandidate | null {
  if (rows.length === 0) return null

  // Sort by close time; the first row is the earliest (partial or full close)
  const sorted = [...rows].sort((a, b) => a.closeTimeMs - b.closeTimeMs)

  // All rows share the same open time/price/direction — take from any row
  const anchor = sorted[0]
  if (!anchor) return null
  const direction = toDirection(anchor.direction)
  if (!direction) return null // unrecognised direction value — skip

  // Total volume = sum of all closed portions
  const totalVolume = sorted.reduce((s, r) => s + safeFloat(r.volumeLots), 0).toFixed(2)

  // Total gross P&L = sum of all rows' grossProfit
  const totalPnl = sorted.reduce((s, r) => s + safeFloat(r.grossProfit), 0).toFixed(2)

  // Total commission = sum across all rows
  const totalComm = sorted.reduce((s, r) => s + safeFloat(r.commission), 0).toFixed(2)

  const totalSwap = sorted.reduce((s, r) => s + safeFloat(r.swap), 0).toFixed(2)

  // Final close = last row; partials = all other rows
  const finalRow = sorted[sorted.length - 1]
  if (!finalRow) return null

  let partialExits: ImportPartialExit[] = []
  if (sorted.length > 1) {
    // All rows except the last are partial closes
    partialExits = sorted.slice(0, -1).map((r, idx) => ({
      externalRef: `ctrader_pos_${positionId}_p${idx}`,
      exitTime: r.closeTimeMs,
      exitPrice: r.closePrice,
      volumeLots: r.volumeLots,
      pnlAmount: r.grossProfit,
    }))
  }

  const isFullyClosed = Math.abs(safeFloat(totalVolume) - 0) > LOT_EPS // always true; all rows are from Closed table

  void isFullyClosed

  return {
    externalRef: `ctrader_pos_${positionId}`,
    brokerTradeId: positionId,
    symbol: anchor.symbol,
    pairId: null,
    direction,
    entryTime: anchor.openTimeMs,
    entryPrice: anchor.openPrice,
    exitTime: finalRow.closeTimeMs,
    exitPrice: finalRow.closePrice,
    stopLoss: isZeroPrice(anchor.stopLoss) ? null : anchor.stopLoss,
    takeProfit: isZeroPrice(anchor.takeProfit) ? null : anchor.takeProfit,
    volumeLots: totalVolume,
    pnlAmount: totalPnl,
    commission: totalComm,
    swap: totalSwap,
    status: 'closed',
    partialExits,
  }
}

function reconcileOpenRow(row: RawOpenPosition): ImportCandidate | null {
  const direction = toDirection(row.direction)
  if (!direction) return null

  return {
    externalRef: `ctrader_pos_${row.positionId}`,
    brokerTradeId: row.positionId,
    symbol: row.symbol,
    pairId: null,
    direction,
    entryTime: row.openTimeMs,
    entryPrice: row.openPrice,
    exitTime: null,
    exitPrice: null,
    stopLoss: isZeroPrice(row.stopLoss) ? null : row.stopLoss,
    takeProfit: isZeroPrice(row.takeProfit) ? null : row.takeProfit,
    volumeLots: row.volumeLots,
    pnlAmount: '0.00',
    commission: row.commission,
    swap: row.swap,
    status: 'open',
    partialExits: [],
  }
}

function toDirection(raw: string): TradeDirection | null {
  const lower = raw.toLowerCase().trim()
  if (lower === 'buy' || lower === 'long' || lower === 'comprar') return 'long'
  if (lower === 'sell' || lower === 'short' || lower === 'vender') return 'short'
  return null
}

function safeFloat(s: string): number {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function isZeroPrice(s: string): boolean {
  const n = parseFloat(s)
  return !Number.isFinite(n) || n === 0
}
