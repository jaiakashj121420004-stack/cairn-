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
      message: 'Rule misconfigured: hard stop',
      canOverride: false,
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
      ? 'Hard stop not reached'
      : 'Hard daily loss reached. Session locked. No override available.',
    canOverride: false,
    contextSnapshot: { projectedLoss, limitCents, maxBps },
  }
}

export const rule: Rule = {
  key: 'max_overall_daily_loss_hard_stop_pct',
  label: 'Hard Daily Drawdown Stop',
  description:
    'Non-overrideable hard session lock when daily loss exceeds the configured percentage.',
  category: 'risk',
  severity: 'blocking',
  defaultConfig: { maxPct: 300 },
  configSchema,
  isHardLock: true,
  evaluate,
}
