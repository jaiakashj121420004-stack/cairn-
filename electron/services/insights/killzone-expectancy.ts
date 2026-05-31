import type { Insight } from '../../../shared/types/index'
import type { ClosedTrade } from './types'

const MIN_OUTSIDE = 10

/**
 * Surface when outside-killzone expectancy is negative and there is enough data.
 * "Outside" = killzoneId is null (trader did not log a killzone for this trade).
 */
export function killzoneExpectancy(trades: ClosedTrade[]): Insight | null {
  const outside = trades.filter((t) => t.killzoneId === null)
  const inside  = trades.filter((t) => t.killzoneId !== null)

  if (outside.length < MIN_OUTSIDE) return null

  const expectancy = (bucket: ClosedTrade[]) => {
    if (bucket.length === 0) return 0
    const sum = bucket.reduce((acc, t) => acc + (t.pnlR ?? 0), 0)
    return sum / bucket.length
  }

  const expOutside = expectancy(outside)
  if (expOutside >= 0) return null

  const expInside  = expectancy(inside)
  const insidePart = inside.length > 0
    ? ` Inside killzones your expectancy is ${fmtR(expInside)} (${inside.length} trades).`
    : ''

  const severity = expOutside < -50 ? 'high' : 'medium'

  return {
    id: 'killzone-expectancy',
    severity,
    title: 'Outside killzones you lose on average',
    body: `Your expectancy outside listed killzones is ${fmtR(expOutside)} over ${outside.length} trades.${insidePart}`,
    sampleSize: outside.length,
  }
}

function fmtR(r: number): string {
  const sign = r >= 0 ? '+' : ''
  return `${sign}${(r / 100).toFixed(2)}R`
}
