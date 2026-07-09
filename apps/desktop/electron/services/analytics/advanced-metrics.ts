/**
 * Advanced performance metrics — Sharpe, Sortino, max drawdown, recovery
 * factor, Kelly %, SQN, day consistency, and win/loss extremes & shape.
 *
 * Pure functions over a pre-fetched trade list, mirroring derived.ts /
 * composite-score.ts: callers pass rows with status='closed' and
 * deletedAt=null already filtered. All money/ratio arithmetic uses
 * decimal.js exclusively (§2.5, §19.5); plain `number` is used only for
 * integer accumulators (trade counts) and at the final DTO boundary.
 *
 * Every metric follows the same { value, sufficient } contract (see
 * MetricResult<T> in shared/types/index.ts):
 *   - `sufficient` gates on the metric's minimum sample size, stated per
 *     metric below. It is false only when the sample itself is too small.
 *   - `value` is null whenever `sufficient` is false, AND may independently
 *     be null when the sample is large enough but the ratio is
 *     mathematically undefined for a structural reason (e.g. zero variance,
 *     zero losses, zero drawdown). Both cases render identically in the UI
 *     ("—" + an explanatory tooltip) — see src/lib/advanced-metrics-display.ts.
 *
 * Day-level metrics (Sharpe, Sortino, day consistency) bucket by trading day
 * using services/time/trading-day.ts — the same canonical day definition
 * used by getDailyHeatmap, the daily-trade-limit rule and the max-daily-loss
 * circuit breaker, all resolved in the user's configured timezone (not UTC).
 */

import Decimal from 'decimal.js'
import { tradingDayKey } from '../time/trading-day'
import type {
  AdvancedMetrics,
  DrawdownMetric,
  ExtremeTrade,
  MetricResult,
} from '../../../shared/types/index'

// ─── Input type ───────────────────────────────────────────────────────────────

export interface AdvancedMetricsTradeInput {
  pnlCents: number | null // integer cents
  pnlR: number | null // R × 100 (integer-encoded)
  exitTime: number | null // UTC ms timestamp
  // Precomputed entry->exit minutes (electron/services/pnl-calculator.ts
  // calculateDurationMinutes, stored as trades.duration_minutes). Reused
  // rather than re-derived from actual_entry_time/exit_time here so there
  // remains exactly one place that defines "how long was this trade open"
  // (§19.5 — one canonical column; derive the rest from it, don't compute
  // the same elapsed time a second way in a second module).
  durationMinutes: number | null
}

const MIN_TRADING_DAYS = 10
const MIN_TRADES_SQN = 10
const MIN_TRADES_STDDEV = 2

// ─── Shared helpers ───────────────────────────────────────────────────────────

function populationMean(values: Decimal[]): Decimal {
  if (values.length === 0) return new Decimal(0)
  const sum = values.reduce((acc, v) => acc.plus(v), new Decimal(0))
  return sum.div(values.length)
}

/** Population standard deviation (divide by N, not N-1) — the convention
 * used consistently across every stddev in this module. */
function populationStdDev(values: Decimal[], mean: Decimal): Decimal {
  if (values.length === 0) return new Decimal(0)
  const sumSquaredDiff = values.reduce((acc, v) => acc.plus(v.minus(mean).pow(2)), new Decimal(0))
  return sumSquaredDiff.div(values.length).sqrt()
}

/** Rounds to an integer at the module's default precision — the DTO
 * boundary. No explicit rounding mode, matching derived.ts/composite-score.ts. */
function toInt(d: Decimal): number {
  return d.toDecimalPlaces(0).toNumber()
}

function clampBps(n: number): number {
  return Math.max(-10_000, Math.min(10_000, n))
}

function nonNullR(rows: AdvancedMetricsTradeInput[]): Decimal[] {
  return rows
    .map((r) => r.pnlR)
    .filter((v): v is number => v !== null)
    .map((v) => new Decimal(v))
}

