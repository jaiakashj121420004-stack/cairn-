import { z } from 'zod'
import { sumClosedPnlCents } from '../helpers'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({
  maxLossCents: z.number().int().positive(),
})

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function evaluate(ctx: RuleContext, configUnknown: unknown): RuleEvaluation {
  const parsed = configSchema.safeParse(configUnknown)
  if (!parsed.success) {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: false,
      severity: 'warning',
      message: 'Rule misconfigured: max_daily_loss_fixed',
      canOverride: true,
    }
  }
  const { maxLossCents } = parsed.data
  const realizedCents = sumClosedPnlCents(ctx.tradesToday)
  const lossCents = Math.max(0, -realizedCents)
  const draft = ctx.tradeInProgress
  const projectedLoss = lossCents + (draft ? draft.riskAmountCents : 0)
  const passed = projectedLoss <= maxLossCents
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'blocking',
    message: passed
      ? `Daily loss within fixed limit (${fmt(maxLossCents)})`
      : `Daily loss limit breached (${fmt(projectedLoss)} projected > ${fmt(maxLossCents)} limit)`,
    canOverride: true,
    suggestedAction: passed ? undefined : 'Stop trading for today.',
    contextSnapshot: { realizedCents, projectedLoss, maxLossCents },
  }
}

export const rule: Rule = {
  key: 'max_daily_loss_fixed',
  label: 'Max Daily Loss ($)',
  description:
    'Blocks new trades when cumulative realized losses today exceed a fixed dollar amount.',
  category: 'risk',
  severity: 'blocking',
  isHardLock: false,
  defaultConfig: { maxLossCents: 50000 },
  configSchema,
  evaluate,
}
