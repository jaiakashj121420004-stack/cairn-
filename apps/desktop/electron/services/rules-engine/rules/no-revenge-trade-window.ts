import { z } from 'zod'
import { mostRecentLoss, minutesSince } from '../helpers'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({
  minutes: z.number().int().positive(),
})

function evaluate(ctx: RuleContext, configUnknown: unknown): RuleEvaluation {
  const parsed = configSchema.safeParse(configUnknown)
  if (!parsed.success) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: false,
      severity: 'warning',
      message: 'Rule misconfigured: no_revenge_trade_window',
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
  const lastLoss = mostRecentLoss(ctx.tradesToday)
  if (!lastLoss) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: true,
      severity: 'info',
      message: 'No recent loss',
      canOverride: true,
    }
  }
  if (lastLoss.pairId !== draft.pairId) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: true,
      severity: 'info',
      message: 'Different pair than last loss',
      canOverride: true,
    }
  }
  const elapsed = minutesSince(lastLoss.exitTime ?? lastLoss.updatedAt, ctx.now)
  const passed = elapsed >= parsed.data.minutes
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'blocking',
    message: passed
      ? 'Revenge-trade window cleared'
      : `Revenge-trade window active: ${parsed.data.minutes - elapsed} min remaining on ${draft.pairId}.`,
    canOverride: true,
    suggestedAction: passed ? undefined : 'Trade a different pair or wait out the window.',
    contextSnapshot: { elapsed, threshold: parsed.data.minutes },
  }
}

export const rule: Rule = {
  key: 'no_revenge_trade_window',
  label: 'No Revenge-Trade Window',
  description: 'Blocks a trade on the same pair within N minutes of a loss.',
  category: 'behavior',
  severity: 'blocking',
  defaultConfig: { minutes: 30 },
  configSchema,
  evaluate,
}
