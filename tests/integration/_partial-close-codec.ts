// Single source of truth for the integer-encoding conversions performed by
// migration 0004 (electron/db/migrations/0004_consolidate_partials.sql). The
// migration does these in SQL; this module mirrors them in TS so the migration
// test derives its expected values from one documented place instead of
// re-hand-coding the arithmetic.
//
// Rounding MUST match SQLite's round(), which is round-half-away-from-zero
// (e.g. round(2.5) = 3, round(-2.5) = -3). JS Math.round is half-up
// (round(-2.5) = -2), so we cannot use it directly for negatives.

/** Round half away from zero, matching SQLite's round(). Normalizes -0 to 0. */
export function roundHalfAwayFromZero(x: number): number {
  const r = Math.sign(x) * Math.round(Math.abs(x))
  return r === 0 ? 0 : r
}

/** real dollars → integer cents (pnl_usd → pnl_cents). */
export function dollarsToCents(usd: number): number {
  return roundHalfAwayFromZero(usd * 100)
}

/** real R multiple → integer R×100 (pnl_r float → pnl_r int). */
export function rToIntHundredths(r: number): number {
  return roundHalfAwayFromZero(r * 100)
}

/** real percent (0–100) → integer basis points (close_percent → close_percent_bps). */
export function percentToBps(pct: number): number {
  return roundHalfAwayFromZero(pct * 100)
}

/**
 * real exit_price → integer price tick. The float column already held an
 * integer-valued tick (round(realPrice × 10^(pipDecimal+1))), so this only
 * strips the float representation; no multiplier.
 */
export function priceFloatToTicks(price: number): number {
  return roundHalfAwayFromZero(price)
}
