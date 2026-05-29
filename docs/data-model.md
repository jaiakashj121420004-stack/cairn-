> Split from CLAUDE.md — Section 5: DATA MODEL

## 5. DATA MODEL

### 5.1 Schema Overview

All tables use:
- `id` — UUID v7 (time-ordered) as TEXT primary key.
- `created_at` / `updated_at` — UNIX millisecond timestamps as INTEGER.
- `deleted_at` — soft delete timestamp, nullable.

All monetary values stored as INTEGER (minor units — cents/pips × 10) to avoid floating-point errors. Converted to display format via formatters.

All enums stored as TEXT with CHECK constraints. Enum values defined once in `shared/types/enums.ts`.

### 5.2 Tables

#### 5.2.1 `settings`
Key-value store for global app settings.
```
key          TEXT PK
value        TEXT (JSON)
updated_at   INTEGER
```
Keys include: `theme`, `default_pair`, `default_risk_pct`, `backup_folder_path`, `backup_schedule`, `timezone`, `week_starts_on`, `onboarding_completed`.

#### 5.2.2 `prop_firms`
User-configurable firms. Pre-seeded with "Custom" entry. User can add more.
```
id                   TEXT PK
name                 TEXT
default_step_count   INTEGER (1, 2, or 3)
notes                TEXT NULL
created_at           INTEGER
updated_at           INTEGER
deleted_at           INTEGER NULL
```

#### 5.2.3 `account_templates`
Reusable templates for account configurations (e.g., "2-step 5K 4%DD/8%Total").
```
id                         TEXT PK
name                       TEXT
prop_firm_id               TEXT FK → prop_firms.id
step_count                 INTEGER
account_size_cents         INTEGER
leverage                   INTEGER (e.g., 30, 50, 100)
daily_drawdown_type        TEXT ('percent_of_balance' | 'percent_of_equity' | 'fixed_amount')
daily_drawdown_value       INTEGER (basis points if percent, cents if fixed)
total_drawdown_type        TEXT (same enum)
total_drawdown_value       INTEGER
drawdown_basis             TEXT ('initial_balance' | 'high_water_mark' | 'previous_day_close')
profit_target_phase_1_pct  INTEGER (basis points, e.g., 800 = 8%)
profit_target_phase_2_pct  INTEGER NULL
profit_target_phase_3_pct  INTEGER NULL
min_trading_days           INTEGER NULL
max_trading_days           INTEGER NULL
weekend_holding_allowed    INTEGER (0/1)
news_trading_allowed       INTEGER (0/1)
consistency_rule_pct       INTEGER NULL (e.g., max single-day profit as % of total)
notes                      TEXT NULL
is_archived                INTEGER (0/1)
created_at                 INTEGER
updated_at                 INTEGER
```

#### 5.2.4 `accounts`
Each challenge attempt = one account record.
```
id                         TEXT PK
display_name               TEXT (user-assigned, e.g., "Attempt 47")
template_id                TEXT FK → account_templates.id NULL (nullable if fully custom)
prop_firm_id               TEXT FK → prop_firms.id
step_count                 INTEGER
current_phase              INTEGER (1, 2, 3, or 0 for funded)
account_size_cents         INTEGER
leverage                   INTEGER
daily_drawdown_type        TEXT
daily_drawdown_value       INTEGER
total_drawdown_type        TEXT
total_drawdown_value       INTEGER
drawdown_basis             TEXT
profit_target_pct          INTEGER (for current phase)
min_trading_days           INTEGER NULL
max_trading_days           INTEGER NULL
weekend_holding_allowed    INTEGER
news_trading_allowed       INTEGER
consistency_rule_pct       INTEGER NULL
challenge_cost_cents       INTEGER (fee paid for this account)
start_date                 INTEGER
status                     TEXT ('active' | 'passed' | 'failed' | 'paused' | 'retired')
end_date                   INTEGER NULL
end_reason                 TEXT NULL
peak_equity_cents          INTEGER
current_equity_cents       INTEGER
notes                      TEXT NULL
created_at                 INTEGER
updated_at                 INTEGER
deleted_at                 INTEGER NULL
```

