// Financial calculators — implemented and unit-tested in data-model phase (§13.12 build order step 2)
// All inputs/outputs use integer minor units. See §2.5 (Data Integrity is Sacred).

// Returns lot size (×100) given risk in cents, SL pips (tenths), pip value per lot (cents)
export function calculateLotSize(
  riskCents: number,
  slPipTenths: number,
  pipValuePerLotCents: number,
): number {
  if (slPipTenths === 0 || pipValuePerLotCents === 0) return 0
  const slPips = slPipTenths / 10
  const pipValuePerLot = pipValuePerLotCents / 100
  return Math.floor((riskCents / 100 / (slPips * pipValuePerLot)) * 100)
}

// Returns RR ratio (×100) given SL pips and TP pips (both in tenths)
export function calculateRR(slPipTenths: number, tpPipTenths: number): number {
  if (slPipTenths === 0) return 0
  return Math.round((tpPipTenths / slPipTenths) * 100)
}

// Returns P&L in cents given lot size (×100), pip count (tenths), pip value per lot (cents)
export function calculatePnlCents(
  lotSizeHundredths: number,
  pipTenths: number,
  pipValuePerLotCents: number,
): number {
  const lots = lotSizeHundredths / 100
  const pips = pipTenths / 10
  const pipValuePerLot = pipValuePerLotCents / 100
  return Math.round(lots * pips * pipValuePerLot * 100)
}
