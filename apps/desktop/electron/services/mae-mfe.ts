/**
 * MAE / MFE auto-compute (Wave 3, roadmap item 7; v1.2 end-state #21).
 *
 * Given a trade's planned entry, planned stop-loss, direction, and the OHLC
 * price series that spans its open→close window, derive:
 *   - MAE — Maximum Adverse Excursion: how far price moved AGAINST the trade,
 *           expressed as a multiple of the planned risk (R).
 *   - MFE — Maximum Favourable Excursion: how far price moved FOR the trade,
 *           expressed in R.
 *
 * Definitions (price-distance form; R is dimensionless):
 *   risk_per_unit   = |entry_price − sl_price|
 *   per candle, long:  adverse    = max(0, entry − low)
 *                      favourable = max(0, high − entry)
 *   per candle, short: adverse    = max(0, high − entry)
 *                      favourable = max(0, entry − low)
 *   MAE = max(adverse)    / risk_per_unit
 *   MFE = max(favourable) / risk_per_unit
 *
 * Contract (no slop, §2.5 data integrity):
 *   - All arithmetic uses decimal.js. No floats touch the math.
 *   - Returns `null` (MAE/MFE stay unset on the trade) when the computation
 *     cannot be trusted: no price series, a zero/undefined risk distance, or
 *     any non-finite numeric input. We never interpolate and never guess.
 *   - The two excursions are returned BOTH as R-multiples (×100 integers,
 *     matching the codebase's `pnlR` encoding) and as exact price-distance
 *     strings, so the storage layer can encode them into the `mae_pips` /
 *     `mfe_pips` columns (tenths-of-pip) with the pair's own pipDecimal.
 *   - Pure: no DB access, no I/O, no clock.
 */

import Decimal from 'decimal.js'
import type { PriceCandle, TradeDirection } from '../../shared/types/index'

export interface MaeMfeInput {
  /** Planned entry price (raw decimal string). */
  readonly entryPrice: string
  /** Planned stop-loss price (raw decimal string). */
  readonly slPrice: string
  readonly direction: TradeDirection
  /** OHLC candles (or ticks) spanning the trade's open→close window. */
  readonly candles: readonly PriceCandle[]
}

export interface MaeMfeResult {
  /** Max adverse excursion in R, ×100 integer (≥ 0). */
  readonly maeR: number
  /** Max favourable excursion in R, ×100 integer (≥ 0). */
  readonly mfeR: number
  /** Max adverse excursion as a price distance, exact decimal string (≥ 0). */
  readonly maePriceDistance: string
  /** Max favourable excursion as a price distance, exact decimal string (≥ 0). */
  readonly mfePriceDistance: string
}

/**
 * Compute MAE/MFE from a price series. Returns `null` when the inputs do not
 * permit a trustworthy computation (see module contract).
 */
export function computeMaeMfe(input: MaeMfeInput): MaeMfeResult | null {
  const { entryPrice, slPrice, direction, candles } = input

  if (candles.length === 0) return null

  const entry = toDecimal(entryPrice)
  const sl = toDecimal(slPrice)
  if (entry === null || sl === null) return null

  const risk = entry.minus(sl).abs()
  // Zero risk → division by zero; undefined R. No guessing.
  if (risk.isZero()) return null

  let maxAdverse = new Decimal(0)
  let maxFavourable = new Decimal(0)

  for (const candle of candles) {
    const high = toDecimal(candle.high)
    const low = toDecimal(candle.low)
    // A malformed candle makes the whole series untrustworthy — surface it as
    // "couldn't compute" rather than silently dropping the tick (no guessing).
    if (high === null || low === null) return null

    const adverse =
      direction === 'long' ? Decimal.max(0, entry.minus(low)) : Decimal.max(0, high.minus(entry))

    const favourable =
      direction === 'long' ? Decimal.max(0, high.minus(entry)) : Decimal.max(0, entry.minus(low))

    if (adverse.greaterThan(maxAdverse)) maxAdverse = adverse
    if (favourable.greaterThan(maxFavourable)) maxFavourable = favourable
  }

  const maeR = maxAdverse.div(risk).times(100)
  const mfeR = maxFavourable.div(risk).times(100)

  return {
    maeR: maeR.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
    mfeR: mfeR.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
    maePriceDistance: maxAdverse.toString(),
    mfePriceDistance: maxFavourable.toString(),
  }
}

/** Parse a raw string into a finite Decimal, or null if it isn't a real number. */
function toDecimal(s: string): Decimal | null {
  if (typeof s !== 'string' || s.trim() === '') return null
  let d: Decimal
  try {
    d = new Decimal(s)
  } catch {
    return null
  }
  return d.isFinite() ? d : null
}
