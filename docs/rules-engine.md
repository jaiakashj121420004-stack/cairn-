> Split from CLAUDE.md — Section 6: RULES ENGINE

## 6. RULES ENGINE

### 6.1 Overview

The rules engine is the most important subsystem. It enforces discipline by evaluating rules at three checkpoints:

1. **Pre-trade gate** — before a trade can be submitted.
2. **Trade-modification gate** — when user tries to move SL/TP, add size, etc.
3. **Session gate** — account-level checks (daily loss, cooldowns, etc.).

### 6.2 Rule Types

Each rule implements this interface:

```typescript
interface Rule {
  key: string;                   // e.g., 'max_trades_per_day'
  label: string;                 // UI-displayed human name
  description: string;           // What it does, in plain English
  category: 'risk' | 'process' | 'timing' | 'behavior';
  severity: 'blocking' | 'warning' | 'logged';
  defaultConfig: Record<string, unknown>;
  configSchema: ZodSchema;       // For the settings UI
  evaluate(context: RuleContext): RuleEvaluation;
}

interface RuleContext {
  account: Account;
  accountRules: AccountRuleConfig[];
  currentSession: Session | null;
  tradeInProgress?: PartialTrade;
  tradesToday: Trade[];
  recentTrades: Trade[];         // last N trades
  now: number;                   // timestamp
  activeCooldowns: Cooldown[];
}

interface RuleEvaluation {
  passed: boolean;
  severity: 'blocking' | 'warning' | 'info';
  message: string;               // Shown to user
  details?: string;              // Expanded explanation
  canOverride: boolean;          // Can user force-override with typed acknowledgment?
  suggestedAction?: string;      // e.g., "Wait 12 more minutes."
}
```

### 6.3 Built-in Rules (v1)

Every rule is independently enable/disable-able per account.

**Risk Rules:**
- `max_risk_per_trade_pct` — computes risk from SL distance and lot size; blocks if >configured %.
- `max_daily_loss_pct` — sum of today's closed P&L; if >limit, session blocks.
- `max_overall_daily_loss_hard_stop_pct` — hard lock; even overrides disabled.
- `min_rr_ratio` — blocks if RR < configured.
- `position_size_matches_plan` — warns if actual lot size differs from calculated.

**Process Rules:**
- `require_mss_confirmation` — MSS checkbox must be checked pre-trade.
- `require_invalidation_text` — planned_invalidation must be filled with min chars.
- `require_htf_bias_logged` — session must have bias logged before any trade.
- `no_sl_widening` — if user tries to move SL against position, block.
- `require_killzone` — blocks entries outside configured killzones.
- `require_dxy_check` — warns if DXY bias not logged in session.

**Behavior Rules:**
- `max_trades_per_day` — hard cap.
- `cooldown_after_loss_minutes` — blocks new entries for N minutes after a loss.
- `daily_stop_after_losses` — session auto-locks after N consecutive losses.
- `no_revenge_trade_window` — flags/blocks trades taken within X min of a loss on same pair.
- `emotional_state_gate` — warns if pre_urgency > 7 or pre_need > 6, with typed acknowledgment to proceed.

**Timing Rules:**
- `weekend_holding_blocked` — blocks open trades into weekend if firm doesn't allow.
- `news_window_blocked` — v2 feature placeholder (disabled in v1).
- `min_trading_days_check` — shows progress toward min trading days for phase.

### 6.4 Evaluation Flow

**Pre-trade submit flow:**
```
1. Gather RuleContext.
2. Run all enabled rules in priority order.
3. Collect all evaluations.
4. If any blocking rule fails:
   a. Show blocking modal listing failed rules.
   b. If canOverride on all failed rules, show override UI (typed acknowledgment required).
   c. If any rule is non-overrideable (e.g., hard DD), no override possible.
5. If warnings only, show warning modal with "Proceed" / "Cancel" options.
6. If all passed, proceed to submit.
```

**All evaluations are logged** in `rule_violations` even if the rule passed-with-warning or user overrode. This builds the behavioral dataset.

### 6.5 Cooldown System

When triggered:
- Creates a row in `cooldowns` with `expires_at`.
- UI shows persistent countdown banner with minutes remaining.
- New trade submissions blocked until cleared.
- Cleared by: (a) timer expires, (b) user types the exact phrase "I am trading my plan, not my emotions" for the consecutive-losses cooldown (v2).

### 6.6 Override System

For rules with `canOverride: true`:
- Modal shows: rule name, why it's firing, current value vs. threshold.
- User must **type** (not click) the word `OVERRIDE`.
- A reason (min 30 chars) is required.
- Override is logged as a `rule_violation` with `outcome: 'user_overrode'`.
- Heavy visual feedback (crack animation on relevant UI elements).
- The trade is tagged `is_clean: false` permanently.

### 6.7 Hard Locks (Non-overrideable)

- Maven-style max-daily-drawdown hard stop.
- Post-violation 24-hour cooldown (v2).
- System locks that require app restart or cooldown expiry cannot be bypassed.

### 6.8 Session Lock State

The app has a global session state:
- `idle` — no session started today.
- `active` — session started, trades can be taken.
- `paused` — manually paused by user.
- `locked` — rule-triggered lock (e.g., daily loss hit). Only read-only views available until reset time.

Locked state visibly changes the UI:
- Dashboard shows a large "Session Locked" state.
- Trade entry disabled everywhere.
- Message explains which rule triggered it and when it unlocks.
