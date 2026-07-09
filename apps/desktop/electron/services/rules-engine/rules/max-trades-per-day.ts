import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({
  maxTrades: z.number().int().positive(),
})

function evaluate(ctx: RuleContext, configUnknown: unknown): RuleEvaluation {
  const parsed = configSchema.safeParse(configUnknown)
  if (!parsed.success) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: false,
      severity: 'warning',
      message: 'Rule misconfigured: max_trades_per_day',
      canOverride: true,
    }
  }
  // Only placed trades count against the cap. Cancelled trades never happened;
  // planned drafts are plans, not placed trades (the context builder already
  // excludes them — this filter is defence-in-depth for direct callers).
  const placed = ctx.tradesToday.filter(
    (t) => t.status !== 'cancelled' && t.status !== 'planned',
  ).length
  const projected = placed + (ctx.tradeInProgress ? 1 : 0)
  const passed = projected <= parsed.data.maxTrades
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'blocking',
    message: passed
      ? `Trades today ${projected}/${parsed.data.maxTrades}`
      : `Max trades per day reached (${parsed.data.maxTrades}).`,
    canOverride: true,
    suggestedAction: passed ? undefined : 'Stop trading for today.',
    contextSnapshot: { taken: placed, max: parsed.data.maxTrades },
  }
}

export const rule: Rule = {
  key: 'max_trades_per_day',
  label: 'Max Trades per Day',
  description: 'Hard cap on the number of trades in a single day.',
  category: 'behavior',
  severity: 'blocking',
  defaultConfig: { maxTrades: 2 },
  configSchema,
  evaluate,
}
