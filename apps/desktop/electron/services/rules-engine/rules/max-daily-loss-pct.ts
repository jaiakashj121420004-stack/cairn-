import { z } from 'zod'
import { sumClosedPnlCents } from '../helpers'
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
      message: 'Rule misconfigured: max_daily_loss_pct',
      canOverride: true,
    }
  }
  const maxBps = parsed.data.maxPct
  const realizedCents = sumClosedPnlCents(ctx.tradesToday)
  const lossCents = Math.max(0, -realizedCents)
  const draft = ctx.tradeInProgress
  const projectedLoss = lossCents + (draft ? draft.riskAmountCents : 0)
  const limitCents = Math.floor((ctx.account.accountSizeCents * maxBps) / 10_000)
  const passed = projectedLoss <= limitCents
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'blocking',
    message: passed
      ? 'Daily loss within limit'
      : `Daily loss limit breached (${projectedLoss}¢ projected > ${limitCents}¢ limit)`,
    canOverride: true,
    suggestedAction: passed ? undefined : 'Stop trading for today.',
    contextSnapshot: { realizedCents, projectedLoss, limitCents, maxBps },
  }
}

export const rule: Rule = {
  key: 'max_daily_loss_pct',
  label: 'Max Daily Loss %',
  description: 'Session locks when cumulative losses today exceed the configured percentage.',
  category: 'risk',
  severity: 'blocking',
  defaultConfig: { maxPct: 200 },
  configSchema,
  evaluate,
}
