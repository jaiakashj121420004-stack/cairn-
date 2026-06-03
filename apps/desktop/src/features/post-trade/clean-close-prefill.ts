export interface CleanClosePrefill {
  exitPriceStr: string
  exitTimeStr: string
  exitReason: 'tp' | 'sl'
  followedPlan: boolean
  planChanges: string
  slMoved: boolean
  slMovedReason: string
  enteredBeforeMss: boolean
  rulesBroken: string[]
  whatRight: string
}

export function dbToDisplayPrice(dbInt: number, pipDecimal: number): string {
  return (dbInt / Math.pow(10, pipDecimal + 1)).toFixed(pipDecimal + 1)
}

export function buildCleanClosePrefill(
  type: 'tp' | 'sl',
  takeProfitPrice: number,
  stopLossPrice: number,
  pipDecimal: number,
): CleanClosePrefill {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  const dbPrice = type === 'tp' ? takeProfitPrice : stopLossPrice
  return {
    exitPriceStr: dbToDisplayPrice(dbPrice, pipDecimal),
    exitTimeStr: local.toISOString().slice(0, 16),
    exitReason: type,
    followedPlan: true,
    planChanges: '',
    slMoved: false,
    slMovedReason: '',
    enteredBeforeMss: false,
    rulesBroken: [],
    whatRight:
      type === 'tp' ? 'Closed clean at TP, plan followed' : 'Closed clean at SL, plan followed',
  }
}
