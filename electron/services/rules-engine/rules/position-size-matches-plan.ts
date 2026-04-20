import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({
  tolerancePct: z.number().int().nonnegative(),
})

function evaluate(ctx: RuleContext, configUnknown: unknown): RuleEvaluation {
  const parsed = configSchema.safeParse(configUnknown)
  if (!parsed.success) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: false,
      severity: 'warning',
      message: 'Rule misconfigured: position_size_matches_plan',
      canOverride: true,
    }
  }
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
  const planned = draft.plannedLotSize
  if (planned === undefined || planned === 0) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: true,
      severity: 'info',
      message: 'No planned lot size to compare',
      canOverride: true,
    }
  }
  const tolerance = parsed.data.tolerancePct
  const delta = Math.abs(draft.lotSize - planned)
  const allowed = Math.ceil((planned * tolerance) / 100)
  const passed = delta <= allowed
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'warning',
    message: passed
      ? 'Actual lot matches plan'
      : `Actual lot ${(draft.lotSize / 100).toFixed(2)} differs from plan ${(planned / 100).toFixed(2)} by more than ${tolerance}%`,
    canOverride: true,
    contextSnapshot: { actual: draft.lotSize, planned, tolerancePct: tolerance },
  }
}

export const rule: Rule = {
  key: 'position_size_matches_plan',
  label: 'Position Size Matches Plan',
  description: 'Warns when the actual lot size deviates from the planned size beyond tolerance.',
  category: 'risk',
  severity: 'warning',
  defaultConfig: { tolerancePct: 5 },
  configSchema,
  evaluate,
}
