-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0019 — contract-spec columns on `pairs` (multi-asset M2)
--
-- Adds tick_size + tick_value_cents (both nullable). When set, a pair is
-- configured by CONTRACT SPEC — a minimum price increment (tick size, stored in
-- the same encoding as prices: round(realTick × 10^(pip_decimal+1))) and the money
-- per tick per standard lot/contract (cents) — instead of a hand-entered pip value.
--
-- pip_value_per_standard_lot_cents stays the canonical field and is DERIVED from
-- these at save time, so every existing pip-based consumer keeps working. Both
-- columns are NULL for every existing / pip-configured pair, so no row changes its
-- computed value and no back-migration is needed (dropping the columns restores
-- the prior schema exactly).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `pairs` ADD COLUMN `tick_size` integer;
--> statement-breakpoint
ALTER TABLE `pairs` ADD COLUMN `tick_value_cents` integer;
