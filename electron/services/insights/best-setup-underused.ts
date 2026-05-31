import type { Insight } from '../../../shared/types/index'
import type { ClosedTrade } from './types'

const MIN_SETUP_TRADES = 10   // minimum to rank a setup
const MAX_USAGE_RATE   = 0.20 // surface if trader takes it < 20% of the time

/**
 * Finds the setup with the highest expectancy among those with ≥ MIN_SETUP_TRADES
 * and surfaces it if the trader takes that setup less than MAX_USAGE_RATE of the time.
 */
export function bestSetupUnderused(trades: ClosedTrade[]): Insight | null {
  if (trades.length === 0) return null

  type SetupAcc = { name: string; pnlRs: number[]; n: number }
  const bySetup = new Map<string, SetupAcc>()

  for (const t of trades) {
    const acc = bySetup.get(t.setupId) ?? { name: t.setupName, pnlRs: [], n: 0 }
    acc.n++
    if (t.pnlR != null) acc.pnlRs.push(t.pnlR)
    bySetup.set(t.setupId, acc)
  }

  let best: { id: string; name: string; expectancyR: number; n: number } | null = null

  for (const [id, s] of bySetup) {
    if (s.n < MIN_SETUP_TRADES || s.pnlRs.length === 0) continue
    const exp = s.pnlRs.reduce((a, b) => a + b, 0) / s.pnlRs.length
    if (best === null || exp > best.expectancyR) {
      best = { id, name: s.name, expectancyR: exp, n: s.n }
    }
  }

  if (best === null) return null

  const usageRate = best.n / trades.length
  if (usageRate >= MAX_USAGE_RATE) return null

  const expFormatted = fmtR(best.expectancyR)
  const usagePct = (usageRate * 100).toFixed(0)

  return {
    id: 'best-setup-underused',
    severity: 'medium',
    title: 'You under-use your best setup',
    body: `${best.name} is your highest-expectancy setup (${expFormatted} per trade) but you take it only ${usagePct}% of the time.`,
    sampleSize: trades.length,
  }
}

function fmtR(r: number): string {
  const sign = r >= 0 ? '+' : ''
  return `${sign}${(r / 100).toFixed(2)}R`
}
