import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({
  maxPct: z.number().int().positive(),
})

function evaluate(ctx: RuleContext, configUnknown: unknown): RuleEvaluation {
  const parsed = configSchema.safeParse(configUnknown)
  if (!parsed.success) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: false,
      severity: 'warning',
      message: 'Rule misconfigured: max_risk_per_trade_pct',
      canOverride: true,
    }
  }
  const maxBps = parsed.data.maxPct
  const draft = ctx.tradeInProgress
  if (!draft) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: true,
      severity: 'info',
      message: 'No pending trade',
      canOverride: true,
    }
  }
  const passed = draft.riskPctBps <= maxBps
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'blocking',
    message: passed
      ? `Risk within limit (${(draft.riskPctBps / 100).toFixed(2)}% ≤ ${(maxBps / 100).toFixed(2)}%)`
      : `Risk ${(draft.riskPctBps / 100).toFixed(2)}% exceeds limit ${(maxBps / 100).toFixed(2)}%`,
    canOverride: true,
    suggestedAction: passed ? undefined : 'Reduce lot size or widen stop loss.',
    contextSnapshot: { riskPctBps: draft.riskPctBps, maxBps },
  }
}

export const rule: Rule = {
  key: 'max_risk_per_trade_pct',
  label: 'Max Risk per Trade',
  description: 'Blocks a trade whose risk exceeds a configurable percentage of the account.',
  category: 'risk',
  severity: 'blocking',
  defaultConfig: { maxPct: 100 },
  configSchema,
  evaluate,
}
