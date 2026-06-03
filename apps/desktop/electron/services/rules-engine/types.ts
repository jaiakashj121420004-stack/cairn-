import type {
  Account,
  CooldownReason,
  DailyBias,
  RuleCategory,
  RuleOutcome,
  RuleSeverity,
  SessionState,
  TradeDirection,
} from '../../../shared/types/index'
import type { ZodTypeAny } from 'zod'

export interface AccountRuleConfig {
  id: string
  accountId: string
  ruleKey: string
  enabled: number
  value: string
  priority: number
  createdAt: number
  updatedAt: number
}

export interface SessionRecord {
  id: string
  accountId: string
  sessionDate: string
  dailyBias: DailyBias | null
  h4Bias: DailyBias | null
  h1Bias: DailyBias | null
  dxyBias: DailyBias | 'n/a' | null
  smtNotes: string | null
  lockedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface TradeRecord {
  id: string
  accountId: string
  sessionId: string | null
  pairId: string
  setupId: string
  killzoneId: string | null
  mode: 'live' | 'sim' | 'backtest'
  direction: TradeDirection
  status: 'planned' | 'open' | 'closed' | 'cancelled'
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
  dxyAligned: number | null
  smtConfirmed: number | null
  preCalmScore: number
  preUrgencyScore: number
  preNeedScore: number
  exitPrice: number | null
  exitTime: number | null
  exitReason: string | null
  pnlCents: number | null
  pnlR: number | null
  createdAt: number
  updatedAt: number
}

export interface CooldownRecord {
  id: string
  accountId: string
  reason: CooldownReason
  startedAt: number
  expiresAt: number
  clearedAt: number | null
  clearedBy: 'timer' | 'user_acknowledgment' | null
  acknowledgmentText: string | null
}

export interface KillzoneRecord {
  id: string
  name: string
  startTimeUtc: string
  endTimeUtc: string
  active: number
}

export interface DraftTrade {
  accountId: string
  sessionId: string | null
  pairId: string
  setupId: string
  killzoneId: string | null
  direction: TradeDirection
  mode: 'live' | 'sim' | 'backtest'
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
  dxyAligned: number | null
  preCalmScore: number
  preUrgencyScore: number
  preNeedScore: number
  plannedLotSize?: number
  timestamp?: number
}

export interface TradeModification {
  field: 'stop_loss_price' | 'take_profit_price' | 'lot_size'
  currentValue: number
  newValue: number
}

export interface RuleContext {
  account: Account
  accountRules: AccountRuleConfig[]
  currentSession: SessionRecord | null
  tradeInProgress?: DraftTrade
  /** Mode of the trade being evaluated. Timing rules (killzone, weekend) skip for non-live. */
  mode: 'live' | 'sim' | 'backtest'
  tradeModification?: TradeModification
  tradeUnderModification?: TradeRecord
  tradesToday: TradeRecord[]
  recentTrades: TradeRecord[]
  now: number
  /** IANA timezone used to bucket "today" — the single day definition shared
   *  with the calendar (see services/time/trading-day.ts). Default
   *  America/New_York. */
  timeZone: string
  activeCooldowns: CooldownRecord[]
  killzones: KillzoneRecord[]
  tradingDaysCount?: number
}

export interface RuleEvaluation {
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

export interface Rule {
  key: string
  label: string
  description: string
  category: RuleCategory
  severity: RuleSeverity
  defaultConfig: Record<string, unknown>
  configSchema: ZodTypeAny
  isHardLock?: boolean
  evaluate(context: RuleContext, config: unknown): RuleEvaluation
}

export interface SessionStateDTO {
  state: SessionState
  lockedReason: string | null
  unlockAt: number | null
  activeCooldowns: CooldownRecord[]
}

export interface OverrideInput {
  accountId: string
  tradeId?: string
  ruleKey: string
  reason: string
  ack: string
}

export type { RuleSeverity, RuleOutcome, RuleCategory, SessionState }

export const OVERRIDE_ACK_PHRASE = 'OVERRIDE'
export const OVERRIDE_MIN_REASON_CHARS = 30
