-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0015 — broker_account_map (Wave 4 — docs/broker-integration.md §4/§6).
--
-- WHY
-- ───
-- A live broker fill names a broker-side account id (an MT5 login, a cTrader
-- ctidTraderAccountId). Cairn cannot attribute that fill to one of the trader's
-- accounts until the trader binds the pair (broker, broker_account_id) to a Cairn
-- account. Until then the fill resolves to no account and creates no trade —
-- Cairn never guesses (CLAUDE.md §14 #39).
--
-- This is PER-DEVICE configuration (a binding is meaningless on another machine
-- watching a different terminal), so the table is deliberately NOT synced — it is
-- absent from the sync engine's TABLE_SPECS (electron/services/sync/store.ts).
--
-- SHAPE
-- ─────
-- Additive: a single CREATE TABLE + one partial unique index. Nothing references
-- it and it touches no existing table, so applying it forward never disturbs data,
-- and re-running the whole chain is a no-op (Drizzle's __drizzle_migrations gate;
-- the migration suite proves the same via its applied-tag gate).
--
-- The unique index is PARTIAL (WHERE deleted_at IS NULL): a binding is removed by
-- soft-delete, and re-binding the same broker account afterwards inserts a fresh
-- row without colliding with the tombstoned one.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE `broker_account_map` (
  `id`                text PRIMARY KEY NOT NULL,
  `broker`            text NOT NULL,
  `broker_account_id` text NOT NULL,
  `cairn_account_id`  text NOT NULL REFERENCES `accounts`(`id`),
  `created_at`        integer NOT NULL,
  `updated_at`        integer NOT NULL,
  `deleted_at`        integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `broker_account_map_uq`
  ON `broker_account_map`(`broker`, `broker_account_id`)
  WHERE `deleted_at` IS NULL;
