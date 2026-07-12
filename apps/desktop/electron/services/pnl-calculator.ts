// P&L calculator — all stored values are integers (cents, tenths, hundredths)
// Prices are stored as Math.round(real_price * 10^(pipDecimal+1)), so 1 pip = 10 stored units.
// lotSize is stored as lots * 100 (e.g. 0.50 lots → 50).
// pnlR is stored as R * 100 (e.g. 2.00R → 200).
//
// Inputs and outputs are integers, but the intermediate division by 1000 / slPips /
// accountSizeCents must not run through IEEE-754 floats — a money-adjacent app rounds
// the *exact* rational, never a float approximation of it (CLAUDE.md §2.5, §19.5).
// All arithmetic therefore goes through decimal.js, with a single explicit
// round-half-up at each boundary to match the integer encoding.
import Decimal from 'decimal.js'

export interface PnlInputs {
  direction: 'long' | 'short'
  exitPrice: number // stored integer (price × 10^(pipDecimal+1))
  entryPrice: number // stored integer (same encoding)
  lotSize: number // stored integer (lots × 100)
  slPips: number // stored integer (pips × 10)
  pipValuePerStandardLotCents: number // e.g. 1000 for EURUSD ($10/pip)
  accountSizeCents: number
  // Contract spec (optional). When BOTH are present and tickSizeStored > 0, P&L is
  // computed TICK-NATIVE — exact, with no intermediate rounding of a pip value.
  // Omitted (pip-configured pairs) → the pip path below, unchanged. The two paths
  // are algebraically identical when pipValue = tickValueCents × 10 / tickSizeStored.
  tickSizeStored?: number | null // min price increment in stored units
  tickValueCents?: number | null // money (cents) per tick per standard lot
}

export interface PnlResult {
  pnlCents: number // integer cents
  pnlR: number // integer (R × 100)
  pnlPctBps: number // integer basis points
}

// Round to an integer with JS Math.round semantics: nearest, ties toward +∞.
// ROUND_HALF_CEIL is the decimal.js mode that matches Math.round exactly, so this
// conversion changes only the precision of the intermediate (now exact), never the
// rounding of any value that previously landed on a half boundary.
function roundToInt(d: Decimal): number {
  return d.toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL).toNumber()
}

export function calculatePnl(inputs: PnlInputs): PnlResult {
  const {
    direction,
    exitPrice,
    entryPrice,
    lotSize,
    slPips,
    pipValuePerStandardLotCents,
    accountSizeCents,
    tickSizeStored,
    tickValueCents,
  } = inputs

  // Price difference in stored units — each unit is 0.1 pip (1 "tenth")
  const signedTenths =
    direction === 'long'
      ? new Decimal(exitPrice).minus(entryPrice)
      : new Decimal(entryPrice).minus(exitPrice)

  // Tick-native path (contract-spec pairs): pnl = signedTenths × lots × tickValueCents
  //   / (tickSizeStored × 100). Pip path (default): signedTenths × lotSize ×
  //   pipValuePerStandardLotCents / 1000. Both go through decimal.js with one round.
  const pnlCents =
    tickSizeStored != null && tickValueCents != null && tickSizeStored > 0
      ? roundToInt(
          signedTenths
            .times(lotSize)
            .times(tickValueCents)
            .div(new Decimal(tickSizeStored).times(100)),
        )
      : roundToInt(signedTenths.times(lotSize).times(pipValuePerStandardLotCents).div(1000))

  // R = signed_pnl_pips / sl_pips; both in tenths so the ratio cancels
  const pnlR = slPips > 0 ? roundToInt(signedTenths.times(100).div(slPips)) : 0

  const pnlPctBps =
    accountSizeCents > 0 ? roundToInt(new Decimal(pnlCents).times(10000).div(accountSizeCents)) : 0

  return { pnlCents, pnlR, pnlPctBps }
}

export function calculateDurationMinutes(
  actualEntryTime: number | null,
  exitTime: number,
  createdAt: number,
): number {
  const openTime = actualEntryTime ?? createdAt
  // Elapsed time is wall-clock, not money — but keep it exact-then-round for
  // consistency with the rest of the file.
  return roundToInt(new Decimal(exitTime).minus(openTime).div(60_000))
}
