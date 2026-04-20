export type IpcResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } }

export type RuleSeverity = 'blocking' | 'warning' | 'logged'
export type RuleOutcome = 'blocked' | 'user_overrode' | 'logged_post_hoc'
export type RuleCategory = 'risk' | 'process' | 'timing' | 'behavior'
export type SessionState = 'idle' | 'active' | 'paused' | 'locked'
export type CooldownReason =
  | 'post_loss'
  | 'consecutive_losses'
  | 'daily_loss_hit'
  | 'rule_violation'
  | 'manual'
export type DailyBias = 'bullish' | 'bearish' | 'neutral'
export type TradeDirection = 'long' | 'short'

export interface DraftTradeInput {
  accountId: string
  sessionId?: string | null
  pairId: string
  setupId: string
  killzoneId?: string | null
  direction: TradeDirection
  entryPrice: number
  stopLossPrice: number
  takeProfitPrice: number
  slPips: number
  rrRatio: number
  lotSize: number
  riskAmountCents: number
  riskPctBps: number
  plannedInvalidation: string
  mssConfirmed: number
  htfBiasAligned: number
  dxyAligned?: number | null
  preCalmScore: number
  preUrgencyScore: number
  preNeedScore: number
  plannedLotSize?: number
  timestamp?: number
}

export interface RuleEvaluationDTO {
  ruleKey: string
  ruleLabel: string
  passed: boolean
  severity: 'blocking' | 'warning' | 'info'
  message: string
  details?: string
  canOverride: boolean
  suggestedAction?: string
  contextSnapshot?: Record<string, unknown>
}

export interface AccountRuleConfigDTO {
  id: string
  accountId: string
  ruleKey: string
  enabled: number
  value: string
  priority: number
  createdAt: number
  updatedAt: number
}

export interface CooldownDTO {
  id: string
  accountId: string
  reason: CooldownReason
  startedAt: number
  expiresAt: number
  clearedAt: number | null
  clearedBy: 'timer' | 'user_acknowledgment' | null
  acknowledgmentText: string | null
}

export interface SessionStateDTO {
  state: SessionState
  lockedReason: string | null
  unlockAt: number | null
  activeCooldowns: CooldownDTO[]
}

export interface OverrideInputDTO {
  accountId: string
  tradeId?: string
  ruleKey: string
  reason: string
  ack: string
}

export interface EvaluateModificationInput {
  accountId: string
  tradeId: string
  field: 'stop_loss_price' | 'take_profit_price' | 'lot_size'
  currentValue: number
  newValue: number
}

export interface UpsertAccountRuleInput {
  accountId: string
  ruleKey: string
  enabled: boolean
  value: Record<string, unknown>
}

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
