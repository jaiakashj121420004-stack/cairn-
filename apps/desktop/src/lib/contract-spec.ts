// Renderer-side contract-spec helpers for the pair setup form (multi-asset M2c).
// These encode the real tick size the trader types into the stored price unit and
// PREVIEW the derived pip value. They mirror the authoritative electron derivation
// (electron/services/pricing.ts), which recomputes the canonical value with
// decimal.js at save time — these floats are for display only (same pattern as the
// renderer's calculators.ts vs the electron pnl-calculator).

/** Encode a real tick size (e.g. 0.25) to stored units: round(real × 10^(pipDecimal+1)). */
export function encodeTickSize(realTick: number, pipDecimal: number): number {
  if (!Number.isFinite(realTick)) return 0
  return Math.round(realTick * Math.pow(10, pipDecimal + 1))
}

/** Decode a stored tick size back to a real value for editing. */
export function decodeTickSize(tickSizeStored: number, pipDecimal: number): number {
  return tickSizeStored / Math.pow(10, pipDecimal + 1)
}

/**
 * Preview the pip value (cents per pip/point per standard lot) a contract spec
 * implies. Mirrors `derivePipValueFromTick`; returns 0 for a non-positive tick.
 */
export function previewPipValueCents(tickSizeStored: number, tickValueCents: number): number {
  if (tickSizeStored <= 0) return 0
  return Math.round((tickValueCents * 10) / tickSizeStored)
}
