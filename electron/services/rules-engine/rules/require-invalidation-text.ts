import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({
  minChars: z.number().int().positive(),
})

function evaluate(ctx: RuleContext, configUnknown: unknown): RuleEvaluation {
  const parsed = configSchema.safeParse(configUnknown)
  if (!parsed.success) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: false,
      severity: 'warning',
      message: 'Rule misconfigured: require_invalidation_text',
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
  const text = draft.plannedInvalidation.trim()
  const passed = text.length >= parsed.data.minChars
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'blocking',
    message: passed
      ? 'Invalidation text provided'
      : `Invalidation text must be at least ${parsed.data.minChars} characters.`,
    canOverride: false,
    suggestedAction: passed ? undefined : 'Describe what would invalidate this setup.',
  }
}

export const rule: Rule = {
  key: 'require_invalidation_text',
  label: 'Require Invalidation Text',
  description: 'Blocks until the trader describes what invalidates the setup.',
  category: 'process',
  severity: 'blocking',
  defaultConfig: { minChars: 20 },
  configSchema,
  evaluate,
}
