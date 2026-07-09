-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0017 — daily_locks: a persisted circuit-breaker lock independent
-- of a `sessions` row existing.
--
-- WHY
-- ───
-- `engine.ts#checkAndLockSession` locks the trading day when a daily-loss
-- circuit breaker (max_daily_loss_pct / max_daily_loss_fixed) breaches. It used
-- to express that lock only by stamping `sessions.locked_at`, which no-ops when
-- the trader never logged today's bias — `sessions.daily_bias` and its siblings
-- are NOT NULL with no default, so a bare lock row cannot be created there
-- without fabricating a bias the trader never gave (CLAUDE.md §2.3 honesty
-- boundary forbids inventing that data).
--
-- This table is the lock of record for that case: one immutable row per
-- (account, trading day), written the moment a breach occurs, regardless of
-- whether a `sessions` row exists. The rules engine consults it in
-- context-builder.ts (-> RuleContext.dailyLock) so every subsequent pre-trade
-- evaluation that day is hard-blocked, and session-state.ts folds it into the
-- session-locked UI state. When a `sessions` row DOES exist, `sessions.locked_at`
-- is still stamped too (existing behavior, preserved) — this table does not
-- replace that, it covers the gap.
--
-- SHAPE
-- ─────
-- Additive: a single CREATE TABLE + one unique index. Nothing references it and
-- it touches no existing table, so applying it forward never disturbs data, and
-- re-running the whole chain is a no-op (Drizzle's __drizzle_migrations gate).
-- No soft-delete column: a daily lock is a historical fact about a trading day
-- and is never edited or removed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE `daily_locks` (
  `id`          text PRIMARY KEY NOT NULL,
  `account_id`  text NOT NULL REFERENCES `accounts`(`id`),
  `trading_day` text NOT NULL,
  `reason`      text NOT NULL,
  `created_at`  integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_locks_account_day_uq`
  ON `daily_locks`(`account_id`, `trading_day`);
