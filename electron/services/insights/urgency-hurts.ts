import type { Insight } from '../../../shared/types/index'
import type { ClosedTrade } from './types'

const MIN_BUCKET = 10
const MIN_DELTA_PP = 10  // percentage points

/**
 * Surface when win-rate is materially lower at high urgency than at low urgency.
 * Buckets: urgency ≤ 5 (calm) vs urgency ≥ 7 (urgent).
 * Requires ≥ MIN_BUCKET trades in each bucket and > MIN_DELTA_PP difference.
 */
export function urgencyHurts(trades: ClosedTrade[]): Insight | null {
  const low  = trades.filter((t) => t.preUrgencyScore <= 5)
  const high = trades.filter((t) => t.preUrgencyScore >= 7)

  if (low.length < MIN_BUCKET || high.length < MIN_BUCKET) return null

  const winRate = (bucket: ClosedTrade[]) =>
    (bucket.filter((t) => (t.pnlR ?? 0) > 0).length / bucket.length) * 100

  const wrLow  = winRate(low)
  const wrHigh = winRate(high)
  const delta  = wrLow - wrHigh

  if (delta <= MIN_DELTA_PP) return null

  const severity = delta > 20 ? 'high' : 'medium'

  return {
    id: 'urgency-hurts',
    severity,
    title: 'High urgency hurts your win rate',
    body: `Your win-rate is ${wrLow.toFixed(0)}% when urgency ≤ 5, but ${wrHigh.toFixed(0)}% when urgency ≥ 7. (${low.length}/${high.length} trades each.)`,
    sampleSize: low.length + high.length,
  }
}
