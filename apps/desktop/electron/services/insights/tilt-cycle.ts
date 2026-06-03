import type { ClosedTrade } from './types'
import type { Insight } from '../../../shared/types/index'

const LOSS_RUN = 3 // consecutive losses that trigger the check
const OVERRISK_MULT = 1.5 // multiplier over default risk
const MIN_OCCURRENCES = 2 // must see ≥ 2 times in 30 days

/**
 * Detects tilt cycles: sequences of LOSS_RUN consecutive losses immediately
 * followed by a trade with risk > defaultRiskPctBps × OVERRISK_MULT.
 *
 * @param defaultRiskPctBps  Account's normal risk per trade (basis points).
 *                           Caller computes this from account_rules or trade median.
 */
export function tiltCycle(trades: ClosedTrade[], defaultRiskPctBps: number): Insight | null {
  if (defaultRiskPctBps <= 0) return null

  // Sort ascending by exitTime so we scan in trade order
  const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime)
  const threshold = defaultRiskPctBps * OVERRISK_MULT

  // Collect timestamps of every tilt-cycle occurrence
  const occurrences: number[] = []

  for (let i = LOSS_RUN; i < sorted.length; i++) {
    const lossRun = sorted.slice(i - LOSS_RUN, i).every((t) => (t.pnlR ?? 0) < 0)
    const overRisk = sorted[i].riskPctBps > threshold
    if (lossRun && overRisk) {
      occurrences.push(sorted[i].exitTime)
    }
  }

  if (occurrences.length === 0) return null

  const now = Date.now()
  const countInWindow = (days: number) => {
    const cutoff = now - days * 86_400_000
    return occurrences.filter((t) => t >= cutoff).length
  }

  const count30 = countInWindow(30)
  const count60 = countInWindow(60)
  const count90 = countInWindow(90)

  if (count30 < MIN_OCCURRENCES) return null

  return {
    id: 'tilt-cycle',
    severity: count30 >= 4 ? 'high' : 'medium',
    title: 'You over-risk after losing streaks',
    body: `Cairn observed ${count30} tilt cycle${count30 !== 1 ? 's' : ''} in the last 30 days: 3 consecutive losses followed by a trade at >${(OVERRISK_MULT * 100 - 100).toFixed(0)}% above your normal risk. (${count60} in 60 d, ${count90} in 90 d.)`,
    sampleSize: sorted.length,
  }
}
