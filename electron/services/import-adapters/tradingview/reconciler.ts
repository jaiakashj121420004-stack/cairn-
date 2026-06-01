/**
 * TradingView trade reconciler.
 *
 * Groups raw rows (from the CSV parser) by "Trade #" and produces one
 * ImportCandidate per trade group.
 *
 * Reconciliation rules:
 *   - Each group has exactly one entry row ("entry long" / "entry short").
 *   - Exit rows ("exit long" / "exit short") for the same Trade # are
 *     sorted chronologically. If there are multiple exit rows the earlier
 *     ones are partial exits; the last one is the final close.
 *   - If there are no exit rows the trade is still open.
 *   - If there is no entry row in a group the group is skipped (orphan exits).
 *   - `pnlAmount` is the sum of all exit-row `profit` values.
 *   - TradingView CSV does not export SL/TP → both are null.
 *   - `commission` and `swap` are not present → both "0.00".
 *   - `pairId` is always null here; the IPC handler resolves it.
 */

import type {
  ImportCandidate,
  ImportPartialExit,
  TradeDirection,
} from '../../../../shared/types/index'
import type { RawTvRow } from './parser'

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * Reconcile a flat list of parsed TV rows into trade candidates.
 *
 * @param rows  All valid rows from parseTradingViewCsv — balance/summary rows
 *              already absent (TV CSV has no such rows).
 */
export function reconcileTvTrades(rows: RawTvRow[]): ImportCandidate[] {
  // Group rows by tradeNum, preserving encounter order
  const groups = new Map<string, RawTvRow[]>()
  for (const row of rows) {
    let group = groups.get(row.tradeNum)
    if (!group) {
      group = []
      groups.set(row.tradeNum, group)
    }
    group.push(row)
  }

  const candidates: ImportCandidate[] = []
  for (const [tradeNum, group] of groups) {
    const candidate = reconcileGroup(tradeNum, group)
    if (candidate) candidates.push(candidate)
  }
  return candidates
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function reconcileGroup(
  tradeNum: string,
  rows: RawTvRow[],
): ImportCandidate | null {
  const entryRow = rows.find((r) => isEntry(r.type))
  if (!entryRow) return null  // orphan exits — nothing to import

  const exitRows = rows
    .filter((r) => isExit(r.type))
    .sort((a, b) => a.dateTimeMs - b.dateTimeMs)

  const direction = directionFromType(entryRow.type)
  const isClosed  = exitRows.length > 0

  // Final exit = last exit row; earlier exits are partials
  const finalExit   = isClosed ? (exitRows[exitRows.length - 1] ?? null) : null
  const partialRows = isClosed ? exitRows.slice(0, -1) : []

  const partialExits: ImportPartialExit[] = partialRows.map((r, idx) => ({
    externalRef: `tv_trade_${tradeNum}_exit_${idx}`,
    exitTime:    r.dateTimeMs,
    exitPrice:   r.price,
    volumeLots:  r.contracts,
    pnlAmount:   r.profit || '0',
  }))

  // Total P&L = sum of all exit-row profits
  const totalPnl = exitRows.reduce(
    (sum, r) => sum + safeFloat(r.profit),
    0,
  )

  return {
    externalRef:   `tv_trade_${tradeNum}`,
    brokerTradeId: tradeNum,
    symbol:        entryRow.symbol,
    pairId:        null,
    direction,
    entryTime:     entryRow.dateTimeMs,
    entryPrice:    entryRow.price,
    exitTime:      finalExit?.dateTimeMs ?? null,
    exitPrice:     finalExit?.price ?? null,
    stopLoss:      null,   // TV CSV does not carry SL
    takeProfit:    null,   // TV CSV does not carry TP
    volumeLots:    entryRow.contracts,
    pnlAmount:     totalPnl.toFixed(2),
    commission:    '0.00',
    swap:          '0.00',
    status:        isClosed ? 'closed' : 'open',
    partialExits,
  }
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

function isEntry(type: string): boolean {
  return type.startsWith('entry') || type === 'buy'
}

function isExit(type: string): boolean {
  return type.startsWith('exit') || type === 'sell'
}

/** Derive direction from the entry row type (already lowercase). */
function directionFromType(type: string): TradeDirection {
  if (type === 'entry short' || type === 'sell') return 'short'
  return 'long'
}

function safeFloat(s: string): number {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}
