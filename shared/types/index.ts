export type IpcResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } }

export type DrawdownType = 'percent_of_balance' | 'percent_of_equity' | 'fixed_amount'
export type DrawdownBasis = 'initial_balance' | 'high_water_mark' | 'previous_day_close'
export type AccountStatus = 'active' | 'passed' | 'failed' | 'paused' | 'retired'

export interface PropFirm {
  id: string
  name: string
  defaultStepCount: number
  notes: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface AccountTemplate {
  id: string
  name: string
  propFirmId: string
  stepCount: number
  accountSizeCents: number
  leverage: number
  dailyDrawdownType: DrawdownType
  dailyDrawdownValue: number
  totalDrawdownType: DrawdownType
  totalDrawdownValue: number
  drawdownBasis: DrawdownBasis
  profitTargetPhase1Pct: number
  profitTargetPhase2Pct: number | null
  profitTargetPhase3Pct: number | null
  minTradingDays: number | null
  maxTradingDays: number | null
  weekendHoldingAllowed: number
  newsTradingAllowed: number
  consistencyRulePct: number | null
  notes: string | null
  isArchived: number
  createdAt: number
  updatedAt: number
}

export interface Account {
  id: string
  displayName: string
  templateId: string | null
  propFirmId: string
  stepCount: number
  currentPhase: number
  accountSizeCents: number
  leverage: number
  dailyDrawdownType: DrawdownType
  dailyDrawdownValue: number
  totalDrawdownType: DrawdownType
  totalDrawdownValue: number
  drawdownBasis: DrawdownBasis
  profitTargetPct: number
  minTradingDays: number | null
  maxTradingDays: number | null
  weekendHoldingAllowed: number
  newsTradingAllowed: number
  consistencyRulePct: number | null
  challengeCostCents: number
  startDate: number
  status: AccountStatus
  endDate: number | null
  endReason: string | null
  peakEquityCents: number
  currentEquityCents: number
  notes: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface CreatePropFirmInput {
  name: string
  defaultStepCount: number
  notes?: string
}

export interface UpdatePropFirmInput {
  id: string
  name?: string
  defaultStepCount?: number
  notes?: string | null
}

export interface CreateAccountTemplateInput {
  name: string
  propFirmId: string
  stepCount: number
  accountSizeCents: number
  leverage: number
  dailyDrawdownType: DrawdownType
  dailyDrawdownValue: number
  totalDrawdownType: DrawdownType
  totalDrawdownValue: number
  drawdownBasis: DrawdownBasis
  profitTargetPhase1Pct: number
  profitTargetPhase2Pct?: number
  profitTargetPhase3Pct?: number
  minTradingDays?: number
  maxTradingDays?: number
  weekendHoldingAllowed: boolean
  newsTradingAllowed: boolean
  consistencyRulePct?: number
  notes?: string
}

export interface UpdateAccountTemplateInput {
  id: string
  name?: string
  isArchived?: boolean
  notes?: string | null
}

export interface CreateAccountInput {
  displayName: string
  templateId?: string
  propFirmId: string
  stepCount: number
  currentPhase: number
  accountSizeCents: number
  leverage: number
  dailyDrawdownType: DrawdownType
  dailyDrawdownValue: number
  totalDrawdownType: DrawdownType
  totalDrawdownValue: number
  drawdownBasis: DrawdownBasis
  profitTargetPct: number
  minTradingDays?: number
  maxTradingDays?: number
  weekendHoldingAllowed: boolean
  newsTradingAllowed: boolean
  consistencyRulePct?: number
  challengeCostCents: number
  startDate: number
  notes?: string
}

export interface UpdateAccountInput {
  id: string
  displayName?: string
  status?: AccountStatus
  currentPhase?: number
  currentEquityCents?: number
  peakEquityCents?: number
  notes?: string | null
}
