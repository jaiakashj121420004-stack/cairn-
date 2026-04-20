import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({}).passthrough()

function evaluate(ctx: RuleContext, _configUnknown: unknown): RuleEvaluation {
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
  const passed = draft.mssConfirmed === 1
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'blocking',
    message: passed
      ? 'MSS confirmed'
      : 'Market Structure Shift not confirmed. Confirm MSS before entry.',
    canOverride: true,
    suggestedAction: passed ? undefined : 'Wait for MSS on the entry timeframe.',
  }
}

export const rule: Rule = {
  key: 'require_mss_confirmation',
  label: 'Require MSS Confirmation',
  description: 'Blocks entry unless MSS (market structure shift) is confirmed.',
  category: 'process',
  severity: 'blocking',
  defaultConfig: {},
  configSchema,
  evaluate,
}
