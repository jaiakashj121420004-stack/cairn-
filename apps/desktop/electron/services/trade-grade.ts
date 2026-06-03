import type { GradeLetter, TradeGrade } from '../../shared/types/index'

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

export interface TradeGradeInput {
  followedPlanExactly: number | null // 1 = yes, 0 = no, null = not recorded
  rulesBrokenCount: number
  pnlR: number | null // R outcome × 100; null means trade not yet closed
  rrRatio: number // planned R × 100
  preUrgencyScore: number // 1–10; ≥ 8 means Tilted at entry
}

/**
 * Compute the A–F quality grade for a closed trade.
 *
 * Grades the *decision*, not just the result (discipline-first, §1.2).
 * Returns null for unclosed trades.
 *
 * Formula:
 *   baseline              = 60
 *   + 20  if plan followed AND zero rules broken
 *   + 15  if R outcome ≥ planned R
 *   −  5  per rule broken (unbounded below, can go negative)
 *   +  5  clean-on-tilt bonus: preUrgencyScore ≥ 8 AND zero rules broken
 *
 * A disciplined loss (plan followed, clean) grades B; a rule-breaking win
 * that happened to exceed the planned R still loses the plan+clean bonus.
 */
export function computeTradeGrade(input: TradeGradeInput): TradeGrade | null {
  if (input.pnlR === null) return null

  const broken = input.rulesBrokenCount
  let score = 60
  if (input.followedPlanExactly === 1 && broken === 0) score += 20
  if (input.pnlR >= input.rrRatio) score += 15
  score -= broken * 5
  if (input.preUrgencyScore >= 8 && broken === 0) score += 5

  return { letter: toLetter(score), score }
}

function toLetter(score: number): GradeLetter {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 45) return 'D'
  return 'F'
}