/**
 * Sums closed trades' pnlCents into per-trading-day buckets. Rows with a
 * null exitTime (should not occur for closed trades, but defended against
 * bad data) are skipped so they cannot create a phantom day — identical
 * convention to getDailyHeatmap in performance.ts.
 */
function bucketByTradingDay(
  rows: AdvancedMetricsTradeInput[],
  timeZone: string,
): Map<string, Decimal> {
  const byDay = new Map<string, Decimal>()
  for (const r of rows) {
    if (r.exitTime == null) continue
    const key = tradingDayKey(r.exitTime, timeZone)
    const cur = byDay.get(key) ?? new Decimal(0)
    byDay.set(key, cur.plus(r.pnlCents ?? 0))
  }
  return byDay
}

// ─── 1. Sharpe ratio (daily) ──────────────────────────────────────────────────

/**
 * Annualized Sharpe ratio from daily returns, risk-free rate 0.
 * Sharpe = mean(dailyReturns) / stdDev(dailyReturns) × sqrt(252).
 *
 * FIXED-BASE APPROXIMATION: each day's return is that day's realized P&L
 * divided by the account's *starting* balance, not that day's opening
 * equity. A textbook daily return would re-base on equity at the start of
 * each day; using one fixed denominator instead is a deliberate
 * simplification, consistent with how this app already expresses drawdown
 * as a % of the account's initial/starting balance everywhere else. It
 * under-states returns once equity has grown a lot and over-states them
 * once it has shrunk a lot — a fair directional read of risk-adjusted edge,
 * not an institutional-grade Sharpe number.
 */
export function getSharpeRatio(
  rows: AdvancedMetricsTradeInput[],
  startingBalanceCents: number,
  timeZone: string,
): MetricResult<number> {
  if (startingBalanceCents <= 0) return { value: null, sufficient: false }

  const byDay = bucketByTradingDay(rows, timeZone)
  if (byDay.size < MIN_TRADING_DAYS) return { value: null, sufficient: false }

  const dailyReturns = Array.from(byDay.values()).map((cents) => cents.div(startingBalanceCents))
  const mean = populationMean(dailyReturns)
  const stdDev = populationStdDev(dailyReturns, mean)
  if (stdDev.isZero()) return { value: null, sufficient: true }

  const sharpe = mean.div(stdDev).times(new Decimal(252).sqrt())
  return { value: toInt(sharpe.times(100)), sufficient: true }
}

// ─── 2. Sortino ratio (daily) ─────────────────────────────────────────────────

/**
 * Same daily-return series as Sharpe (same fixed-base approximation — see
 * getSharpeRatio), but the denominator is downside deviation: the
 * population standard deviation of the negative-day returns only, measured
 * against a 0 target (each negative return's deviation is itself, not its
 * distance from the negative-subset's own mean).
 */
export function getSortinoRatio(
  rows: AdvancedMetricsTradeInput[],
  startingBalanceCents: number,
  timeZone: string,
): MetricResult<number> {
  if (startingBalanceCents <= 0) return { value: null, sufficient: false }

  const byDay = bucketByTradingDay(rows, timeZone)
  if (byDay.size < MIN_TRADING_DAYS) return { value: null, sufficient: false }

  const dailyReturns = Array.from(byDay.values()).map((cents) => cents.div(startingBalanceCents))
  const mean = populationMean(dailyReturns)

  const negativeReturns = dailyReturns.filter((r) => r.lt(0))
  if (negativeReturns.length === 0) return { value: null, sufficient: true }

  const downsideVariance = negativeReturns
    .reduce((acc, r) => acc.plus(r.pow(2)), new Decimal(0))
    .div(negativeReturns.length)
  const downsideDeviation = downsideVariance.sqrt()
  if (downsideDeviation.isZero()) return { value: null, sufficient: true }

  const sortino = mean.div(downsideDeviation).times(new Decimal(252).sqrt())
  return { value: toInt(sortino.times(100)), sufficient: true }
}

// ─── 3. Max drawdown ──────────────────────────────────────────────────────────

