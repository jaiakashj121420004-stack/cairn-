-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0016 — account_phases: per-phase prop-firm rule configuration.
--
-- WHY
-- ───
-- `accounts` stores ONE profit target + one drawdown set, but a multi-step
-- challenge has different numbers per phase (and a funded phase has no profit
-- target at all). This table stores the full per-phase ladder.
--
-- DENORMALIZATION CONTRACT: the account row's existing single columns
-- (`profit_target_pct`, drawdown columns, trading-day columns) remain the
-- ACTIVE phase's effective values — the rules engine keeps reading the account
-- row, never this table. `accounts:advancePhase` copies the next phase's row
-- onto the account inside one transaction (electron/ipc/accounts.ts).
--
-- All money/percent columns are integer basis points (CLAUDE.md §2.5/§19.5).
-- `profit_target_pct` is NULLABLE — a funded phase has no target.
--
-- SHAPE
-- ─────
-- Additive CREATE TABLE + one partial unique index + a guarded backfill.
-- Idempotent by construction: IF NOT EXISTS on both DDL statements, and the
-- backfill INSERT…SELECT is guarded by NOT EXISTS per (account, phase), so
-- re-running the file on the post-state applies zero rows (§19.6).
--
-- The unique index is PARTIAL (WHERE deleted_at IS NULL), matching the
-- broker_account_map pattern from 0015: a phase removed by soft-delete can be
-- re-created for the same (account, phase_number) without colliding with the
-- tombstoned row.
--
-- BACKFILL
-- ────────
-- Every existing account gets phase rows 1..step_count, each copying the
-- account's current single values (the only values v1 ever knew) — a starting
-- point the user can edit per phase afterwards. Soft-deleted accounts are
-- included (harmless; keeps every account row consistent). step_count has been
-- Zod-clamped to 1..5 since v1, so a 5-row numbers table covers the ladder.
-- Row ids are 32-char random hex (not UUIDv7 like app-created rows) — ids are
-- opaque; only uniqueness matters.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `account_phases` (
  `id`                   text PRIMARY KEY NOT NULL,
  `account_id`           text NOT NULL REFERENCES `accounts`(`id`),
  `phase_number`         integer NOT NULL CHECK (`phase_number` >= 1),
  `profit_target_pct`    integer,
  `daily_drawdown_type`  text NOT NULL,
  `daily_drawdown_value` integer NOT NULL,
  `total_drawdown_type`  text NOT NULL,
  `total_drawdown_value` integer NOT NULL,
  `min_trading_days`     integer,
  `max_trading_days`     integer,
  `consistency_rule_pct` integer,
  `created_at`           integer NOT NULL,
  `updated_at`           integer NOT NULL,
  `deleted_at`           integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `account_phases_account_phase_uq`
  ON `account_phases`(`account_id`, `phase_number`)
  WHERE `deleted_at` IS NULL;
--> statement-breakpoint
INSERT INTO `account_phases`
  (`id`, `account_id`, `phase_number`, `profit_target_pct`,
   `daily_drawdown_type`, `daily_drawdown_value`,
   `total_drawdown_type`, `total_drawdown_value`,
   `min_trading_days`, `max_trading_days`, `consistency_rule_pct`,
   `created_at`, `updated_at`, `deleted_at`)
SELECT
  lower(hex(randomblob(16))),
  a.`id`,
  n.`n`,
  a.`profit_target_pct`,
  a.`daily_drawdown_type`,
  a.`daily_drawdown_value`,
  a.`total_drawdown_type`,
  a.`total_drawdown_value`,
  a.`min_trading_days`,
  a.`max_trading_days`,
  a.`consistency_rule_pct`,
  a.`created_at`,
  a.`updated_at`,
  NULL
FROM `accounts` a
JOIN (SELECT 1 AS `n` UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) n
  ON n.`n` <= a.`step_count`
WHERE NOT EXISTS (
  SELECT 1 FROM `account_phases` p
  WHERE p.`account_id` = a.`id`
    AND p.`phase_number` = n.`n`
    AND p.`deleted_at` IS NULL
);
