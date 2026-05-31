import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({}).passthrough()

/**
 * Real-time hook (modification gate): blocks moving the take-profit *toward* the
 * entry — i.e. narrowing the reward — once a trade is live. Mirror of
 * no_sl_widening on the TP side.
 *
 *   Long  (entry < TP): narrowing means TP decreases → newValue < currentValue.
 *   Short (entry > TP): narrowing means TP increases → newValue > currentValue.
 *
 * Tightening the TP outward (more reward) is always allowed.
 */
function evaluate(ctx: RuleContext, _configUnknown: unknown): RuleEvaluation {
  const mod = ctx.tradeModification
  const target = ctx.tradeUnderModification
  if (!mod || !target || mod.field !== 'take_profit_price') {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: true,
      severity: 'info',
      message: 'No TP modification in progress',
      canOverride: true,
    }
  }
  const narrowing =
    target.direction === 'long'
      ? mod.newValue < mod.currentValue
      : mod.newValue > mod.currentValue
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed: !narrowing,
    severity: narrowing ? 'blocking' : 'info',
    message: narrowing
      ? 'Moving take profit toward entry (cutting the target) is not allowed.'
      : 'TP modification extends the target, not narrows it.',
    canOverride: true,
    suggestedAction: narrowing ? 'Keep the original TP or take a partial.' : undefined,
    contextSnapshot: {
      field: 'take_profit_price',
      current: mod.currentValue,
      proposed: mod.newValue,
      dir: target.direction,
    },
  }
}

export const rule: Rule = {
  key: 'no_tp_narrowing',
  label: 'No TP Narrowing',
  description: 'Blocks moving take profit toward entry (cutting the reward) mid-trade.',
  category: 'process',
  severity: 'blocking',
  defaultConfig: {},
  configSchema,
  evaluate,
}