/**
 * Walks cumulative realized P&L over closed trades ordered by exit time and
 * finds the largest peak-to-trough decline. The running peak includes the
 * implicit "before any trade" point (cumulative 0), so a losing streak
 * starting with the very first trade still registers a drawdown.
 * Non-negative by construction: the running peak at index j is, by
 * definition, >= the cumulative value at j, so peak-minus-cumulative can
 * never go below 0.
 *
 * `pctOfPeakBps` expresses the drawdown against the equity curve
 * (startingBalanceCents + peak-at-the-time-of-the-worst-drawdown), not
 * against the raw cents figure — a $500 drawdown means something different
 * on a $5,000 account than a $50,000 one. `durationDays` is elapsed
 * wall-clock time between the peak and trough exit timestamps (like
 * pnl-calculator's calculateDurationMinutes, not a calendar-day count), so
 * it is not timezone-sensitive.
 */
export function getMaxDrawdown(
  rows: AdvancedMetricsTradeInput[],
  startingBalanceCents: number,
): MetricResult<DrawdownMetric> {
  const closed = rows
    .filter((r) => r.exitTime != null)
    .sort((a, b) => (a.exitTime ?? 0) - (b.exitTime ?? 0))

  if (closed.length === 0) return { value: null, sufficient: false }

  let cumCents = new Decimal(0)
  let peakCents = new Decimal(0)
  let peakTime = closed[0]?.exitTime ?? 0

  let maxDdCents = new Decimal(0)
  let maxDdBase = new Decimal(startingBalanceCents)
  let maxDdPeakTime = peakTime
  let maxDdTroughTime = peakTime

  for (const row of closed) {
    cumCents = cumCents.plus(row.pnlCents ?? 0)
    const exitTime = row.exitTime ?? peakTime

    if (cumCents.gt(peakCents)) {
      peakCents = cumCents
      peakTime = exitTime
    }

    const dd = peakCents.minus(cumCents)
    if (dd.gt(maxDdCents)) {
      maxDdCents = dd
      maxDdBase = new Decimal(startingBalanceCents).plus(peakCents)
      maxDdPeakTime = peakTime
      maxDdTroughTime = exitTime
    }
  }

  const pctOfPeakBps = maxDdBase.gt(0) ? toInt(maxDdCents.times(10_000).div(maxDdBase)) : 0
  const durationDays = Math.max(0, Math.round((maxDdTroughTime - maxDdPeakTime) / 86_400_000))

  return {
    value: {
      peakToTroughCents: toInt(maxDdCents),
      pctOfPeakBps: Math.max(0, pctOfPeakBps),
      durationDays,
    },
    sufficient: true,
  }
}

// ─── 4. Recovery factor ───────────────────────────────────────────────────────

/**
 * Net profit / max drawdown. Takes the already-computed drawdown so the
 * O(n) cumulative walk in getMaxDrawdown runs only once per aggregation
 * (see computeAdvancedMetrics). Net profit sums every row's pnlCents
 * regardless of exitTime — unlike the drawdown walk, this sum needs no
 * temporal order, so a hypothetical legacy row missing its exit time still
 * counts toward realized P&L.
 */
export function getRecoveryFactor(
  rows: AdvancedMetricsTradeInput[],
  maxDrawdown: MetricResult<DrawdownMetric>,
): MetricResult<number> {
  if (!maxDrawdown.sufficient || maxDrawdown.value === null) {
    return { value: null, sufficient: false }
  }
  if (maxDrawdown.value.peakToTroughCents === 0) {
    return { value: null, sufficient: true }
  }

  const netProfitCents = rows.reduce((acc, r) => acc.plus(r.pnlCents ?? 0), new Decimal(0))
  const factor = netProfitCents.div(maxDrawdown.value.peakToTroughCents)
  return { value: toInt(factor.times(100)), sufficient: true }
}

// ─── 5. Kelly % ────────────────────────────────────────────────────────────────

