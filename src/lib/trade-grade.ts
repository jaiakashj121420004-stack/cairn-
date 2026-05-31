/**
 * Per-trade quality grade (A–F) — Wave 2 item 16.
 *
 * Cairn grades the *decision*, not just the result. The score is
 * process-weighted (discipline-first, §1.2): following the plan and breaking no
 * rules together carry 65 of 100 points, planned reward quality 20, and the R
 * outcome only 15 — so a textbook trade that happened to lose still grades well,
 * and a rule-breaking win does not.
 *
 *   Plan followed exactly      +35
 *   Rules clean                +30  (−10 per rule broken, floored at 0)
 *   Planned RR  ≥ 2.0R         +20  (≥ 1.5R → +10)
 *   R outcome   > 0            +15  (break-even → +7)
 *
 * Letter bands: A ≥ 85 · B ≥ 70 · C ≥ 55 · D ≥ 40 · F < 40.
 * Only closed trades (with an R outcome) are graded; others return null.
 */

export type GradeLetter = 'A' | 'B' | 'C' | 'D' | 'F'

export interface TradeGrade {
  letter: GradeLetter
  score: number // 0–100
}

export interface TradeGradeInput {
  rrRatio: number // planned RR × 100
  followedPlanExactly: number | null // 1 / 0 / null
  rulesBrokenCount: number
  pnlR: number | null // R × 100
}

export function gradeTrade(input: TradeGradeInput): TradeGrade | null {
  if (input.pnlR === null) return null

  let score = 0
  if (input.followedPlanExactly === 1) score += 35
  score += Math.max(0, 30 - input.rulesBrokenCount * 10)
  if (input.rrRatio >= 200) score += 20
  else if (input.rrRatio >= 150) score += 10
  if (input.pnlR > 0) score += 15
  else if (input.pnlR === 0) score += 7

  return { letter: toLetter(score), score }
}

function toLetter(score: number): GradeLetter {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

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
