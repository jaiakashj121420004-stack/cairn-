/**
 * Pre-trade gate plan↔fill matcher (P0.7, docs/pre-trade-gate-popup.md §4).
 *
 * Pure: no I/O, no clock read. Given a live fill and the pending gate plans for the
 * same (account, pair, direction), pick the plan the fill fulfils:
 *   - a COMPLIANT plan (breachAck=0) matches when it hasn't expired and the fill's
 *     entry price is within the configured tolerance of the intended entry → `clean`;
 *   - failing that, an ACKNOWLEDGED-BREACH intent (breachAck=1) matches on the time
 *     window alone → `breach_ack`.
 * No match → `null` (the caller leaves gate_outcome n/a; "silent breach" scoring is
 * decided by the caller, which knows whether the gate was active for a live fill).
 *
 * Price encoding: prices are integer ticks `round(price × 10^(pipDecimal+1))`, so
 * exactly 10 ticks = 1 pip for every instrument — the tolerance conversion is
 * pip-decimal-independent.
 */

/** Ticks per pip under the trades price encoding (10^(pipDecimal+1)). */
export const TICKS_PER_PIP = 10

export interface PendingPlan {
  readonly id: string
  readonly direction: string
  readonly breachAck: number
  /** Intended entry as price ticks, or null for a breach-ack intent. */
  readonly intendedEntry: number | null
  readonly createdAt: number
  readonly expiresAt: number
}

export interface FillInfo {
  readonly direction: string
  /** Actual fill entry as price ticks. */
  readonly entryPriceTicks: number
  /** Broker-reported fill time (UTC ms). */
  readonly eventTimeMs: number
}

export type GateOutcome = 'clean' | 'breach_ack' | 'breach_silent'

export interface GateMatch {
  readonly plan: PendingPlan
  readonly outcome: 'clean' | 'breach_ack'
}

/**
 * Pick the plan a fill fulfils, or null. `plans` should already be scoped to the
 * fill's (account, pair, direction) and `status = 'pending'`.
 */
export function matchFillToPlan(
  fill: FillInfo,
  plans: readonly PendingPlan[],
  priceTolerancePips: number,
): GateMatch | null {
  const live = plans.filter(
    (p) => p.direction === fill.direction && fill.eventTimeMs <= p.expiresAt,
  )

  const toleranceTicks = Math.max(0, Math.round(priceTolerancePips * TICKS_PER_PIP))

  // Prefer a compliant plan whose intended entry is within tolerance; newest first.
  const compliant = live
    .filter(
      (p) =>
        p.breachAck === 0 &&
        p.intendedEntry !== null &&
        Math.abs(fill.entryPriceTicks - p.intendedEntry) <= toleranceTicks,
    )
    .sort((a, b) => b.createdAt - a.createdAt)
  const bestCompliant = compliant[0]
  if (bestCompliant) return { plan: bestCompliant, outcome: 'clean' }

  // Else an acknowledged-breach intent (no level check — the trader opted out).
  const ack = live.filter((p) => p.breachAck === 1).sort((a, b) => b.createdAt - a.createdAt)
  const bestAck = ack[0]
  if (bestAck) return { plan: bestAck, outcome: 'breach_ack' }

  return null
}
