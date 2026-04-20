import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'
import { isWeekendUtc } from '../helpers'

const configSchema = z.object({
  fridayCloseUtcHour: z.number().int().min(0).max(23).optional(),
})

function evaluate(ctx: RuleContext, configUnknown: unknown): RuleEvaluation {
  const parsed = configSchema.safeParse(configUnknown)
  if (!parsed.success) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: false,
      severity: 'warning',
      message: 'Rule misconfigured: weekend_holding_blocked',
      canOverride: false,
    }
  }
  if (ctx.account.weekendHoldingAllowed === 1) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: true,
      severity: 'info',
      message: 'Weekend holding allowed by firm',
      canOverride: true,
    }
  }
  const draft = ctx.tradeInProgress
  const ts = draft?.timestamp ?? ctx.now
  const date = new Date(ts)
  const day = date.getUTCDay()
  const hour = date.getUTCHours()
  const cutoffHour = parsed.data.fridayCloseUtcHour ?? 20
  const tooLateFriday = day === 5 && hour >= cutoffHour
  const weekend = isWeekendUtc(ts)
  const passed = !tooLateFriday && !weekend
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'blocking',
    message: passed
      ? 'Outside weekend-holding window'
      : 'Firm does not allow weekend holding. Entry would risk spanning the close.',
    canOverride: false,
    suggestedAction: passed ? undefined : 'Wait until Sunday/Monday open.',
    contextSnapshot: { day, hour },
  }
}

export const rule: Rule = {
  key: 'weekend_holding_blocked',
  label: 'Weekend Holding Blocked',
  description: 'Blocks entries that would hold into a weekend when the firm disallows it.',
  category: 'timing',
  severity: 'blocking',
  defaultConfig: { fridayCloseUtcHour: 20 },
  configSchema,
  evaluate,
}
