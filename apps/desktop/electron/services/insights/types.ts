/**
 * Internal trade row consumed by all insight heuristics.
 * The IPC handler is responsible for fetching and mapping DB rows to this
 * shape before passing them to any heuristic function.
 *
 * All money/R fields are integer-encoded per CLAUDE.md §2.5:
 *   pnlR         : R × 100
 *   pnlCents     : integer cents
 *   riskPctBps   : risk-% × 100 (basis points)
 */
export interface ClosedTrade {
  id: string
  accountId: string
  setupId: string
  setupName: string
  killzoneId: string | null // null = traded outside any listed killzone
  mode: 'live' | 'sim' | 'backtest'
  pnlR: number | null // R × 100
  pnlCents: number | null
  preUrgencyScore: number // 1–10
  riskPctBps: number // risk-% × 100
  exitTime: number // UTC ms
}
