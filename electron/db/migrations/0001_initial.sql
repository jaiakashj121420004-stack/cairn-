CREATE TABLE `settings` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prop_firms` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `default_step_count` integer NOT NULL CHECK (`default_step_count` IN (1, 2, 3)),
  `notes` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `account_templates` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `prop_firm_id` text NOT NULL REFERENCES `prop_firms`(`id`),
  `step_count` integer NOT NULL CHECK (`step_count` IN (1, 2, 3)),
  `account_size_cents` integer NOT NULL,
  `leverage` integer NOT NULL,
  `daily_drawdown_type` text NOT NULL CHECK (`daily_drawdown_type` IN ('percent_of_balance', 'percent_of_equity', 'fixed_amount')),
  `daily_drawdown_value` integer NOT NULL,
  `total_drawdown_type` text NOT NULL CHECK (`total_drawdown_type` IN ('percent_of_balance', 'percent_of_equity', 'fixed_amount')),
  `total_drawdown_value` integer NOT NULL,
  `drawdown_basis` text NOT NULL CHECK (`drawdown_basis` IN ('initial_balance', 'high_water_mark', 'previous_day_close')),
  `profit_target_phase_1_pct` integer NOT NULL,
  `profit_target_phase_2_pct` integer,
  `profit_target_phase_3_pct` integer,
  `min_trading_days` integer,
  `max_trading_days` integer,
  `weekend_holding_allowed` integer NOT NULL CHECK (`weekend_holding_allowed` IN (0, 1)),
  `news_trading_allowed` integer NOT NULL CHECK (`news_trading_allowed` IN (0, 1)),
  `consistency_rule_pct` integer,
  `notes` text,
  `is_archived` integer NOT NULL DEFAULT 0 CHECK (`is_archived` IN (0, 1)),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `display_name` text NOT NULL,
  `template_id` text REFERENCES `account_templates`(`id`),
  `prop_firm_id` text NOT NULL REFERENCES `prop_firms`(`id`),
  `step_count` integer NOT NULL CHECK (`step_count` IN (1, 2, 3)),
  `current_phase` integer NOT NULL CHECK (`current_phase` IN (0, 1, 2, 3)),
  `account_size_cents` integer NOT NULL,
  `leverage` integer NOT NULL,
  `daily_drawdown_type` text NOT NULL CHECK (`daily_drawdown_type` IN ('percent_of_balance', 'percent_of_equity', 'fixed_amount')),
  `daily_drawdown_value` integer NOT NULL,
  `total_drawdown_type` text NOT NULL CHECK (`total_drawdown_type` IN ('percent_of_balance', 'percent_of_equity', 'fixed_amount')),
  `total_drawdown_value` integer NOT NULL,
  `drawdown_basis` text NOT NULL CHECK (`drawdown_basis` IN ('initial_balance', 'high_water_mark', 'previous_day_close')),
  `profit_target_pct` integer NOT NULL,
  `min_trading_days` integer,
  `max_trading_days` integer,
  `weekend_holding_allowed` integer NOT NULL CHECK (`weekend_holding_allowed` IN (0, 1)),
  `news_trading_allowed` integer NOT NULL CHECK (`news_trading_allowed` IN (0, 1)),
  `consistency_rule_pct` integer,
  `challenge_cost_cents` integer NOT NULL,
  `start_date` integer NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('active', 'passed', 'failed', 'paused', 'retired')),
  `end_date` integer,
  `end_reason` text,
  `peak_equity_cents` integer NOT NULL,
  `current_equity_cents` integer NOT NULL,
  `notes` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `account_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `accounts`(`id`),
  `rule_key` text NOT NULL,
  `enabled` integer NOT NULL DEFAULT 1 CHECK (`enabled` IN (0, 1)),
  `value` text NOT NULL,
  `priority` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pairs` (
  `id` text PRIMARY KEY NOT NULL,
  `symbol` text NOT NULL UNIQUE,
  `display_name` text NOT NULL,
  `asset_class` text NOT NULL CHECK (`asset_class` IN ('forex', 'indices', 'commodities', 'crypto', 'stocks', 'other')),
  `pip_decimal` integer NOT NULL,
  `pip_value_per_standard_lot_cents` integer NOT NULL,
  `correlated_with` text,
  `active` integer NOT NULL DEFAULT 1 CHECK (`active` IN (0, 1)),
  `display_order` integer NOT NULL,
  `notes` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `setups` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `category` text NOT NULL,
  `description` text,
  `color` text NOT NULL,
  `active` integer NOT NULL DEFAULT 1 CHECK (`active` IN (0, 1)),
  `display_order` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `killzones` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `start_time_utc` text NOT NULL,
  `end_time_utc` text NOT NULL,
  `color` text NOT NULL,
  `active` integer NOT NULL DEFAULT 1 CHECK (`active` IN (0, 1)),
  `display_order` integer NOT NULL,
  `notes` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `accounts`(`id`),
  `session_date` text NOT NULL,
  `daily_bias` text NOT NULL CHECK (`daily_bias` IN ('bullish', 'bearish', 'neutral')),
  `daily_bias_reason` text NOT NULL,
  `h4_bias` text NOT NULL CHECK (`h4_bias` IN ('bullish', 'bearish', 'neutral')),
  `h4_bias_reason` text NOT NULL,
  `h1_bias` text NOT NULL CHECK (`h1_bias` IN ('bullish', 'bearish', 'neutral')),
  `h1_bias_reason` text NOT NULL,
  `htf_liquidity_target` text,
  `dxy_bias` text CHECK (`dxy_bias` IN ('bullish', 'bearish', 'neutral', 'n/a')),
  `smt_notes` text,
  `session_plan` text,
  `key_levels` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `locked_at` integer
);
--> statement-breakpoint
CREATE TABLE `trades` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `accounts`(`id`),
  `session_id` text REFERENCES `sessions`(`id`),
  `pair_id` text NOT NULL REFERENCES `pairs`(`id`),
  `setup_id` text NOT NULL REFERENCES `setups`(`id`),
  `killzone_id` text REFERENCES `killzones`(`id`),
  `mode` text NOT NULL CHECK (`mode` IN ('live', 'sim', 'backtest')),
  `direction` text NOT NULL CHECK (`direction` IN ('long', 'short')),
  `status` text NOT NULL CHECK (`status` IN ('planned', 'open', 'closed', 'cancelled')),
  `entry_price` integer NOT NULL,
  `stop_loss_price` integer NOT NULL,
  `take_profit_price` integer NOT NULL,
  `sl_pips` integer NOT NULL,
  `rr_ratio` integer NOT NULL,
  `lot_size` integer NOT NULL,
  `risk_amount_cents` integer NOT NULL,
  `risk_pct_bps` integer NOT NULL,
  `planned_invalidation` text NOT NULL,
  `mss_confirmed` integer NOT NULL CHECK (`mss_confirmed` IN (0, 1)),
  `htf_bias_aligned` integer NOT NULL CHECK (`htf_bias_aligned` IN (0, 1)),
  `dxy_aligned` integer CHECK (`dxy_aligned` IN (0, 1)),
  `smt_confirmed` integer CHECK (`smt_confirmed` IN (0, 1)),
  `correlated_pair_used` text,
  `pre_calm_score` integer NOT NULL CHECK (`pre_calm_score` BETWEEN 1 AND 10),
  `pre_urgency_score` integer NOT NULL CHECK (`pre_urgency_score` BETWEEN 1 AND 10),
  `pre_need_score` integer NOT NULL CHECK (`pre_need_score` BETWEEN 1 AND 10),
  `actual_entry_price` integer,
  `actual_entry_time` integer,
  `exit_price` integer,
  `exit_time` integer,
  `exit_reason` text CHECK (`exit_reason` IN ('tp', 'sl', 'manual', 'be', 'partial_full', 'timeout')),
  `pnl_cents` integer,
  `pnl_r` integer,
  `pnl_pct_bps` integer,
  `max_drawdown_during_trade_pct_bps` integer,
  `mae_pips` integer,
  `mfe_pips` integer,
  `duration_minutes` integer,
  `followed_plan_exactly` integer CHECK (`followed_plan_exactly` IN (0, 1)),
  `plan_changes_description` text,
  `sl_moved` integer CHECK (`sl_moved` IN (0, 1)),
  `sl_moved_reason` text,
  `tp_moved` integer CHECK (`tp_moved` IN (0, 1)),
  `entered_before_mss` integer CHECK (`entered_before_mss` IN (0, 1)),
  `revenge_trade_flag` integer CHECK (`revenge_trade_flag` IN (0, 1)),
  `rules_broken` text,
  `is_clean` integer CHECK (`is_clean` IN (0, 1)),
  `post_calm_score` integer CHECK (`post_calm_score` BETWEEN 1 AND 10),
  `what_i_did_right` text,
  `what_i_did_wrong` text,
  `tags` text,
  `broker_source` text,
  `broker_trade_id` text,
  `imported_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `trade_screenshots` (
  `id` text PRIMARY KEY NOT NULL,
  `trade_id` text NOT NULL REFERENCES `trades`(`id`),
  `kind` text NOT NULL CHECK (`kind` IN ('htf_context', 'entry', 'exit', 'review', 'other')),
  `filename` text NOT NULL,
  `caption` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trade_partials` (
  `id` text PRIMARY KEY NOT NULL,
  `trade_id` text NOT NULL REFERENCES `trades`(`id`),
  `price` integer NOT NULL,
  `lots_closed` integer NOT NULL,
  `pnl_cents` integer NOT NULL,
  `reason` text,
  `closed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rule_violations` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `accounts`(`id`),
  `trade_id` text REFERENCES `trades`(`id`),
  `rule_key` text NOT NULL,
  `severity` text NOT NULL CHECK (`severity` IN ('warning', 'blocking', 'logged')),
  `outcome` text NOT NULL CHECK (`outcome` IN ('blocked', 'user_overrode', 'logged_post_hoc')),
  `context_json` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text REFERENCES `accounts`(`id`),
  `period_type` text NOT NULL CHECK (`period_type` IN ('weekly', 'monthly', 'ad_hoc')),
  `period_start` text NOT NULL,
  `period_end` text NOT NULL,
  `top_mistakes` text NOT NULL,
  `best_trade_id` text REFERENCES `trades`(`id`),
  `worst_trade_id` text REFERENCES `trades`(`id`),
  `lesson_next_period` text NOT NULL,
  `rule_focus` text,
  `adherence_score` integer NOT NULL CHECK (`adherence_score` BETWEEN 0 AND 100),
  `notes` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cooldowns` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `accounts`(`id`),
  `reason` text NOT NULL CHECK (`reason` IN ('post_loss', 'consecutive_losses', 'daily_loss_hit', 'rule_violation', 'manual')),
  `started_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `cleared_at` integer,
  `cleared_by` text CHECK (`cleared_by` IN ('timer', 'user_acknowledgment')),
  `acknowledgment_text` text
);
--> statement-breakpoint
CREATE TABLE `backup_log` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('auto_local', 'manual', 'scheduled_cloud')),
  `destination` text NOT NULL,
  `filesize_bytes` integer NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('success', 'failed')),
  `error_message` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trades_account_date` ON `trades` (`account_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_trades_session` ON `trades` (`session_id`);
--> statement-breakpoint
CREATE INDEX `idx_trades_status` ON `trades` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_trades_mode` ON `trades` (`mode`);
--> statement-breakpoint
CREATE INDEX `idx_trades_is_clean` ON `trades` (`is_clean`);
--> statement-breakpoint
CREATE INDEX `idx_rule_violations_account` ON `rule_violations` (`account_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_sessions_account_date` ON `sessions` (`account_id`, `session_date`);
--> statement-breakpoint
CREATE INDEX `idx_cooldowns_active` ON `cooldowns` (`account_id`, `expires_at`, `cleared_at`);