/**
 * Kelly % = winRate − (1 − winRate) / payoffRatio, payoffRatio =
 * avgWinCents / avgLossCents. Break-even trades (pnlCents === 0) are
 * excluded from both the win/loss counts and the decisive-trade
 * denominator, matching composite-score's winRate convention. The result is
 * clamped to [-100%, 100%] (bps [-10000, 10000]) — Kelly is a sizing guide,
 * not a value that should ever be displayed outside that range.
 */
export function getKellyPct(rows: AdvancedMetricsTradeInput[]): MetricResult<number> {
  let winCount = 0
  let lossCount = 0
  let grossWinCents = new Decimal(0)
  let grossLossAbsCents = new Decimal(0)

  for (const r of rows) {
    if (r.pnlCents == null || r.pnlCents === 0) continue
    if (r.pnlCents > 0) {
      winCount += 1
      grossWinCents = grossWinCents.plus(r.pnlCents)
    } else {
      lossCount += 1
      grossLossAbsCents = grossLossAbsCents.plus(-r.pnlCents)
    }
  }

  if (winCount === 0 || lossCount === 0) return { value: null, sufficient: false }

  const decisive = winCount + lossCount
  const winRate = new Decimal(winCount).div(decisive)
  const avgWin = grossWinCents.div(winCount)
  const avgLoss = grossLossAbsCents.div(lossCount) // > 0: every summed loss has cents < 0
  const payoffRatio = avgWin.div(avgLoss)

  const kelly = winRate.minus(new Decimal(1).minus(winRate).div(payoffRatio))
  return { value: clampBps(toInt(kelly.times(10_000))), sufficient: true }
}

// ─── 6. SQN (System Quality Number) ──────────────────────────────────────────

/**
 * SQN = sqrt(n) × mean(R) / stdDev(R), population stddev, over closed
 * trades' pnlR. Null under 10 trades or when R has zero variance (e.g.
 * every trade landed at the exact same R — no spread to normalize by).
 */
export function getSqn(rows: AdvancedMetricsTradeInput[]): MetricResult<number> {
  const rValues = nonNullR(rows)
  if (rValues.length < MIN_TRADES_SQN) return { value: null, sufficient: false }

  const mean = populationMean(rValues)
  const stdDev = populationStdDev(rValues, mean)
  if (stdDev.isZero()) return { value: null, sufficient: true }

  const sqn = new Decimal(rValues.length).sqrt().times(mean).div(stdDev)
  return { value: toInt(sqn.times(100)), sufficient: true }
}

// ─── 7. Day consistency % ─────────────────────────────────────────────────────

/**
 * The prop-firm consistency measure: 1 − (largest single profitable day /
 * gross profit). Bucketed by trading day like Sharpe/Sortino. Closer to
 * 100% means profit is spread across many days; closer to 0% means one day
 * carries most of the profit. Null when there is no gross profit to measure
 * against (grossProfit <= 0).
 */
export function getDayConsistency(
  rows: AdvancedMetricsTradeInput[],
  timeZone: string,
): MetricResult<number> {
  const byDay = bucketByTradingDay(rows, timeZone)

  let grossProfit = new Decimal(0)
  let largestProfitableDay = new Decimal(0)
  for (const dayCents of byDay.values()) {
    if (dayCents.gt(0)) {
      grossProfit = grossProfit.plus(dayCents)
      if (dayCents.gt(largestProfitableDay)) largestProfitableDay = dayCents
    }
  }

  if (grossProfit.lte(0)) return { value: null, sufficient: false }

  const consistency = new Decimal(1).minus(largestProfitableDay.div(grossProfit))
  return { value: clampBps(toInt(consistency.times(10_000))), sufficient: true }
}

// ─── 8. Extremes & shape ──────────────────────────────────────────────────────

