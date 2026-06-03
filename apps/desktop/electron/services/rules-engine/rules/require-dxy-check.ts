import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({}).passthrough()

function evaluate(ctx: RuleContext, _configUnknown: unknown): RuleEvaluation {
  const session = ctx.currentSession
  const passed = !!session && !!session.dxyBias
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'warning',
    message: passed ? 'DXY bias logged' : 'DXY bias not logged for today.',
    canOverride: true,
    suggestedAction: passed ? undefined : 'Log DXY bias in the session.',
  }
}

export const rule: Rule = {
  key: 'require_dxy_check',
  label: 'Require DXY Check',
  description: 'Warns when DXY bias has not been logged in the current session.',
  category: 'process',
  severity: 'warning',
  defaultConfig: {},
  configSchema,
  evaluate,
}
