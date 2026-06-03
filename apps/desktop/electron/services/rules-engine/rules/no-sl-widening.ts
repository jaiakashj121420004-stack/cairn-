import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({}).passthrough()

function evaluate(ctx: RuleContext, _configUnknown: unknown): RuleEvaluation {
  const mod = ctx.tradeModification
  const target = ctx.tradeUnderModification
  if (!mod || !target || mod.field !== 'stop_loss_price') {
    return {
      ruleKey: rule.key,
      ruleLabel: rule.label,
      passed: true,
      severity: 'info',
      message: 'No SL modification in progress',
      canOverride: true,
    }
  }
  // Long: a lower SL means "widening" against entry. Short: a higher SL means widening.
  const widening =
    target.direction === 'long' ? mod.newValue < mod.currentValue : mod.newValue > mod.currentValue
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed: !widening,
    severity: widening ? 'blocking' : 'info',
    message: widening
      ? 'Moving stop loss against position is not allowed.'
      : 'SL modification is a tighten, not a widen.',
    canOverride: true,
    suggestedAction: widening ? 'Keep the original SL or exit the trade.' : undefined,
    contextSnapshot: {
      field: 'stop_loss_price',
      current: mod.currentValue,
      proposed: mod.newValue,
      dir: target.direction,
    },
  }
}

export const rule: Rule = {
  key: 'no_sl_widening',
  label: 'No SL Widening',
  description: 'Blocks moving stop loss against the position.',
  category: 'process',
  severity: 'blocking',
  defaultConfig: {},
  configSchema,
  evaluate,
}
