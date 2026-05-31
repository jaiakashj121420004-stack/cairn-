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
  mode: TradeMode
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
  leverage?: number
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
  id?: string // client-generated uuid for idempotent creates (§13.11 item 12)
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

export interface PartialCloseInput {
  tradeId: string
  closeLots: number     // stored integer (lots × 100)
  exitPrice: number     // encoded integer (Math.round(float × 10^(pipDecimal+1)))
  exitTime: number      // UTC ms
  closePercent?: number // 0–100, optional for display
  notes?: string
}

export interface PartialCloseRecord {
  id: string
  tradeId: string
  closePercentBps: number // basis points (50% → 5000)
  closeLots: number | null // lots × 100
  exitPrice: number // price tick, round(realPrice × 10^(pipDecimal+1))
  exitTime: number // UTC ms
  pnlR: number | null // R × 100 (1.5R → 150)
  pnlCents: number | null // integer cents
  notes: string | null
  createdAt: number
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
  partialCloses: PartialCloseRecord[]
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface RecentTradeItem {
  id: string
  pairSymbol: string
  setupName: string
  direction: TradeDirection
  status: TradeStatus
  rrRatio: number
  pnlCents: number | null
  pnlR: number | null
  isClean: number | null
  createdAt: number
}

export interface WeekDayStats {
  date: string
  tradeCount: number
  cleanCount: number
  adherencePct: number  // 0-100, or -1 meaning no trades that day
}

export interface DashboardStats {
  disciplineScore: number
  disciplineWindow: number
  ruleBreakdown: { ruleKey: string; count: number }[]
  rollingExpectancy: number       // avg pnlR ×100 of last 20 closed trades
  expectancySpark: number[]       // pnlR ×100 values, oldest first
  todayTradeCount: number
  todayClosedCount: number
  todayPnlCents: number
  todayRulesBrokenCount: number
  streak: { count: number; type: 'win' | 'loss' } | null
  account: {
    id: string
    displayName: string
    currentEquityCents: number
    accountSizeCents: number
    peakEquityCents: number
    dailyDrawdownType: string
    dailyDrawdownValue: number
    totalDrawdownType: string
    totalDrawdownValue: number
    profitTargetPct: number
    currentPhase: number
    stepCount: number
    status: string
  } | null
  recentTrades: RecentTradeItem[]
  weekAdherence: WeekDayStats[]
  ddUsedBps: number
  totalPnlCents: number
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

// ─── Analytics ────────────────────────────────────────────────────────────────

export type DatePreset =
  | 'today'
  | '7d'
  | '30d'
  | 'this_month'
  | 'last_month'
  | 'all'
  | 'custom'

export type ModeFilter = 'all' | 'live' | 'sim' | 'backtest'

export interface AnalyticsFilter {
  accountIds: string[] | 'all'
  dateFrom: number | null
  dateTo: number | null
  datePreset: DatePreset
  mode: ModeFilter
  pairIds: string[]
  setupIds: string[]
  killzoneIds: string[]
  cleanOnly: boolean
}

export interface SampleGuard {
  n: number
  sufficient: boolean
}

export interface AnalyticsTotals {
  tradeCount: number
  winCount: number
  lossCount: number
  winRateBps: number
  expectancyR: number
  totalR: number
  netPnlCents: number
  netPnlPctBps: number
  profitFactor: number // ×100; -1 = infinity (no losses)
  avgWinCents: number
  avgLossCents: number
}

// ── Tab 1: Performance
export interface EquityPoint {
  t: number
  cumCents: number
  cumR: number
}

export interface RDistributionBucket {
  rLowHundredths: number // ×100, bucket lower bound
  rHighHundredths: number
  count: number
}

export interface StreakInfo {
  currentKind: 'win' | 'loss' | 'none'
  currentLen: number
  longestWin: number
  longestLoss: number
}

export interface DailyPnlCell {
  date: string // YYYY-MM-DD UTC
  pnlCents: number
  tradeCount: number
  winCount: number
}

export interface PerformanceStats {
  totals: AnalyticsTotals
  equityCurve: EquityPoint[]
  distribution: RDistributionBucket[]
  streaks: StreakInfo
  dailyHeatmap: DailyPnlCell[]
  maxDrawdownCents: number
  ddLimitCents: number | null
}

// ── Tab 2: Rule Adherence
export interface AdherenceScore {
  cleanCount: number
  dirtyCount: number
  scoreBps: number
  prevScoreBps: number | null
  trendDirection: 'up' | 'down' | 'flat'
}

export interface CleanVsDirty {
  clean: AnalyticsTotals
  dirty: AnalyticsTotals
  avgPnlDiffCents: number // clean.avgPnl - dirty.avgPnl
}

export interface RuleBreakRow {
  ruleKey: string
  count: number
  avgPnlCentsWhenBroken: number
  winRateBps: number
  netPnlCents: number
}

export interface AdherenceTrendPoint {
  weekStart: string // YYYY-MM-DD (Monday UTC)
  cleanCount: number
  totalCount: number
  scoreBps: number
}

export interface BlockedInfo {
  blockedCount: number
  projectedAvoidedCents: number
}

export interface RuleAdherenceStats {
  score: AdherenceScore
  cleanVsDirty: CleanVsDirty
  topBroken: RuleBreakRow[]
  impactTable: RuleBreakRow[]
  blocked: BlockedInfo
  trendLine: AdherenceTrendPoint[]
}

// ── Tab 3: Setup Performance
export interface SubTotals {
  n: number
  winRateBps: number
  expectancyR: number
  netPnlCents: number
}

export interface MatrixCell {
  setupId: string
  killzoneId: string
  n: number
  expectancyR: number
  winRateBps: number
}

export interface SetupRow {
  setupId: string
  setupName: string
  n: number
  winRateBps: number
  expectancyR: number
  avgRrAchievedBps: number
}

export interface DayOfWeekRow {
  dow: number // 0 = Sun
  n: number
  winRateBps: number
  expectancyR: number
}

export interface CompareCard {
  withFlag: SubTotals
  withoutFlag: SubTotals
}

export interface SetupPerformanceStats {
  matrix: MatrixCell[]
  setupNames: { id: string; name: string }[]
  killzoneNames: { id: string; name: string }[]
  bySetup: SetupRow[]
  byDay: DayOfWeekRow[]
  mssCompare: CompareCard
  dxyCompare: CompareCard
  smtCompare: CompareCard
}

// ── Tab 4: Behavioral
export type EmotionalBucket = 'calm' | 'neutral' | 'urgent'
export interface BucketRow {
  bucket: EmotionalBucket
  n: number
  winRateBps: number
  expectancyR: number
}

export interface PostLossBehavior {
  firstAfterLoss: SubTotals
  secondAfterLoss: SubTotals
  revenge: SubTotals
}

export interface TradeNumOfDayRow {
  bucket: 1 | 2 | 3 // 3 means 3+
  n: number
  winRateBps: number
  expectancyR: number
}

export interface HourDayCell {
  dow: number // 0..6
  hour: number // 0..23
  n: number
  expectancyR: number
}

export interface RecoveryPattern {
  recoveryCount: number
  cleanRecoveryCount: number
  cleanRateBps: number
}

export interface BehavioralStats {
  emotionalBuckets: BucketRow[]
  needBuckets: BucketRow[]
  postLoss: PostLossBehavior
  tradeNumOfDay: TradeNumOfDayRow[]
  hourDayHeatmap: HourDayCell[]
  recovery: RecoveryPattern
}

// ── Tab 5: Accounts & Phases
export interface AccountLadderRow {
  id: string
  displayName: string
  firmName: string
  sizeCents: number
  phase: number
  stepCount: number
  daysAlive: number
  status: string
  endReason: string | null
  costCents: number
}

export interface PhaseTrendPoint {
  month: string // YYYY-MM
  phase1PassRate: number // bps
  phase2PassRate: number // bps
  fundedRate: number // bps
  sampleSize: number
}

export interface CostAnalysis {
  totalSpentCents: number
  totalPayoutsCents: number
  netCents: number
  costPerTradeCents: number
  accountCount: number
}

export interface FailureCauseRow {
  ruleKey: string
  count: number
}

export interface DaysToFailureBucket {
  bucket: string // e.g. "0-3", "4-7"
  count: number
}

export interface PatternInsight {
  id: string
  text: string
  sampleSize: number
}

export interface AccountsPhaseStats {
  ladder: AccountLadderRow[]
  phaseTrend: PhaseTrendPoint[]
  cost: CostAnalysis
  failureCauses: FailureCauseRow[]
  daysToFailure: DaysToFailureBucket[]
  insights: PatternInsight[]
}

// ── Derived analytics (Wave 2 item 2)
export interface DowSummaryRow {
  dow: number          // 0 = Sunday
  n: number
  winRateBps: number   // 0–10000
  expectancyR: number  // R × 100, integer
  netPnlCents: number  // integer cents
}

export interface ProfitFactorResult {
  valueTimes100: number  // profit-factor × 100, integer; 0 when no trades/no winners
  infinite: boolean      // true when grossLossR == 0 && grossWinR > 0
  grossWinR: number      // sum of winning pnlR values (R × 100)
  grossLossR: number     // sum of abs(losing pnlR) values (R × 100)
}

export interface DerivedStats {
  expectancyR: number            // R × 100, integer (decimal.js result)
  expectancySpark: number[]      // rolling 10-trade window over last 20, oldest first
  profitFactor: ProfitFactorResult
  dowSummary: DowSummaryRow[]
  timeOfDayHeatmap: HourDayCell[]    // reuses existing type
  rDistribution: RDistributionBucket[]  // reuses existing type
}

// ── Tab 6: Review
export type ReviewPeriodType = 'weekly' | 'monthly'

export interface ReviewSummary {
  id: string
  accountId: string | null
  periodType: ReviewPeriodType
  periodStart: string
  periodEnd: string
  topMistakes: string
  bestTradeId: string | null
  worstTradeId: string | null
  lessonNextPeriod: string
  ruleFocus: string | null
  adherenceScore: number
  notes: string | null
  createdAt: number
}

export interface CreateReviewInput {
  accountId?: string | null
  periodType: ReviewPeriodType
  periodStart: string
  periodEnd: string
  topMistakes: string
  bestTradeId?: string | null
  worstTradeId?: string | null
  lessonNextPeriod: string
  ruleFocus?: string | null
  adherenceScore: number
  notes?: string | null
}

// ── Backup & Restore ──────────────────────────────────────────────────────────
export interface BackupLogEntry {
  id: string
  kind: 'auto_local' | 'manual'
  destination: string
  filesizeBytes: number
  status: 'success' | 'failed'
  errorMessage: string | null
  createdAt: number
}

export interface BackupResult {
  path: string
  filesizeBytes: number
  tradeCount: number
  accountCount: number
}

export interface RestoreInfo {
  version: string
  createdAt: number
  tradeCount: number
  accountCount: number
}

export interface BackupSettings {
  folder: string | null
  schedule: 'daily' | 'on_close' | 'manual'
  dailyTime: string  // HH:MM UTC
  backupOnClose: boolean
}
