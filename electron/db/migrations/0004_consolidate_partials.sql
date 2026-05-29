-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0004 — consolidate the two partial-close tables into ONE
--                   integer-encoded table: `trade_partials`.
--
-- WHY
-- ───
-- v1.1 left the project with two partial-close tables (CLAUDE.md §14 #36,
-- docs/roadmap-v1.2.md §6 item 3):
--
--   • `trade_partials`  (integer-encoded) — created in 0001. DEAD: no code ever
--                       read or wrote it. Its only non-schema reference was a
--                       table-existence assertion in tests/unit/db.test.ts.
--   • `partial_closes`  (float)           — created in 0002 (+ close_lots in 0003).
--                       LIVE: written by trades:partialClose, read by trades:detail,
--                       rendered in TradeDetailModal. Stores money/pips as `real`.
--
-- Storing money or pips as `real`/`float` violates CLAUDE.md §2.5 ("money math
-- correct to the cent/pip; never floats") and §19.5. This migration makes
-- `trade_partials` the single canonical table, integer-encoded, and copies the
-- live data out of `partial_closes` (converting each float column to its integer
-- encoding) before dropping `partial_closes`.
--
-- CONVERSIONS (one unit per column — there is NO dollar-vs-pip ambiguity)
-- ──────────────────────────────────────────────────────────────────────
-- Each `partial_closes` float column has exactly ONE meaning regardless of
-- instrument, and each target encoding is one already used elsewhere in the
-- codebase (see electron/services/pnl-calculator.ts and schema.ts/trades):
--
--   partial_closes.close_percent (real %, 0–100)
--       → trade_partials.close_percent_bps (integer basis points)
--       conversion: round(close_percent * 100)        e.g. 50.0% → 5000
--       rationale: same bps encoding as trades.risk_pct_bps / pnl_pct_bps.
--
--   partial_closes.close_lots (integer, lots × 100)
--       → trade_partials.close_lots (unchanged, already integer)
--
--   partial_closes.exit_price (real, but ALREADY holds an integer-valued tick:
--       round(realPrice * 10^(pipDecimal+1)), identical to trades.entry_price —
--       confirmed by pnl-calculator.ts, CloseTradeModal.priceToDb, and
--       TradeDetailModal's ÷10^(pipDecimal+1) display)
--       → trade_partials.exit_price (integer tick)
--       conversion: round(exit_price)                  no multiplier; just de-float.
--
--   partial_closes.exit_time (integer, UTC ms)
--       → trade_partials.exit_time (unchanged)
--
--   partial_closes.pnl_r (real R, e.g. 1.5)
--       → trade_partials.pnl_r (integer, R × 100)
--       conversion: round(pnl_r * 100)                 e.g. 1.5R → 150
--       rationale: same R×100 encoding as trades.pnl_r / PnlResult.pnlR.
--
--   partial_closes.pnl_usd (real dollars, e.g. 12.34)
--       → trade_partials.pnl_cents (integer cents)
--       conversion: round(pnl_usd * 100)               e.g. $12.34 → 1234
--       rationale: same cents encoding as trades.pnl_cents.
--
-- For real production data the *100 conversions are exact (pnl_usd was written
-- as pnlCents/100 and pnl_r as integerR/100, so multiplying back by 100 yields
-- the original integer with no fractional part). SQLite's round() is
-- round-half-away-from-zero; the test-side codec mirrors that exactly.
--
-- SAFETY
-- ──────
-- 1. Guard: assert the legacy integer `trade_partials` is empty before dropping
--    it (it is unused by all code, so this always holds; if it somehow has rows,
--    the CHECK aborts the migration rather than silently destroying data).
-- 2. Copy every row from `partial_closes` into the new `trade_partials`.
-- 3. Guard: assert row counts match BEFORE dropping `partial_closes`. A short
--    copy fails the CHECK and rolls the whole migration back (Drizzle wraps each
--    migration in a transaction).
-- 4. Only then drop `partial_closes`.
--
-- The CHECK-constraint guard tables are the SQLite-portable way to do a
-- row-count assertion inside a .sql migration (RAISE() is trigger-only).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Guard: legacy integer `trade_partials` must be empty before we drop it.
CREATE TABLE `_consolidate_guard_legacy` (`ok` integer NOT NULL CHECK (`ok` = 1));
--> statement-breakpoint
INSERT INTO `_consolidate_guard_legacy` (`ok`)
SELECT CASE WHEN (SELECT count(*) FROM `trade_partials`) = 0 THEN 1 ELSE 0 END;
--> statement-breakpoint
DROP TABLE `_consolidate_guard_legacy`;
--> statement-breakpoint

-- 2. Drop the dead legacy table and recreate `trade_partials` integer-encoded.
DROP TABLE `trade_partials`;
--> statement-breakpoint
CREATE TABLE `trade_partials` (
  `id`                text    PRIMARY KEY NOT NULL,
  `trade_id`          text    NOT NULL REFERENCES `trades`(`id`),
  `close_percent_bps` integer NOT NULL,
  `close_lots`        integer,
  `exit_price`        integer NOT NULL,
  `exit_time`         integer NOT NULL,
  `pnl_r`             integer,
  `pnl_cents`         integer,
  `notes`             text,
  `created_at`        integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trade_partials_trade` ON `trade_partials` (`trade_id`);
--> statement-breakpoint

-- 3. Copy + convert every row from the live float table.
INSERT INTO `trade_partials`
  (`id`, `trade_id`, `close_percent_bps`, `close_lots`, `exit_price`,
   `exit_time`, `pnl_r`, `pnl_cents`, `notes`, `created_at`)
SELECT
  `id`,
  `trade_id`,
  CAST(round(`close_percent` * 100) AS INTEGER),
  `close_lots`,
  CAST(round(`exit_price`) AS INTEGER),
  `exit_time`,
  CASE WHEN `pnl_r`   IS NULL THEN NULL ELSE CAST(round(`pnl_r`   * 100) AS INTEGER) END,
  CASE WHEN `pnl_usd` IS NULL THEN NULL ELSE CAST(round(`pnl_usd` * 100) AS INTEGER) END,
  `notes`,
  `created_at`
FROM `partial_closes`;
--> statement-breakpoint

-- 4. Guard: verify the copy is complete BEFORE destroying the source.
CREATE TABLE `_consolidate_guard_copy` (`ok` integer NOT NULL CHECK (`ok` = 1));
--> statement-breakpoint
INSERT INTO `_consolidate_guard_copy` (`ok`)
SELECT CASE WHEN (SELECT count(*) FROM `trade_partials`) = (SELECT count(*) FROM `partial_closes`)
            THEN 1 ELSE 0 END;
--> statement-breakpoint
DROP TABLE `_consolidate_guard_copy`;
--> statement-breakpoint

-- 5. Drop the float table. `partial_closes` is now fully superseded.
DROP TABLE `partial_closes`;
