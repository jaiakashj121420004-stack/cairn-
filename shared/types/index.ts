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
  deletedAt?: number | null
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

// ─── Pairs ───────────────────────────────────────────────────────────────────

export interface Pair {
  id: string
  symbol: string
  displayName: string
  assetClass: string
  pipDecimal: number
  pipValuePerStandardLotCents: number
  correlatedWith: string | null
  active: number
  displayOrder: number
  notes: string | null
  createdAt: number
  updatedAt: number
}

export interface CreatePairInput {
  symbol: string
  displayName: string
  assetClass: string
  pipDecimal: number
  pipValuePerStandardLotCents: number
  correlatedWith?: string[]
  notes?: string
}

export interface UpdatePairInput {
  id: string
  symbol?: string
  displayName?: string
  assetClass?: string
  pipDecimal?: number
  pipValuePerStandardLotCents?: number
  correlatedWith?: string[] | null
  active?: boolean
  displayOrder?: number
  notes?: string | null
}

// ─── Setups ──────────────────────────────────────────────────────────────────

export interface Setup {
  id: string
  name: string
  category: string
  description: string | null
  color: string
  active: number
  displayOrder: number
  createdAt: number
  updatedAt: number
}

export interface CreateSetupInput {
  name: string
  category: string
  description?: string
  color: string
}

export interface UpdateSetupInput {
  id: string
  name?: string
  category?: string
  description?: string | null
  color?: string
  active?: boolean
  displayOrder?: number
}

// ─── Killzones ────────────────────────────────────────────────────────────────

export interface Killzone {
  id: string
  name: string
  startTimeUtc: string
  endTimeUtc: string
  color: string
  active: number
  displayOrder: number
  notes: string | null
  createdAt: number
  updatedAt: number
}

export interface CreateKillzoneInput {
  name: string
  startTimeUtc: string
  endTimeUtc: string
  color: string
  notes?: string
}

export interface UpdateKillzoneInput {
  id: string
  name?: string
  startTimeUtc?: string
  endTimeUtc?: string
  color?: string
  active?: boolean
  displayOrder?: number
  notes?: string | null
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string
  accountId: string
  sessionDate: string
  dailyBias: DailyBias
  dailyBiasReason: string
  h4Bias: DailyBias
  h4BiasReason: string
  h1Bias: DailyBias
  h1BiasReason: string
  htfLiquidityTarget: string | null
  dxyBias: DailyBias | 'n/a' | null
  smtNotes: string | null
  sessionPlan: string | null
  keyLevels: string | null
  createdAt: number
  updatedAt: number
  lockedAt: number | null
}

