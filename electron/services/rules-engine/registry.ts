import type { Rule } from './types'
import { rule as maxRiskPerTradePct } from './rules/max-risk-per-trade-pct'
import { rule as maxDailyLossPct } from './rules/max-daily-loss-pct'
import { rule as maxOverallDailyLossHardStopPct } from './rules/max-overall-daily-loss-hard-stop-pct'
import { rule as minRrRatio } from './rules/min-rr-ratio'
import { rule as positionSizeMatchesPlan } from './rules/position-size-matches-plan'
import { rule as requireMssConfirmation } from './rules/require-mss-confirmation'
import { rule as requireInvalidationText } from './rules/require-invalidation-text'
import { rule as requireHtfBiasLogged } from './rules/require-htf-bias-logged'
import { rule as noSlWidening } from './rules/no-sl-widening'
import { rule as requireKillzone } from './rules/require-killzone'
import { rule as requireDxyCheck } from './rules/require-dxy-check'
import { rule as maxTradesPerDay } from './rules/max-trades-per-day'
import { rule as cooldownAfterLossMinutes } from './rules/cooldown-after-loss-minutes'
import { rule as dailyStopAfterLosses } from './rules/daily-stop-after-losses'
import { rule as noRevengeTradeWindow } from './rules/no-revenge-trade-window'
import { rule as emotionalStateGate } from './rules/emotional-state-gate'
import { rule as weekendHoldingBlocked } from './rules/weekend-holding-blocked'
import { rule as minTradingDaysCheck } from './rules/min-trading-days-check'

const ALL: Rule[] = [
  maxRiskPerTradePct,
  maxDailyLossPct,
  maxOverallDailyLossHardStopPct,
  minRrRatio,
  positionSizeMatchesPlan,
  requireMssConfirmation,
  requireInvalidationText,
  requireHtfBiasLogged,
  noSlWidening,
  requireKillzone,
  requireDxyCheck,
  maxTradesPerDay,
  cooldownAfterLossMinutes,
  dailyStopAfterLosses,
  noRevengeTradeWindow,
  emotionalStateGate,
  weekendHoldingBlocked,
  minTradingDaysCheck,
]

const BY_KEY = new Map<string, Rule>(ALL.map((r) => [r.key, r]))

export function getRule(key: string): Rule | undefined {
  return BY_KEY.get(key)
}

export function listRules(): Rule[] {
  return [...ALL]
}

export function hasRule(key: string): boolean {
  return BY_KEY.has(key)
}
