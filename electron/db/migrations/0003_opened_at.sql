-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0003 — trades.opened_at + partial_closes.close_lots
-- opened_at: wall-clock timestamp when a planned trade was activated (set open).
-- close_lots: lot count (×100) for a partial close row (companion to close_percent).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Timestamp when the trade was activated from planned → open status
ALTER TABLE `trades` ADD COLUMN `opened_at` integer;
--> statement-breakpoint

-- 2. Lot count for a partial close (×100, e.g. 0.50 lots → 50)
ALTER TABLE `partial_closes` ADD COLUMN `close_lots` integer;
