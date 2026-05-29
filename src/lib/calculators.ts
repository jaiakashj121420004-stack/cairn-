// Financial calculators — all inputs/outputs use integer minor units. See §2.5 (Data Integrity is Sacred).

export type PairType = 'forex' | 'indices' | 'commodities' | 'crypto' | 'stocks' | 'other'

// Returns lot size (×100) given risk in cents, SL pips (tenths), pip value per lot (cents).
// Low-level internal version — all inputs in stored-integer format.
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

// Risk-based lot size with natural-unit inputs and an optional leverage-based max-position cap.
// riskUsd: risk in USD, slPips: in real pips (not tenths), pipValueUsd: per standard lot in USD.
// Returns lot size × 100 (e.g. 50 → 0.50 lots).
// For 'forex' pair type the max position = (balance × leverage) / 100_000 (standard lot notional).
// Other asset classes skip the cap; pass balanceUsd = 0 to disable the cap for any type.
export function calculateLotSizeFromRisk(
  riskUsd: number,
  slPips: number,
  pipValueUsd: number,
  leverage: number,
  balanceUsd: number,
  pairType: PairType = 'forex',
): number {
  if (slPips === 0 || pipValueUsd === 0) return 0
  const riskBasedLots = riskUsd / (slPips * pipValueUsd)

  let maxLots = Infinity
  if (pairType === 'forex' && leverage > 0 && balanceUsd > 0) {
    // Standard forex lot = $100,000 notional; max lots = (balance × leverage) / 100,000
    maxLots = (balanceUsd * leverage) / 100_000
  }

  return Math.floor(Math.min(riskBasedLots, maxLots) * 100)
}

// Returns risk in cents from a percentage of account balance.
// riskPct is a plain percentage (e.g. 1.0 for 1%, not basis points).
export function calcRiskCentsFromPct(accountBalanceCents: number, riskPct: number): number {
  if (riskPct <= 0 || accountBalanceCents <= 0) return 0
  return Math.round((accountBalanceCents * riskPct) / 100)
}

// Returns RR ratio (×100) given SL pips and TP pips (both in tenths).
export function calculateRR(slPipTenths: number, tpPipTenths: number): number {
  if (slPipTenths === 0) return 0
  return Math.round((tpPipTenths / slPipTenths) * 100)
}

// Returns P&L in cents given lot size (×100), pip count (tenths), pip value per lot (cents).
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
