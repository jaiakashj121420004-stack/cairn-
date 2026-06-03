import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({
  maxUrgency: z.number().int().min(1).max(10),
  maxNeed: z.number().int().min(1).max(10),
})

function evaluate(ctx: RuleContext, configUnknown: unknown): RuleEvaluation {
  const parsed = configSchema.safeParse(configUnknown)
  if (!parsed.success) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: false,
      severity: 'warning',
      message: 'Rule misconfigured: emotional_state_gate',
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
  const urgencyBad = draft.preUrgencyScore > parsed.data.maxUrgency
  const needBad = draft.preNeedScore > parsed.data.maxNeed
  const passed = !urgencyBad && !needBad
  const reasons: string[] = []
  if (urgencyBad) reasons.push(`urgency ${draft.preUrgencyScore}/10`)
  if (needBad) reasons.push(`need ${draft.preNeedScore}/10`)
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'warning',
    message: passed
      ? 'Emotional state within limits'
      : `Elevated emotional state: ${reasons.join(', ')}.`,
    canOverride: true,
    suggestedAction: passed ? undefined : 'Step away for a few minutes before confirming.',
    contextSnapshot: {
      urgency: draft.preUrgencyScore,
      need: draft.preNeedScore,
      maxUrgency: parsed.data.maxUrgency,
      maxNeed: parsed.data.maxNeed,
    },
  }
}

export const rule: Rule = {
  key: 'emotional_state_gate',
  label: 'Emotional State Gate',
  description: 'Warns when pre-trade urgency or need scores exceed configured thresholds.',
  category: 'behavior',
  severity: 'warning',
  defaultConfig: { maxUrgency: 7, maxNeed: 6 },
  configSchema,
  evaluate,
}
