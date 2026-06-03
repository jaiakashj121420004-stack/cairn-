import type { ClosedTrade } from './types'
import type { Insight } from '../../../shared/types/index'

const MIN_HOUR_TRADES = 5

/**
 * Finds the worst-expectancy hour-of-day (in the given IANA timezone) and
 * surfaces it when expectancy is negative and the bucket has ≥ MIN_HOUR_TRADES.
 */
export function worstHour(trades: ClosedTrade[], timeZone: string): Insight | null {
  if (trades.length === 0) return null

  type HourAcc = { sumR: number; n: number }
  const byHour = new Map<number, HourAcc>()

  for (const t of trades) {
    const hour = extractHour(t.exitTime, timeZone)
    const acc = byHour.get(hour) ?? { sumR: 0, n: 0 }
    acc.sumR += t.pnlR ?? 0
    acc.n++
    byHour.set(hour, acc)
  }

  let worst: { hour: number; expectancyR: number; n: number } | null = null

  for (const [hour, { sumR, n }] of byHour) {
    if (n < MIN_HOUR_TRADES) continue
    const exp = sumR / n
    if (worst === null || exp < worst.expectancyR) {
      worst = { hour, expectancyR: exp, n }
    }
  }

  if (worst === null || worst.expectancyR >= 0) return null

  return {
    id: 'worst-hour',
    severity: worst.expectancyR < -50 ? 'high' : 'medium',
    title: 'One trading hour consistently loses',
    body: `Your worst hour is ${fmtHour(worst.hour)} with ${fmtR(worst.expectancyR)} expectancy over ${worst.n} trades.`,
    sampleSize: worst.n,
  }
}

function extractHour(exitTimeMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(exitTimeMs)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  return h === 24 ? 0 : h
}

function fmtHour(h: number): string {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

function fmtR(r: number): string {
  const sign = r >= 0 ? '+' : ''
  return `${sign}${(r / 100).toFixed(2)}R`
}
