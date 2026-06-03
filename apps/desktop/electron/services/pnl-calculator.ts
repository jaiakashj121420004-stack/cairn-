// P&L calculator — all stored values are integers (cents, tenths, hundredths)
// Prices are stored as Math.round(real_price * 10^(pipDecimal+1)), so 1 pip = 10 stored units.
// lotSize is stored as lots * 100 (e.g. 0.50 lots → 50).
// pnlR is stored as R * 100 (e.g. 2.00R → 200).

export interface PnlInputs {
  direction: 'long' | 'short'
  exitPrice: number // stored integer (price × 10^(pipDecimal+1))
  entryPrice: number // stored integer (same encoding)
  lotSize: number // stored integer (lots × 100)
  slPips: number // stored integer (pips × 10)
  pipValuePerStandardLotCents: number // e.g. 1000 for EURUSD ($10/pip)
  accountSizeCents: number
}

export interface PnlResult {
  pnlCents: number // integer cents
  pnlR: number // integer (R × 100)
  pnlPctBps: number // integer basis points
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
  } = inputs

  // Price difference in stored units — each unit is 0.1 pip (1 "tenth")
  const signedTenths = direction === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice

  // pnlCents = tenths × (lots × 100) × pipValueCents / (10 tenths/pip × 100 lot-scale)
  //          = signedTenths × lotSize × pipValuePerStandardLotCents / 1000
  const pnlCents = Math.round((signedTenths * lotSize * pipValuePerStandardLotCents) / 1000)

  // R = signed_pnl_pips / sl_pips; both in tenths so the ratio cancels
  const pnlR = slPips > 0 ? Math.round((signedTenths * 100) / slPips) : 0

  const pnlPctBps = accountSizeCents > 0 ? Math.round((pnlCents * 10000) / accountSizeCents) : 0

  return { pnlCents, pnlR, pnlPctBps }
}

export function calculateDurationMinutes(
  actualEntryTime: number | null,
  exitTime: number,
  createdAt: number,
): number {
  const openTime = actualEntryTime ?? createdAt
  return Math.round((exitTime - openTime) / 60_000)
}
