import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'
import { computeConsecutiveLosses } from '../helpers'

const configSchema = z.object({
  consecutiveLosses: z.number().int().positive(),
})

function evaluate(ctx: RuleContext, configUnknown: unknown): RuleEvaluation {
  const parsed = configSchema.safeParse(configUnknown)
  if (!parsed.success) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: false,
      severity: 'warning',
      message: 'Rule misconfigured: daily_stop_after_losses',
      canOverride: false,
    }
  }
  const streak = computeConsecutiveLosses(ctx.tradesToday)
  const passed = streak < parsed.data.consecutiveLosses
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'blocking',
    message: passed
      ? `Loss streak ${streak}/${parsed.data.consecutiveLosses}`
      : `Daily stop triggered after ${streak} consecutive losses. Session locked.`,
    canOverride: false,
    contextSnapshot: { streak, max: parsed.data.consecutiveLosses },
  }
}

export const rule: Rule = {
  key: 'daily_stop_after_losses',
  label: 'Daily Stop After Consecutive Losses',
  description: 'Auto-locks the session after the configured number of consecutive losses.',
  category: 'behavior',
  severity: 'blocking',
  defaultConfig: { consecutiveLosses: 2 },
  configSchema,
  isHardLock: true,
  evaluate,
}
