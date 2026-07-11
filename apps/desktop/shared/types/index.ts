export type IpcResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } }

// ─── Trade grade ──────────────────────────────────────────────────────────────
export type GradeLetter = 'A' | 'B' | 'C' | 'D' | 'F'
export interface TradeGrade {
  letter: GradeLetter
  score: number // 0–100 (can go below 0 before clamping in the badge, but formula is unbounded below 45 only by rules-broken)
}

export type RuleSeverity = 'blocking' | 'warning' | 'logged'
// 'detected_live' — a non-blocking, real-time breach Cairn observed on a live
// broker position it cannot block (Wave 4 live detection). Distinct from
// 'blocked' (a pre-trade gate that stopped the click) so analytics never count a
// detection as a prevention. See docs/broker-integration.md §5.
export type RuleOutcome = 'blocked' | 'user_overrode' | 'logged_post_hoc' | 'detected_live'
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
  details?: string | undefined
  canOverride: boolean
  suggestedAction?: string | undefined
  contextSnapshot?: Record<string, unknown> | undefined
}

/** A planned-vs-actual divergence detected when closing a trade. The renderer
 *  pre-ticks the checklist row matching `ruleKey` and shows `detail` as the
 *  "detected by Cairn" explanation. */
export interface CloseDetectionDTO {
  ruleKey: string
  detail: string
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

/**
 * One phase of an account's prop-firm ladder (`account_phases`, migration 0016).
 * All money/percent values are integer basis points (§2.5). `profitTargetPct`
 * is null for a phase with no target (a funded phase). The account row's single
 * columns always mirror the ACTIVE phase (denormalization contract) — the rules
 * engine reads the account row, never this table.
 */
export interface AccountPhase {
  id: string
  accountId: string
  phaseNumber: number
  profitTargetPct: number | null
  dailyDrawdownType: DrawdownType
  dailyDrawdownValue: number
  totalDrawdownType: DrawdownType
  totalDrawdownValue: number
  minTradingDays: number | null
  maxTradingDays: number | null
  consistencyRulePct: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
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
  /** ACTIVE phase's target in basis points. 0 = no target (funded phase). */
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
  /** Full per-phase ladder, ordered by phaseNumber (active rows only). */
  phases: AccountPhase[]
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
  stepCount?: number
  accountSizeCents?: number
  leverage?: number
  dailyDrawdownType?: DrawdownType
  dailyDrawdownValue?: number
  totalDrawdownType?: DrawdownType
  totalDrawdownValue?: number
  drawdownBasis?: DrawdownBasis
  profitTargetPhase1Pct?: number
  profitTargetPhase2Pct?: number | null
  profitTargetPhase3Pct?: number | null
  minTradingDays?: number | null
  maxTradingDays?: number | null
  consistencyRulePct?: number | null
}

/**
 * One phase's configuration as supplied by the client (create / updatePhases).
 * Values in integer basis points. `profitTargetPct: null` = no target (funded).
 */
export interface CreateAccountPhaseInput {
  phaseNumber: number
  profitTargetPct: number | null
  dailyDrawdownType: DrawdownType
  dailyDrawdownValue: number
  totalDrawdownType: DrawdownType
  totalDrawdownValue: number
  minTradingDays?: number | null
  maxTradingDays?: number | null
  consistencyRulePct?: number | null
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
  /** ACTIVE phase's target in basis points. 0 = no target. */
  profitTargetPct: number
  minTradingDays?: number
  maxTradingDays?: number
  weekendHoldingAllowed: boolean
  newsTradingAllowed: boolean
  consistencyRulePct?: number
  challengeCostCents: number
  startDate: number
  notes?: string
  /**
   * Per-phase ladder (exactly stepCount entries, phaseNumber 1..n). Optional:
   * when absent the handler synthesizes one phase per step from the single
   * values above (same rule as the 0016 migration backfill).
   */
  phases?: CreateAccountPhaseInput[]
}

/** Input for `accounts:advancePhase`. */
export interface AdvancePhaseInput {
  accountId: string
}

/**
 * Input for `accounts:updatePhases` — replaces the account's per-phase config.
 * The array length becomes the account's stepCount; removed phases are
 * soft-deleted; the active phase's values are re-denormalized onto the account.
 */
export interface UpdateAccountPhasesInput {
  accountId: string
  phases: CreateAccountPhaseInput[]
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
  // Two-phase logging: 0 = deferred reflection (Phase 2) still owed, 1 = captured.
  phase2Complete: number
  // Timestamps
  /** When a planned trade was activated into an open position (null if never activated). */
  openedAt: number | null
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
  exitPrice: number // encoded integer (Math.round(float × 10^(pipDecimal+1)))
  exitTime: number // UTC ms
  exitReason: ExitReason
  maePips?: number // tenths (user pips × 10)
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

/**
 * Phase-1 minimal close (two-phase logging). Records only the exit facts; the
 * honesty review, rules-broken checklist, MAE/MFE and reflection are deferred to
 * Phase 2 via the Review-screen reflection queue. The trade is left with
 * `phase_2_complete = 0`. Used when `pre_trade.fast_path_enabled` is on.
 */
export interface CloseMinimalInput {
  tradeId: string
  exitPrice: number // encoded integer (Math.round(float × 10^(pipDecimal+1)))
  exitTime: number // UTC ms
  exitReason: ExitReason
}

/**
 * Phase-2 completion (two-phase logging). Supplies the deferred reflection for a
 * trade that was minimally closed, and sets `phase_2_complete = 1`. The honesty
 * Y/N fields remain required — the gate moved, the honesty did not.
 */
export interface CompletePhase2Input {
  tradeId: string
  followedPlanExactly: boolean
  planChangesDescription?: string
  slMoved: boolean
  slMovedReason?: string
  enteredBeforeMss: boolean
  rulesBroken: string[]
  maePips?: number // tenths (user pips × 10)
  mfePips?: number
  postCalmScore: number
  whatIDidRight?: string
  whatIDidWrong?: string
  tags?: string[]
}

export interface PartialCloseInput {
  tradeId: string
  closeLots: number // stored integer (lots × 100)
  exitPrice: number // encoded integer (Math.round(float × 10^(pipDecimal+1)))
  exitTime: number // UTC ms
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
  preUrgencyScore: number
  phase2Complete: number
  grade: TradeGrade | null
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
  grade: TradeGrade | null
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
  adherencePct: number // 0-100, or -1 meaning no trades that day
}

/**
 * User-configurable thresholds for the pre-trade psychology nudges (CLAUDE.md
 * §2.11 — every behavioural preference is configurable). Stored as one JSON value
 * under the `pretrade_nudges` setting key. These drive advisory, NON-blocking
 * nudges in the New Trade panel; the rules engine remains the only thing that
 * blocks (CLAUDE.md §2.1).
 */
export interface PreTradeNudgeConfig {
  /** Tilt watch: warn when the account is on a losing run. */
  tilt: {
    enabled: boolean
    /** Consecutive losing trades that trip the nudge (advisory; sits below any hard loss-stop rule). */
    lossRun: number
  }
  /** Urgency check: warn when this-account's win-rate is materially worse at high urgency. */
  urgency: {
    enabled: boolean
    /** Urgency score (1–10) at or above which the check applies. */
    level: number
  }
}

/**
 * Point-in-time psychology signals for the New Trade panel, computed from the
 * account's own closed-trade history. The renderer turns these into calm,
 * mentor-voice nudges shown BEFORE the click. Advisory only — never blocks.
 */
export interface PreTradeSignals {
  tilt: {
    enabled: boolean
    /** Configured loss-run threshold. */
    lossRun: number
    /** Current consecutive-loss streak (most-recent closed trades). */
    currentLossStreak: number
  }
  urgency: {
    enabled: boolean
    /** Configured urgency threshold. */
    level: number
    /** Win-rate (%) on trades logged below `level`. */
    lowWinRatePct: number
    /** Win-rate (%) on trades logged at or above `level`. */
    highWinRatePct: number
    /** Trades in the low-urgency bucket. */
    lowSample: number
    /** Trades in the high-urgency bucket. */
    highSample: number
    /** True when both buckets are large enough and the gap is material. */
    sufficient: boolean
  }
}

/**
 * One live-detection breach surfaced on the Dashboard "Live discipline" card
 * (Wave 4, docs/broker-integration.md §5). Sourced from the `rule_violations`
 * rows the ingest service writes with `outcome = 'detected_live'` — a real-time
 * rule breach on a live broker position (stop widened, target cut, size
 * increased, over-trade, outside-killzone, or a fill past the circuit breaker).
 * These are DETECTIONS, not blocks — Cairn cannot stop an order already live.
 */
export interface LiveWarningItem {
  /** `rule_violations.id`. */
  id: string
  /** The live trade the breach is recorded against (null only if the FK was cleared). */
  tradeId: string | null
  /** Engine rule key the breach maps to (e.g. `no_sl_widening`). */
  ruleKey: string
  /** Broker symbol the breach concerns, resolved via the trade's pair; null if unresolved. */
  symbol: string | null
  /** Machine-written explanation of what diverged (from `context_json.detail`). */
  detail: string
  /** When the breach was detected (UTC ms). */
  createdAt: number
}

// Composite performance score (Zella-Score style) — 0-100, alongside Discipline.
export interface CompositeScoreComponents {
  winRate: number // 0-100 sub-score
  profitFactor: number // 0-100
  avgWinLoss: number // 0-100
  consistency: number // 0-100
  discipline: number // 0-100
}

export interface CompositeScore {
  score: number // 0-100 overall (integer)
  components: CompositeScoreComponents
  sampleSize: number
  sufficient: boolean // false when fewer than the minimum rated trades
}

export interface DashboardStats {
  disciplineScore: number
  disciplineWindow: number
  compositeScore: CompositeScore
  ruleBreakdown: { ruleKey: string; count: number }[]
  rollingExpectancy: number // avg pnlR ×100 of last 20 closed trades
  expectancySpark: number[] // pnlR ×100 values, oldest first
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
  advancedMetrics: AdvancedMetrics
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

export type DatePreset = 'today' | '7d' | '30d' | 'this_month' | 'last_month' | 'all' | 'custom'

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
  totalCount: number // reviewed trades that week (clean + dirty); unreviewed excluded
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

// ── Advanced performance metrics (Sharpe/Sortino/drawdown/Kelly/SQN/etc.) ──
// electron/services/analytics/advanced-metrics.ts is the source of truth for
// how each of these is computed. Every metric follows the same contract:
//   - `sufficient` gates on the metric's minimum sample size.
//   - `value` is null whenever `sufficient` is false, and may independently
//     be null when the sample is large enough but the ratio is
//     mathematically undefined (e.g. zero variance, zero losses). Both cases
//     render the same way in the UI ("—" + an explanatory tooltip).
export interface MetricResult<T> {
  value: T | null
  sufficient: boolean
}

export interface DrawdownMetric {
  peakToTroughCents: number // non-negative
  pctOfPeakBps: number // % of (starting balance + peak-at-the-time), 0-10000
  durationDays: number // peak date -> trough date, non-negative
}

export interface ExtremeTrade {
  cents: number
  r: number // R × 100
}

export interface AdvancedMetrics {
  sharpeRatioX100: MetricResult<number> // annualized, ×100 (185 = 1.85)
  sortinoRatioX100: MetricResult<number> // annualized, ×100
  maxDrawdown: MetricResult<DrawdownMetric>
  recoveryFactorX100: MetricResult<number> // net profit / max drawdown, ×100
  kellyPctBps: MetricResult<number> // clamped to [-10000, 10000]
  sqnX100: MetricResult<number> // System Quality Number, ×100
  dayConsistencyBps: MetricResult<number> // 0-10000; higher = more evenly spread
  largestWin: MetricResult<ExtremeTrade>
  largestLoss: MetricResult<ExtremeTrade>
  stddevRX100: MetricResult<number> // spread of R outcomes, always >= 0
  avgHoldMinutesWinners: MetricResult<number>
  avgHoldMinutesLosers: MetricResult<number>
}

// ── Derived analytics (Wave 2 item 2)
export interface DowSummaryRow {
  dow: number // 0 = Sunday
  n: number
  winRateBps: number // 0–10000
  expectancyR: number // R × 100, integer
  netPnlCents: number // integer cents
}

export interface ProfitFactorResult {
  valueTimes100: number // profit-factor × 100, integer; 0 when no trades/no winners
  infinite: boolean // true when grossLossR == 0 && grossWinR > 0
  grossWinR: number // sum of winning pnlR values (R × 100)
  grossLossR: number // sum of abs(losing pnlR) values (R × 100)
}

export interface DerivedStats {
  expectancyR: number // R × 100, integer (decimal.js result)
  expectancySpark: number[] // rolling 10-trade window over last 20, oldest first
  profitFactor: ProfitFactorResult
  dowSummary: DowSummaryRow[]
  timeOfDayHeatmap: HourDayCell[] // reuses existing type
  rDistribution: RDistributionBucket[] // reuses existing type
  advancedMetrics: AdvancedMetrics
}

// ── Local insight engine (Wave 2 item 3)
export type InsightSeverity = 'high' | 'medium' | 'low'

export interface Insight {
  id: string // slug, e.g. 'urgency-hurts' — stable, used for dismissal key
  severity: InsightSeverity
  title: string
  body: string // complete, ready-to-display copy
  sampleSize: number // number of trades the insight is based on
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

// ── Notebook (Wave 2 item 17) ─────────────────────────────────────────────────
export interface NotebookEntry {
  id: string
  accountId: string | null
  title: string
  content: string // markdown
  template: string | null
  pinned: number // 0/1
  version: number
  createdAt: number
  updatedAt: number
}

export interface NotebookEntrySummary {
  id: string
  accountId: string | null
  title: string
  template: string | null
  pinned: number
  updatedAt: number
  preview: string // short plain-text preview of the content
}

export interface CreateNotebookEntryInput {
  title: string
  content?: string
  template?: string | null
  accountId?: string | null
}

export interface UpdateNotebookEntryInput {
  id: string
  title?: string
  content?: string
  pinned?: boolean
  accountId?: string | null
}

export interface NotebookSearchInput {
  query: string
  accountId?: string | null
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
  dailyTime: string // HH:MM UTC
  backupOnClose: boolean
}

// ── Broker Statement Import (Wave 3 items 18–20) ─────────────────────────────

/**
 * One OHLC candle (or tick) within a trade's open→close window.
 * Used by the MAE/MFE auto-compute (see electron/services/mae-mfe.ts).
 * Prices are raw decimal strings — never floats — so the math stays exact.
 */
export interface PriceCandle {
  ts: number // UTC ms
  high: string // raw price string
  low: string // raw price string
}

/** One partial-close event within an import candidate. */
export interface ImportPartialExit {
  externalRef: string // e.g. "mt5_deal_10000004" / "ctrader_pos_55555555_p0"
  exitTime: number // UTC ms
  exitPrice: string // raw float string from the broker
  volumeLots: string // raw lots string for this partial
  pnlAmount: string // gross profit for this partial (account currency)
}

/**
 * A single trade candidate produced by any import adapter (MT5, cTrader, etc.).
 * Adapters set `pairId: null`; the IPC preview handler resolves it against
 * the local pairs table. Commit rejects if any pairId is still null.
 */
export interface ImportCandidate {
  externalRef: string // globally unique dedupe key, e.g. "mt5_order_11111111"
  brokerTradeId: string // raw broker ID without prefix, e.g. "11111111"
  symbol: string // raw broker symbol, e.g. "EURUSD"
  pairId: string | null // null = unresolved (no matching pair in Cairn)
  direction: TradeDirection
  entryTime: number // UTC ms
  entryPrice: string // raw float string
  exitTime: number | null // null = still open
  exitPrice: string | null
  stopLoss: string | null // null = not set / "0.00000"
  takeProfit: string | null
  volumeLots: string // total entry lots (raw string)
  pnlAmount: string // total gross P&L (account currency string)
  commission: string // total commission
  swap: string // total swap
  status: 'open' | 'closed'
  partialExits: ImportPartialExit[]
  /**
   * Optional OHLC/tick series spanning open→close, when the broker export
   * carries per-minute or per-tick price data. Present → the committer
   * auto-computes MAE/MFE; absent → both stay null (no interpolation).
   */
  priceSeries?: PriceCandle[]
}

/** A row the parser couldn't fully parse. NOT silently dropped — surfaces in preview. */
export interface ImportParseError {
  section: string // adapter-specific section name, e.g. "deals", "closed positions"
  rowIndex: number
  rawContent: string
  reason: string
}

/** Preview result returned by any `import:preview*` handler. */
export interface ImportPreview {
  candidates: ImportCandidate[]
  skippedCount: number // duplicates already in the local DB
  unresolvedSymbols: string[] // symbols with no matching pair
  parseErrors: ImportParseError[]
}

/** Shared commit result returned by any `import:commit*` handler. */
export interface ImportCommitResult {
  imported: number // new trade rows inserted
  partials: number // new trade_partials rows inserted
  skipped: number // duplicates detected and skipped
  // existing live-streamed rows settled by this statement (docs/broker-integration.md §6);
  // optional — undefined for non-reconciling callers (e.g. commitCandidates directly)
  reconciled?: number
}

// ── MT5 adapter types ─────────────────────────────────────────────────────────

/** @deprecated Use ImportPartialExit */
export type Mt5PartialExit = ImportPartialExit
/** @deprecated Use ImportCandidate */
export type Mt5TradeCandidate = ImportCandidate
/** @deprecated Use ImportParseError */
export type Mt5ParseError = ImportParseError
/** @deprecated Use ImportPreview */
export type Mt5ImportPreview = ImportPreview
/** @deprecated Use ImportCommitResult */
export type Mt5CommitResult = ImportCommitResult

export interface Mt5PreviewInput {
  html: string
  accountId: string
}

export interface Mt5CommitInput {
  html: string
  accountId: string
  /** MT5 symbol → Cairn pairId for every unresolved symbol. */
  symbolMap: Record<string, string>
  /** Setup to assign to all imported trades. */
  defaultSetupId: string
}

// ── Playbook types ────────────────────────────────────────────────────────────

/** A saved trade-template per account. One tap pre-fills the New Trade panel. */
export interface Playbook {
  id: string
  accountId: string
  name: string
  pairId: string | null
  setupId: string
  killzoneId: string | null
  requiredConfluenceMd: string | null
  /** Risk % as integer basis points: 1.5% → 150. null = use account default. */
  defaultRiskPct: number | null
  /** Chip id from INVALIDATION_CHIPS (e.g. "below-ob"), or null for free-text. */
  defaultInvalidationChip: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  version: number
}

export interface CreatePlaybookInput {
  accountId: string
  name: string
  setupId: string
  pairId?: string | null
  killzoneId?: string | null
  requiredConfluenceMd?: string | null
  defaultRiskPct?: number | null
  defaultInvalidationChip?: string | null
}

export interface UpdatePlaybookInput {
  id: string
  name?: string
  setupId?: string
  pairId?: string | null
  killzoneId?: string | null
  requiredConfluenceMd?: string | null
  defaultRiskPct?: number | null
  defaultInvalidationChip?: string | null
}

/** Per-playbook performance row for the Analytics "Setups" tab. */
export interface PlaybookRow {
  playbookId: string
  playbookName: string
  /** Number of trades that matched this playbook's pair + setup + killzone criteria. */
  n: number
  winRateBps: number
  expectancyR: number
}

export interface PlaybookStats {
  byPlaybook: PlaybookRow[]
}

// ── cTrader adapter types ─────────────────────────────────────────────────────

export interface CTraderPreviewInput {
  html: string
  accountId: string
}

export interface CTraderCommitInput {
  html: string
  accountId: string
  /** cTrader symbol → Cairn pairId for every unresolved symbol. */
  symbolMap: Record<string, string>
  /** Setup to assign to all imported trades. */
  defaultSetupId: string
}

// ── TradingView adapter types ─────────────────────────────────────────────────

export interface TvPreviewInput {
  csv: string
  accountId: string
}

export interface TvCommitInput {
  csv: string
  accountId: string
  /** TradingView symbol → Cairn pairId for every unresolved symbol. */
  symbolMap: Record<string, string>
  /** Setup to assign to all imported trades. */
  defaultSetupId: string
}

export * from './procedures'
