// All string-literal union types used across main and renderer processes.
// Defined once here; imported via @shared/types/enums in both environments.

export type TradeMode = 'live' | 'sim' | 'backtest'

export type TradeDirection = 'long' | 'short'

export type TradeStatus = 'planned' | 'open' | 'closed' | 'cancelled'

export type ExitReason = 'tp' | 'sl' | 'manual' | 'be' | 'partial_full' | 'timeout'

export type DailyBias = 'bullish' | 'bearish' | 'neutral'

export type SessionState = 'idle' | 'active' | 'paused' | 'locked'

export type AccountStatus = 'active' | 'passed' | 'failed' | 'paused' | 'retired'

export type DrawdownType = 'percent_of_balance' | 'percent_of_equity' | 'fixed_amount'

export type DrawdownBasis = 'initial_balance' | 'high_water_mark' | 'previous_day_close'

export type AssetClass = 'forex' | 'indices' | 'commodities' | 'crypto' | 'stocks' | 'other'

export type RuleSeverity = 'blocking' | 'warning' | 'logged'

// 'detected_live' — a non-blocking, real-time breach observed on a live broker
// position (Wave 4 live detection); see docs/broker-integration.md §5.
export type RuleOutcome = 'blocked' | 'user_overrode' | 'logged_post_hoc' | 'detected_live'

export type CooldownReason =
  | 'post_loss'
  | 'consecutive_losses'
  | 'daily_loss_hit'
  | 'rule_violation'
  | 'manual'

export type BackupKind = 'auto_local' | 'manual' | 'scheduled_cloud'

export type ReviewPeriod = 'weekly' | 'monthly' | 'ad_hoc'

export type ScreenshotKind = 'htf_context' | 'entry' | 'exit' | 'review' | 'other'

export type RuleCategory = 'risk' | 'process' | 'timing' | 'behavior'
