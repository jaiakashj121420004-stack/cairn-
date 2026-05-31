// Grade types live in shared/types so both main-process and renderer share one definition.
export type { GradeLetter, TradeGrade } from '@shared/types/index'

/** Count broken rules from a trade's `rulesBroken` JSON string. */
export function countRulesBroken(rulesBrokenJson: string | null): number {
  if (!rulesBrokenJson) return 0
  try {
    const arr = JSON.parse(rulesBrokenJson) as unknown
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    return 0
  }
}
