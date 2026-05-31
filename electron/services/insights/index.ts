import type { Insight, InsightSeverity } from '../../../shared/types/index'
import type { ClosedTrade } from './types'
import { urgencyHurts } from './urgency-hurts'
import { killzoneExpectancy } from './killzone-expectancy'
import { tiltCycle } from './tilt-cycle'
import { bestSetupUnderused } from './best-setup-underused'
import { worstHour } from './worst-hour'

const SEVERITY_ORDER: Record<InsightSeverity, number> = { high: 0, medium: 1, low: 2 }

/**
 * Run all heuristics against the provided trade list and return non-null
 * results sorted by severity (high → medium → low).
 *
 * @param trades            Closed trades for the account (mode filter applied by caller).
 * @param defaultRiskPctBps Account's normal risk-per-trade in basis points.
 * @param timeZone          IANA timezone string for hour-of-day bucketing.
 */
export function runInsights(
  trades: ClosedTrade[],
  defaultRiskPctBps: number,
  timeZone: string,
): Insight[] {
  const candidates = [
    urgencyHurts(trades),
    killzoneExpectancy(trades),
    tiltCycle(trades, defaultRiskPctBps),
    bestSetupUnderused(trades),
    worstHour(trades, timeZone),
  ]

  return candidates
    .filter((i): i is Insight => i !== null)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

export type { ClosedTrade }
