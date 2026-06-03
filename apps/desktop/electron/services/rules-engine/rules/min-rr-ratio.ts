import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({
  minRR: z.number().int().positive(),
})

function evaluate(ctx: RuleContext, configUnknown: unknown): RuleEvaluation {
  const parsed = configSchema.safeParse(configUnknown)
  if (!parsed.success) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: false,
      severity: 'warning',
      message: 'Rule misconfigured: min_rr_ratio',
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
  const minRR = parsed.data.minRR
  const passed = draft.rrRatio >= minRR
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'blocking',
    message: passed
      ? `RR ${(draft.rrRatio / 100).toFixed(2)} meets minimum`
      : `RR ${(draft.rrRatio / 100).toFixed(2)} below minimum ${(minRR / 100).toFixed(2)}`,
    canOverride: true,
    suggestedAction: passed ? undefined : 'Move TP further or tighten SL.',
    contextSnapshot: { rrRatio: draft.rrRatio, minRR },
  }
}

export const rule: Rule = {
  key: 'min_rr_ratio',
  label: 'Minimum R:R',
  description: 'Blocks a trade whose reward-to-risk ratio is below the configured minimum.',
  category: 'risk',
  severity: 'blocking',
  defaultConfig: { minRR: 200 },
  configSchema,
  evaluate,
}
