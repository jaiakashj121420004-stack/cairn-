/**
 * Decimal encoding helpers shared by all import adapters.
 * Mirrors the encoding used throughout the rest of the app (see pnl-calculator.ts).
 *
 * All functions are pure — no DB access, no side effects.
 */

/** Price float string → integer tick: Math.round(price × 10^(pipDecimal+1)). */
export function encodePrice(priceStr: string, pipDecimal: number): number {
  const p = parseFloat(priceStr)
  return Number.isFinite(p) ? Math.round(p * Math.pow(10, pipDecimal + 1)) : 0
}

/** Lots float string → integer (lots × 100). */
export function encodeLots(lotsStr: string): number {
  const l = parseFloat(lotsStr)
  return Number.isFinite(l) ? Math.round(l * 100) : 0
}

/** Dollar/account-currency amount string → integer cents (round-half-away-from-zero). */
export function encodeCents(amountStr: string): number {
  const a = parseFloat(amountStr)
  if (!Number.isFinite(a)) return 0
  return Math.sign(a) * Math.round(Math.abs(a) * 100)
}

/** Absolute price difference in "tenths" (pips × 10 = the stored SL unit). */
export function calcSlTenths(entryTick: number, slTick: number): number {
  return Math.abs(entryTick - slTick)
}

/** RR × 100, integer. Returns 0 when slTenths is 0 (unknown SL). */
export function calcRR(slTenths: number, tpTenths: number): number {
  return slTenths > 0 ? Math.round((tpTenths * 100) / slTenths) : 0
}

/** Risk in cents derived from SL pips, lot size, and pip value. */
export function calcRiskCents(
  slTenths: number,
  lotSizeInt: number,
  pipValueCents: number,
): number {
  return slTenths > 0
    ? Math.round((slTenths * lotSizeInt * pipValueCents) / 1000)
    : 0
}