/** Largest single winning and losing trade, by pnlCents (with its R alongside). */
export function getExtremes(rows: AdvancedMetricsTradeInput[]): {
  largestWin: MetricResult<ExtremeTrade>
  largestLoss: MetricResult<ExtremeTrade>
} {
  let best: ExtremeTrade | null = null
  let worst: ExtremeTrade | null = null

  for (const r of rows) {
    if (r.pnlCents == null) continue
    if (r.pnlCents > 0 && (best === null || r.pnlCents > best.cents)) {
      best = { cents: r.pnlCents, r: r.pnlR ?? 0 }
    }
    if (r.pnlCents < 0 && (worst === null || r.pnlCents < worst.cents)) {
      worst = { cents: r.pnlCents, r: r.pnlR ?? 0 }
    }
  }

  return {
    largestWin:
      best === null ? { value: null, sufficient: false } : { value: best, sufficient: true },
    largestLoss:
      worst === null ? { value: null, sufficient: false } : { value: worst, sufficient: true },
  }
}

/** Population stddev of R outcomes — a "spread" quantity, always >= 0.
 * Needs at least 2 rated trades to say anything meaningful. */
export function getStdDevR(rows: AdvancedMetricsTradeInput[]): MetricResult<number> {
  const rValues = nonNullR(rows)
  if (rValues.length < MIN_TRADES_STDDEV) return { value: null, sufficient: false }

  const mean = populationMean(rValues)
  const stdDev = populationStdDev(rValues, mean)
  return { value: toInt(stdDev), sufficient: true }
}

/**
 * Average hold time (minutes) for winners vs losers, from the precomputed
 * durationMinutes column (see AdvancedMetricsTradeInput doc). Break-even
 * trades (pnlCents === 0) and rows missing a duration are excluded from
 * both buckets independently.
 */
export function getAvgHoldMinutes(rows: AdvancedMetricsTradeInput[]): {
  winners: MetricResult<number>
  losers: MetricResult<number>
} {
  const winnerDurations: Decimal[] = []
  const loserDurations: Decimal[] = []

  for (const r of rows) {
    if (r.pnlCents == null || r.durationMinutes == null) continue
    if (r.pnlCents > 0) winnerDurations.push(new Decimal(r.durationMinutes))
    else if (r.pnlCents < 0) loserDurations.push(new Decimal(r.durationMinutes))
  }

  const winners: MetricResult<number> =
    winnerDurations.length === 0
      ? { value: null, sufficient: false }
      : { value: toInt(populationMean(winnerDurations)), sufficient: true }

  const losers: MetricResult<number> =
    loserDurations.length === 0
      ? { value: null, sufficient: false }
      : { value: toInt(populationMean(loserDurations)), sufficient: true }

  return { winners, losers }
}

// ─── Aggregator ────────────────────────────────────────────────────────────────

/**
 * Computes the full advanced-metrics set for one scope (an account, a set
 * of accounts, or "all"). `rows` must already be filtered to closed,
 * non-deleted trades by the caller (same contract as TradeRowForDerived in
 * derived.ts). `startingBalanceCents` is the fixed base for the
 * Sharpe/Sortino approximation and the max-drawdown %-of-peak figure —
 * callers resolve this from the account(s) in scope (see the
 * dashboard:getStats and analytics:derived IPC handlers).
 */
export function computeAdvancedMetrics(
  rows: AdvancedMetricsTradeInput[],
  startingBalanceCents: number,
  timeZone: string,
): AdvancedMetrics {
  const maxDrawdown = getMaxDrawdown(rows, startingBalanceCents)
  const extremes = getExtremes(rows)
  const holdTimes = getAvgHoldMinutes(rows)

  return {
    sharpeRatioX100: getSharpeRatio(rows, startingBalanceCents, timeZone),
    sortinoRatioX100: getSortinoRatio(rows, startingBalanceCents, timeZone),
    maxDrawdown,
    recoveryFactorX100: getRecoveryFactor(rows, maxDrawdown),
    kellyPctBps: getKellyPct(rows),
    sqnX100: getSqn(rows),
    dayConsistencyBps: getDayConsistency(rows, timeZone),
    largestWin: extremes.largestWin,
    largestLoss: extremes.largestLoss,
    stddevRX100: getStdDevR(rows),
    avgHoldMinutesWinners: holdTimes.winners,
    avgHoldMinutesLosers: holdTimes.losers,
  }
}
