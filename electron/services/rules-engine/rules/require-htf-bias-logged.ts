import { z } from 'zod'
import type { Rule, RuleContext, RuleEvaluation } from '../types'

const configSchema = z.object({}).passthrough()

function evaluate(ctx: RuleContext, _configUnknown: unknown): RuleEvaluation {
  const session = ctx.currentSession
  const passed = session !== null && !!session.dailyBias && !!session.h4Bias && !!session.h1Bias
  return {
    ruleKey: rule.key,
    ruleLabel: rule.label,
    passed,
    severity: passed ? 'info' : 'blocking',
    message: passed
      ? 'HTF bias logged for today'
      : 'Daily / H4 / H1 bias must be logged before trading.',
    canOverride: false,
    suggestedAction: passed ? undefined : 'Log the session bias first.',
  }
}

export const rule: Rule = {
  key: 'require_htf_bias_logged',
  label: 'Require HTF Bias Logged',
  description: 'Blocks all trades until the daily/H4/H1 bias has been logged in a session.',
  category: 'process',
  severity: 'blocking',
  defaultConfig: {},
  configSchema,
  evaluate,
}
