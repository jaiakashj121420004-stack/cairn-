-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0008 — external_ref for import idempotency
--
-- Adds external_ref (nullable) to `trades` and `trade_partials`.
-- Used by the MT5 / cTrader / TradingView import adapters to deduplicate
-- statement files imported more than once.
--
-- Format: "mt5_order_{orderId}" for trades, "mt5_deal_{dealId}" for partials.
-- NULL for all manually-entered rows; SQLite treats each NULL as distinct under
-- a UNIQUE constraint, so no existing rows are affected.
--
-- Partial indexes (WHERE NOT NULL) keep the index small and explicit.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `trades` ADD COLUMN `external_ref` text;
--> statement-breakpoint
ALTER TABLE `trade_partials` ADD COLUMN `external_ref` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `trades_external_ref_uq` ON `trades`(`external_ref`) WHERE `external_ref` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `trade_partials_external_ref_uq` ON `trade_partials`(`external_ref`) WHERE `external_ref` IS NOT NULL;
