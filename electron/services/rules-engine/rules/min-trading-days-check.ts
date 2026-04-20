import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({}).passthrough()

function evaluate(ctx: RuleContext, _configUnknown: unknown): RuleEvaluation {
  const required = ctx.account.minTradingDays
  if (required === null || required === undefined || required <= 0) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: true,
      severity: 'info',
      message: 'No minimum trading days requirement',
      canOverride: true,
    }
  }
  const done = ctx.tradingDaysCount ?? 0
  const passed = done >= required
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: 'info',
    message: passed
      ? `Minimum trading days met (${done}/${required})`
      : `Trading days progress: ${done}/${required}`,
    canOverride: true,
    contextSnapshot: { done, required },
  }
}

export const rule: Rule = {
  key: 'min_trading_days_check',
  label: 'Minimum Trading Days',
  description: 'Informational — tracks progress toward the firm’s minimum trading days.',
  category: 'timing',
  severity: 'logged',
  defaultConfig: {},
  configSchema,
  evaluate,
}
