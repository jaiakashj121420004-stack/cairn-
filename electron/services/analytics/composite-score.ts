/**
 * Composite performance score — a local, Zella-Score-style 0–100 rating that
 * sits alongside the Discipline Ring (roadmap §3, Wave 2 item 15).
 *
 * Five sub-scores, each 0–100, combined by fixed weights:
 *   - winRate      (share of trades that won)
 *   - profitFactor (gross winning R / gross losing R)
 *   - avgWinLoss   (average winning R / average losing R)
 *   - consistency  (how evenly profit is spread — not one lucky trade)
 *   - discipline   (clean-trade rate — "average quality")
 *
 * All money/R aggregation uses decimal.js — never floats (§2.5, §19.5). Every
 * sub-score is scale-invariant in R, so multiplying every trade's R by a
 * positive constant leaves the composite unchanged.
 */

import Decimal from 'decimal.js'

export interface CompositeTradeInput {
  pnlR: number | null // R × 100
  pnlCents: number | null // integer cents (reserved for future weighting; not yet used)
  isClean: number | null // 1 clean, 0 dirty, null = not rated
}

export interface CompositeScoreComponents {
  winRate: number // 0–100
  profitFactor: number // 0–100
  avgWinLoss: number // 0–100
  consistency: number // 0–100
  discipline: number // 0–100
}

export interface CompositeScore {
  score: number // 0–100 overall (integer)
  components: CompositeScoreComponents
  sampleSize: number
  sufficient: boolean // false when fewer than MIN_TRADES rated trades
}

const MIN_TRADES = 10

// Weights sum to 1.0. Edge metrics (PF + win/loss ratio) carry the most weight;
// discipline and consistency keep the score honest about *how* profit was made.
const WEIGHTS = {
  winRate: 0.15,
  profitFactor: 0.3,
  avgWinLoss: 0.2,
  consistency: 0.15,
  discipline: 0.2,
} as const

const ZERO_COMPONENTS: CompositeScoreComponents = {
  winRate: 0,
  profitFactor: 0,
  avgWinLoss: 0,
  consistency: 0,
  discipline: 0,
}

/** Maps a ratio metric (1.0 = breakeven) onto 0–100: ≤0 → 0, 1 → 50, ≥3 → 100. */
function ratioSubScore(ratio: Decimal): number {
  if (ratio.lte(0)) return 0
  if (ratio.lte(1)) return clamp0to100(ratio.times(50))
  if (ratio.gte(3)) return 100
  // 1 → 50, 3 → 100 (linear)
  return clamp0to100(new Decimal(50).plus(ratio.minus(1).div(2).times(50)))
}

function clamp0to100(d: Decimal): number {
  const n = d.toDecimalPlaces(0).toNumber()
  return Math.max(0, Math.min(100, n))
}

export function computeCompositeScore(trades: CompositeTradeInput[]): CompositeScore {
  const rated = trades.filter((t) => t.pnlR !== null)
  const sampleSize = rated.length

  if (sampleSize === 0) {
    return { score: 0, components: { ...ZERO_COMPONENTS }, sampleSize: 0, sufficient: false }
  }

  let wins = 0
  let losses = 0
  let grossWin = new Decimal(0)
  let grossLoss = new Decimal(0)
  let maxWin = new Decimal(0)
  for (const t of rated) {
    const r = new Decimal(t.pnlR ?? 0)
    if (r.gt(0)) {
      wins += 1
      grossWin = grossWin.plus(r)
      if (r.gt(maxWin)) maxWin = r
    } else if (r.lt(0)) {
      losses += 1
      grossLoss = grossLoss.plus(r.abs())
    }
  }

  // 1. Win rate (share of decisive trades that won; break-evens excluded).
  const decisive = wins + losses
  const winRateSub =
    decisive > 0 ? clamp0to100(new Decimal(wins).div(decisive).times(100)) : 0

  // 2. Profit factor: grossWin / grossLoss. No losses with wins → perfect.
  const profitFactorSub = grossLoss.isZero()
    ? grossWin.gt(0)
      ? 100
      : 0
    : ratioSubScore(grossWin.div(grossLoss))

  // 3. Average win / average loss ratio.
  const avgWin = wins > 0 ? grossWin.div(wins) : new Decimal(0)
  const avgLoss = losses > 0 ? grossLoss.div(losses) : new Decimal(0)
  const avgWinLossSub = avgLoss.isZero()
    ? avgWin.gt(0)
      ? 100
      : 0
    : ratioSubScore(avgWin.div(avgLoss))

  // 4. Consistency: how much of total winning R comes from the single best trade.
  //    All profit from one trade → 0; spread evenly across many → near 100.
  const consistencySub = grossWin.gt(0)
    ? clamp0to100(new Decimal(1).minus(maxWin.div(grossWin)).times(100))
    : 0

  // 5. Discipline: clean-trade rate over trades that carry a clean flag.
  const flagged = rated.filter((t) => t.isClean !== null)
  const cleanCount = flagged.filter((t) => t.isClean === 1).length
  const disciplineSub =
    flagged.length > 0 ? clamp0to100(new Decimal(cleanCount).div(flagged.length).times(100)) : 100

  const components: CompositeScoreComponents = {
    winRate: winRateSub,
    profitFactor: profitFactorSub,
    avgWinLoss: avgWinLossSub,
    consistency: consistencySub,
    discipline: disciplineSub,
  }

  const overall = new Decimal(components.winRate)
    .times(WEIGHTS.winRate)
    .plus(new Decimal(components.profitFactor).times(WEIGHTS.profitFactor))
    .plus(new Decimal(components.avgWinLoss).times(WEIGHTS.avgWinLoss))
    .plus(new Decimal(components.consistency).times(WEIGHTS.consistency))
    .plus(new Decimal(components.discipline).times(WEIGHTS.discipline))

  return {
    score: clamp0to100(overall),
    components,
    sampleSize,
    sufficient: sampleSize >= MIN_TRADES,
  }
}