export interface CreateSessionInput {
  accountId: string
  dailyBias: DailyBias
  dailyBiasReason: string
  h4Bias: DailyBias
  h4BiasReason: string
  h1Bias: DailyBias
  h1BiasReason: string
  htfLiquidityTarget?: string
  dxyBias?: DailyBias | 'n/a'
  smtNotes?: string
  sessionPlan?: string
  keyLevels?: string[]
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export type TradeMode = 'live' | 'sim' | 'backtest'
export type TradeStatus = 'planned' | 'open' | 'closed' | 'cancelled'
export type ExitReason = 'tp' | 'sl' | 'manual' | 'be' | 'partial_full' | 'timeout'
export type ScreenshotKind = 'htf_context' | 'entry' | 'exit' | 'review' | 'other'

export interface Trade {
  id: string
  accountId: string
  sessionId: string | null
  pairId: string
  setupId: string
  killzoneId: string | null
  mode: TradeMode
  direction: TradeDirection
  status: TradeStatus
  // Plan
  entryPrice: number
  stopLossPrice: number
  takeProfitPrice: number
  slPips: number
  rrRatio: number
  lotSize: number
  riskAmountCents: number
  riskPctBps: number
  plannedInvalidation: string
  // Context
  mssConfirmed: number
  htfBiasAligned: number
  dxyAligned: number | null
  smtConfirmed: number | null
  correlatedPairUsed: string | null
  // Pre-trade emotional
  preCalmScore: number
  preUrgencyScore: number
  preNeedScore: number
  // Execution (post-trade)
  actualEntryPrice: number | null
  actualEntryTime: number | null
  exitPrice: number | null
  exitTime: number | null
  exitReason: ExitReason | null
  pnlCents: number | null
  pnlR: number | null
  pnlPctBps: number | null
  maePips: number | null
  mfePips: number | null
  durationMinutes: number | null
  // Honesty
  followedPlanExactly: number | null
  planChangesDescription: string | null
  slMoved: number | null
  slMovedReason: string | null
  tpMoved: number | null
  enteredBeforeMss: number | null
  revengeTradeFlag: number | null
  rulesBroken: string | null
  isClean: number | null
  // Reflection
  postCalmScore: number | null
  whatIDidRight: string | null
  whatIDidWrong: string | null
  tags: string | null
  // Timestamps
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface CreateTradeInput {
  accountId: string
  sessionId?: string | null
  pairId: string
  setupId: string
  killzoneId?: string | null
  mode: TradeMode
  direction: TradeDirection
  status: TradeStatus
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
  smtConfirmed?: number | null
  correlatedPairUsed?: string | null
  preCalmScore: number
  preUrgencyScore: number
  preNeedScore: number
}

export interface CloseTradeInput {
  tradeId: string
  exitPrice: number      // encoded integer (Math.round(float × 10^(pipDecimal+1)))
  exitTime: number       // UTC ms
  exitReason: ExitReason
  maePips?: number       // tenths (user pips × 10)
  mfePips?: number
  followedPlanExactly: boolean
  planChangesDescription?: string
  slMoved: boolean
  slMovedReason?: string
  enteredBeforeMss: boolean
  rulesBroken: string[]
  postCalmScore: number
  whatIDidRight?: string
  whatIDidWrong?: string
  tags?: string[]
}

export interface TradeScreenshot {
  id: string
  tradeId: string
  kind: ScreenshotKind
  filename: string
  caption: string | null
  createdAt: number
  absolutePath: string
}

export interface RuleViolation {
  id: string
  accountId: string
  tradeId: string | null
  ruleKey: string
  severity: string
  outcome: string
  contextJson: string
  createdAt: number
}

export interface TradeListItem {
  id: string
  accountId: string
  sessionId: string | null
  pairId: string
  pairSymbol: string
  pairPipDecimal: number
  pairPipValuePerLotCents: number
  setupId: string
  setupName: string
  killzoneId: string | null
  killzoneName: string | null
  mode: TradeMode
  direction: TradeDirection
  status: TradeStatus
  entryPrice: number
  stopLossPrice: number
  takeProfitPrice: number
  slPips: number
  rrRatio: number
  lotSize: number
  riskAmountCents: number
  riskPctBps: number
  exitPrice: number | null
  exitTime: number | null
  exitReason: ExitReason | null
  pnlCents: number | null
  pnlR: number | null
  pnlPctBps: number | null
  durationMinutes: number | null
  isClean: number | null
  rulesBroken: string | null
  tags: string | null
  followedPlanExactly: number | null
  slMoved: number | null
  enteredBeforeMss: number | null
  createdAt: number
  updatedAt: number
}

export interface TradeFilter {
  accountId: string
  dateFrom?: number
  dateTo?: number
  pairId?: string
  setupId?: string
  killzoneId?: string
  mode?: TradeMode
  direction?: TradeDirection
  isClean?: boolean
  status?: TradeStatus
}

export interface TradeDetail extends Trade {
  pairSymbol: string
  pairPipDecimal: number
  pairPipValuePerLotCents: number
  setupName: string
  killzoneName: string | null
  screenshots: TradeScreenshot[]
  ruleViolations: RuleViolation[]
  relatedTrades: TradeListItem[]
}

// ─── Account Stats ────────────────────────────────────────────────────────────

export interface AccountStats {
  accountId: string
  tradeCount: number
  cleanCount: number
  cleanRate: number
  daysSinceStart: number
  dailyPnlCents: number
  totalPnlCents: number
  ddUsedBps: number
  profitPctBps: number
}