#### 5.2.5 `account_rules`
Per-account customizable trading rules (user's own rules, separate from firm rules).
```
id            TEXT PK
account_id    TEXT FK → accounts.id
rule_key      TEXT (see enum below)
enabled       INTEGER (0/1)
value         TEXT (JSON — rule-specific config)
priority      INTEGER (display order)
created_at    INTEGER
updated_at    INTEGER
```

**Built-in rule keys (seeded per account):**
- `max_trades_per_day` → `{ value: 2 }`
- `max_risk_per_trade_pct` → `{ value_bps: 100 }` (1%)
- `max_daily_loss_pct` → `{ value_bps: 200 }` (2%)
- `min_rr_ratio` → `{ value: 2.0 }`
- `require_mss_confirmation` → `{ enabled: true }`
- `require_invalidation_text` → `{ enabled: true, min_chars: 20 }`
- `no_sl_widening` → `{ enabled: true }`
- `cooldown_after_loss_minutes` → `{ value: 30 }`
- `daily_stop_after_losses` → `{ value: 2 }` (stop after N consecutive losses)
- `killzone_only` → `{ enabled: true, zones: ["london", "ny_am"] }`
- `require_htf_bias_logged` → `{ enabled: true }`
- `max_overall_daily_loss_hard_stop_pct` → `{ value_bps: 300 }` (3% hard lock)

All user-editable in Settings > Rules per account. All enforced by the rules engine.

#### 5.2.6 `pairs`
User-customizable instruments.
```
id              TEXT PK
symbol          TEXT UNIQUE (e.g., "EURUSD")
display_name    TEXT (e.g., "EUR/USD")
asset_class     TEXT ('forex' | 'indices' | 'commodities' | 'crypto' | 'stocks' | 'other')
pip_decimal     INTEGER (4 for EURUSD, 2 for JPY pairs, etc.)
pip_value_per_standard_lot_cents INTEGER (e.g., 1000 for EURUSD = $10/pip × 100 for cents)
correlated_with TEXT NULL (JSON array of symbols for SMT, e.g., ["GBPUSD", "USDX"])
active          INTEGER (0/1)
display_order   INTEGER
notes           TEXT NULL
created_at      INTEGER
updated_at      INTEGER
```
Seeded with: EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD, XAUUSD, US30, NAS100, SPX500, BTCUSD. User can add/edit/archive.

#### 5.2.7 `setups`
User-customizable setup types.
```
id             TEXT PK
name           TEXT (e.g., "FVG", "OB", "Breaker", "Silver Bullet")
category       TEXT (e.g., "ICT", "SMC", "Custom")
description    TEXT NULL
color          TEXT (hex, for chart/tag display)
active         INTEGER (0/1)
display_order  INTEGER
created_at     INTEGER
updated_at     INTEGER
```
Seeded with: FVG, Order Block, Breaker Block, Mitigation Block, Judas Swing, SMT Divergence, Silver Bullet, Liquidity Sweep Reversal, Turtle Soup, Power of Three.

#### 5.2.8 `killzones`
User-customizable time windows.
```
id              TEXT PK
name            TEXT (e.g., "London", "NY AM", "Silver Bullet AM")
start_time_utc  TEXT (HH:MM format)
end_time_utc    TEXT
color           TEXT (hex)
active          INTEGER (0/1)
display_order   INTEGER
notes           TEXT NULL
created_at      INTEGER
updated_at      INTEGER
```
Seeded with: Asia (00:00-05:00 UTC), London (07:00-10:00 UTC), NY AM (12:00-15:00 UTC), NY PM Silver Bullet (19:00-20:00 UTC), London Silver Bullet (09:00-10:00 UTC). Times are UTC; display converted to user's timezone.

#### 5.2.9 `sessions`
A trading session = one session of pre-market bias logging. Typically one per day.
```
id                  TEXT PK
account_id          TEXT FK → accounts.id
session_date        TEXT (YYYY-MM-DD)
daily_bias          TEXT ('bullish' | 'bearish' | 'neutral')
daily_bias_reason   TEXT
h4_bias             TEXT
h4_bias_reason      TEXT
h1_bias             TEXT
h1_bias_reason      TEXT
htf_liquidity_target TEXT NULL
dxy_bias            TEXT NULL ('bullish' | 'bearish' | 'neutral' | 'n/a')
smt_notes           TEXT NULL
session_plan        TEXT NULL (free text — what am I looking to do today)
key_levels          TEXT NULL (JSON array of price levels)
created_at          INTEGER
updated_at          INTEGER
locked_at           INTEGER NULL (once set, session context can't be retroactively edited)
```

#### 5.2.10 `trades`
The core record.
```
id                               TEXT PK
account_id                       TEXT FK → accounts.id
session_id                       TEXT FK → sessions.id NULL
pair_id                          TEXT FK → pairs.id
setup_id                         TEXT FK → setups.id
killzone_id                      TEXT FK → killzones.id NULL
mode                             TEXT ('live' | 'sim' | 'backtest')
direction                        TEXT ('long' | 'short')
status                           TEXT ('planned' | 'open' | 'closed' | 'cancelled')

-- Plan (filled pre-trade)
entry_price                      INTEGER (price × 10^pip_decimal)
stop_loss_price                  INTEGER
take_profit_price                INTEGER
sl_pips                          INTEGER (computed, tenths)
rr_ratio                         INTEGER (×100, so 2.0 = 200)
lot_size                         INTEGER (×100, so 0.50 lots = 50)
risk_amount_cents                INTEGER
risk_pct_bps                     INTEGER (basis points)
planned_invalidation             TEXT (required, min 20 chars)

-- Context
mss_confirmed                    INTEGER (0/1)
htf_bias_aligned                 INTEGER (0/1)
dxy_aligned                      INTEGER NULL (0/1)
smt_confirmed                    INTEGER NULL (0/1)
correlated_pair_used             TEXT NULL

-- Emotional state (pre-trade)
pre_calm_score                   INTEGER (1-10)
pre_urgency_score                INTEGER (1-10)
pre_need_score                   INTEGER (1-10)

-- Execution (filled post-trade)
actual_entry_price               INTEGER NULL
actual_entry_time                INTEGER NULL
exit_price                       INTEGER NULL
exit_time                        INTEGER NULL
exit_reason                      TEXT NULL ('tp' | 'sl' | 'manual' | 'be' | 'partial_full' | 'timeout')
pnl_cents                        INTEGER NULL
pnl_r                            INTEGER NULL (×100)
pnl_pct_bps                      INTEGER NULL
max_drawdown_during_trade_pct_bps INTEGER NULL
mae_pips                         INTEGER NULL (max adverse excursion)
mfe_pips                         INTEGER NULL (max favorable excursion)
duration_minutes                 INTEGER NULL

-- Honesty & rules
followed_plan_exactly            INTEGER NULL (0/1)
plan_changes_description         TEXT NULL
sl_moved                         INTEGER NULL (0/1)
sl_moved_reason                  TEXT NULL
tp_moved                         INTEGER NULL (0/1)
entered_before_mss               INTEGER NULL (0/1)
revenge_trade_flag               INTEGER NULL (0/1, auto-computed if entered within cooldown window after loss)
rules_broken                     TEXT NULL (JSON array of rule_key values)
is_clean                         INTEGER NULL (0/1, computed: rules_broken is empty AND followed_plan_exactly)

-- Post-trade reflection
post_calm_score                  INTEGER NULL (1-10)
what_i_did_right                 TEXT NULL
what_i_did_wrong                 TEXT NULL
tags                             TEXT NULL (JSON array)

-- v2 prep (unused in v1, set to NULL)
broker_source                    TEXT NULL
broker_trade_id                  TEXT NULL
imported_at                      INTEGER NULL

created_at                       INTEGER
updated_at                       INTEGER
deleted_at                       INTEGER NULL
```

#### 5.2.11 `trade_screenshots`
```
id              TEXT PK
trade_id        TEXT FK → trades.id
kind            TEXT ('htf_context' | 'entry' | 'exit' | 'review' | 'other')
filename        TEXT (path relative to screenshots/ folder)
caption         TEXT NULL
created_at      INTEGER
```

#### 5.2.12 `trade_partials`
The single canonical partial-close table. Migration 0004 consolidated the former
float `partial_closes` table into this one — see the v1.1 Additions section below.
All money/pip columns are integer-encoded per §2.5/§19.5.
```
id                 TEXT PK
trade_id           TEXT FK → trades.id
close_percent_bps  INTEGER (basis points; 50.0% → 5000)
close_lots         INTEGER NULL (×100; e.g. 0.50 lots → 50)
exit_price         INTEGER (price tick; round(realPrice × 10^(pipDecimal+1)))
exit_time          INTEGER (UTC ms)
pnl_r              INTEGER NULL (R × 100; 1.5R → 150)
pnl_cents          INTEGER NULL (integer cents)
notes              TEXT NULL
created_at         INTEGER
```

#### 5.2.13 `rule_violations`
Historical log of every attempted or committed rule violation.
```
id                TEXT PK
account_id        TEXT FK → accounts.id
trade_id          TEXT FK → trades.id NULL
rule_key          TEXT
severity          TEXT ('warning' | 'blocking' | 'logged')
outcome           TEXT ('blocked' | 'user_overrode' | 'logged_post_hoc')
context_json      TEXT (JSON — what the rule config was, what the user tried)
created_at        INTEGER
```

#### 5.2.14 `reviews`
Weekly/monthly review entries. Mandatory weekly ritual (v2).
```
id                  TEXT PK
account_id          TEXT NULL (null = cross-account review)
period_type         TEXT ('weekly' | 'monthly' | 'ad_hoc')
period_start        TEXT (YYYY-MM-DD)
period_end          TEXT
top_mistakes        TEXT (JSON array of strings)
best_trade_id       TEXT NULL FK
worst_trade_id      TEXT NULL FK
lesson_next_period  TEXT
rule_focus          TEXT NULL (rule_key to focus on next period)
adherence_score     INTEGER (0-100)
notes               TEXT NULL
created_at          INTEGER
```

#### 5.2.15 `cooldowns`
Active cooldowns (tilt detection).
```
id              TEXT PK
account_id      TEXT FK → accounts.id
reason          TEXT ('post_loss' | 'consecutive_losses' | 'daily_loss_hit' | 'rule_violation' | 'manual')
started_at      INTEGER
expires_at      INTEGER
cleared_at      INTEGER NULL
cleared_by      TEXT NULL ('timer' | 'user_acknowledgment')
acknowledgment_text TEXT NULL
```

#### 5.2.16 `backup_log`
```
id              TEXT PK
kind            TEXT ('auto_local' | 'manual' | 'scheduled_cloud')
destination     TEXT
filesize_bytes  INTEGER
status          TEXT ('success' | 'failed')
error_message   TEXT NULL
created_at      INTEGER
```

### 5.3 Indexes

```sql
CREATE INDEX idx_trades_account_date ON trades(account_id, created_at);
CREATE INDEX idx_trades_session ON trades(session_id);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_mode ON trades(mode);
CREATE INDEX idx_trades_is_clean ON trades(is_clean);
CREATE INDEX idx_rule_violations_account ON rule_violations(account_id, created_at);
CREATE INDEX idx_sessions_account_date ON sessions(account_id, session_date);
CREATE INDEX idx_cooldowns_active ON cooldowns(account_id, expires_at, cleared_at);
```

### 5.4 Migration Strategy

- Use Drizzle Kit for migrations.
- Each migration numbered, committed, never edited.
- On app launch, `db.migrate()` runs pending migrations automatically.
- Before migrations run, a snapshot backup is created in `backups/pre-migration/`.
- If migration fails, app refuses to launch and offers restore-from-snapshot UI.

### 5.5 Seed Data

On first launch:
1. Insert default `settings` (theme = system, timezone = OS detected, etc.).
2. Insert default `pairs`, `setups`, `killzones`.
3. Insert "Custom" `prop_firm`.
4. Trigger first-run onboarding wizard.

## v1.1 Additions

### Leverage, daily-trade-limit, screenshot, opened_at
- `accounts.leverage`, `accounts.daily_trade_limit`, `accounts.max_daily_loss_pct`
  added (migration 0002; `daily_trade_limit`/`max_daily_loss_pct` are nullable —
  null means "no limit enforced").
- `trades.screenshot_path` (migration 0002) and `trades.opened_at` (migration 0003).

### Partial-close table consolidation (migration 0004)
v1.1 briefly carried **two** partial-close tables, which violated §2.5/§19.5
(money/pips must be integer, never `real`/`float`):

- `trade_partials` (integer-encoded) — created in 0001 but **never used by any
  code** (dead table).
- `partial_closes` (`real` columns: `close_percent`, `exit_price`, `pnl_r`,
  `pnl_usd`) — created in 0002, the table the Close-Trade flow actually wrote to
  and read from.

Migration **0004** consolidates them into a single integer-encoded
`trade_partials` (shape in §5.2.12). It drops the dead legacy table (guarded by
an empty-table assertion), recreates `trade_partials` integer-encoded, copies and
converts every `partial_closes` row, asserts the row counts match, then drops
`partial_closes`. Per-column conversions (no dollar-vs-pip ambiguity — each
column has one unit, each target encoding already used elsewhere):

| `partial_closes` (real) | → `trade_partials` (integer) | conversion |
|---|---|---|
| `close_percent` (%) | `close_percent_bps` | `round(× 100)` |
| `exit_price` (integer-valued tick in a real col) | `exit_price` | `round()` |
| `pnl_r` (R) | `pnl_r` | `round(× 100)` |
| `pnl_usd` ($) | `pnl_cents` | `round(× 100)` |
| `close_lots` (×100) | `close_lots` | unchanged |

Forward conversion, value-reversibility, and the safety abort are covered in
`tests/integration/migrations.test.ts` (with a `fast-check` property test on the
conversion codec). Rounding is half-away-from-zero to match SQLite's `round()`.

### Migration journal fix
Production applies migrations via Drizzle's **journal-driven** `migrate()`
(`electron/db/index.ts`). `meta/_journal.json` had been left listing only 0001
and 0002, so `0003_opened_at.sql` never ran in production. The journal now lists
0001–0004, and `tests/integration/migrations.test.ts` asserts every migration
file is journaled in order to prevent recurrence.
