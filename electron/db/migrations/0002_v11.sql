-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0002 — Cairn v1.1
-- Adds: screenshot_path on trades, daily_trade_limit + max_daily_loss_pct on
-- accounts, partial_closes table, defensive timestamp coerce, v1.1 pair seeds.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. screenshot_path on trades (optional, never blocks submission)
ALTER TABLE `trades` ADD COLUMN `screenshot_path` text;
--> statement-breakpoint

-- 2. daily_trade_limit on accounts (nullable — null means no limit enforced)
ALTER TABLE `accounts` ADD COLUMN `daily_trade_limit` integer;
--> statement-breakpoint

-- 3. max_daily_loss_pct on accounts (nullable real, e.g. 2.5 = 2.5%)
ALTER TABLE `accounts` ADD COLUMN `max_daily_loss_pct` real;
--> statement-breakpoint

-- 4. partial_closes — percentage-based partial exit log (v1.1 close-trade flow)
CREATE TABLE `partial_closes` (
  `id`            text    PRIMARY KEY NOT NULL,
  `trade_id`      text    NOT NULL REFERENCES `trades`(`id`),
  `close_percent` real    NOT NULL,
  `exit_price`    real    NOT NULL,
  `exit_time`     integer NOT NULL,
  `pnl_r`         real,
  `pnl_usd`       real,
  `notes`         text,
  `created_at`    integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_partial_closes_trade` ON `partial_closes` (`trade_id`);
--> statement-breakpoint

-- 5. Defensive coerce: ensure actual_entry_time and exit_time are INTEGER.
--    No-op when already integers; fixes any text-stored timestamps.
UPDATE `trades`
SET `actual_entry_time` = CAST(`actual_entry_time` AS INTEGER)
WHERE `actual_entry_time` IS NOT NULL;
--> statement-breakpoint
UPDATE `trades`
SET `exit_time` = CAST(`exit_time` AS INTEGER)
WHERE `exit_time` IS NOT NULL;
--> statement-breakpoint

-- 6. Seed v1.1 pairs — INSERT OR IGNORE is safe on both fresh and existing DBs.
--    The 7 pairs below are additions to the original 12 seeded in migration 0001.
INSERT OR IGNORE INTO `pairs`
  (`id`, `symbol`, `display_name`, `asset_class`, `pip_decimal`,
   `pip_value_per_standard_lot_cents`, `active`, `display_order`,
   `created_at`, `updated_at`)
VALUES
  -- Silver (5 000 oz lot; 1 pip = $0.01 move → $50, approx $5 at 100:1)
  ('01966b11-aab0-7000-a000-000000000013',
   'XAGUSD', 'XAG/USD', 'commodities', 2, 500, 1, 13,
   1777420800000, 1777420800000),

  -- AUD/NZD (1 pip ≈ NZD 10 ≈ USD 6.20 at NZD/USD ~0.62)
  ('01966b11-aab0-7000-a000-000000000014',
   'AUDNZD', 'AUD/NZD', 'forex', 4, 620, 1, 14,
   1777420800000, 1777420800000),

  -- GBP/JPY (1 pip ≈ JPY 1 000 ≈ USD 6.70 at USD/JPY ~150; use USDJPY proxy)
  ('01966b11-aab0-7000-a000-000000000015',
   'GBPJPY', 'GBP/JPY', 'forex', 2, 900, 1, 15,
   1777420800000, 1777420800000),

  -- EUR/GBP (1 pip ≈ GBP 10 ≈ USD 12.70 at GBP/USD ~1.27)
  ('01966b11-aab0-7000-a000-000000000016',
   'EURGBP', 'EUR/GBP', 'forex', 4, 1270, 1, 16,
   1777420800000, 1777420800000),

  -- EUR/JPY (1 pip ≈ JPY 1 000 ≈ USD 6.70; same proxy as GBP/JPY)
  ('01966b11-aab0-7000-a000-000000000017',
   'EURJPY', 'EUR/JPY', 'forex', 2, 900, 1, 17,
   1777420800000, 1777420800000),

  -- GBP/CAD (1 pip ≈ CAD 10 ≈ USD 7.40 at CAD/USD ~0.74)
  ('01966b11-aab0-7000-a000-000000000018',
   'GBPCAD', 'GBP/CAD', 'forex', 4, 740, 1, 18,
   1777420800000, 1777420800000),

  -- GBP/AUD (1 pip ≈ AUD 10 ≈ USD 6.50 at AUD/USD ~0.65)
  ('01966b11-aab0-7000-a000-000000000019',
   'GBPAUD', 'GBP/AUD', 'forex', 4, 650, 1, 19,
   1777420800000, 1777420800000);
