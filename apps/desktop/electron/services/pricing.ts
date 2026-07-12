// Contract-spec pricing derivation (multi-asset M2). Money-adjacent, so it goes
// through decimal.js with one explicit round (CLAUDE.md §2.5, §19.5) — never a
// float approximation.
//
// Cairn's price encoding stores a real price as round(real × 10^(pipDecimal+1)),
// which makes ONE PIP EXACTLY 10 STORED UNITS regardless of pipDecimal. A contract
// spec supplies the minimum price increment (tick size, in that same stored
// encoding) and the money per tick per standard lot/contract (cents). The canonical
// pip value follows directly:
//
//   ticksPerPip                 = 10 / tickSizeStored
//   pipValuePerStandardLotCents = round(tickValueCents × 10 / tickSizeStored)
//
// Verified against real instruments (all exact):
//   EURUSD    tick 0.0001 (=10 units), $10/tick  → 1000c  ($10/pip)
//   EURUSD-5d tick 0.00001 (=1 unit),  $1/tick   → 1000c
//   ES future tick 0.25 (=250 units),  $12.50/tick → 50c per 0.01 (= $50/point)
import Decimal from 'decimal.js'

/** Stored price units per pip — an invariant of the price encoding (see above). */
export const STORED_UNITS_PER_PIP = 10

/** Round a Decimal to an integer with Math.round (ties toward +∞) semantics. */
function roundToInt(d: Decimal): number {
  return d.toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL).toNumber()
}

/**
 * Derive `pipValuePerStandardLotCents` from a contract spec.
 *
 * @param tickSizeStored Minimum price increment in stored units
 *                       (`round(realTick × 10^(pipDecimal+1))`).
 * @param tickValueCents Money (cents) per one tick per one standard lot / contract.
 * @returns The derived pip value in cents, or 0 for a non-positive tick size.
 */
export function derivePipValueFromTick(tickSizeStored: number, tickValueCents: number): number {
  if (tickSizeStored <= 0) return 0
  return roundToInt(new Decimal(tickValueCents).times(STORED_UNITS_PER_PIP).div(tickSizeStored))
}
