-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0013 — durable vector-clock store + sync-column conformance
--                  (v2.0 Stage 18.6 / "Sync Engine" Stage 4)
--
-- Two concerns, both additive and empty/no-op on existing installs:
--
-- 1. `sync_clocks` — the durable home for each syncable record's FULL per-record
--    vector clock (docs/sync-protocol.md §3). Stage 18.6 only ever kept the clock
--    in an in-memory cache, hydrated (per the original design note) from a per-table
--    `version` column that does not exist on trades/accounts/sessions/trade_partials.
--    Persisting the WHOLE clock (every device's component, as JSON) — not just this
--    device's component — is what makes an idempotent replay compare `equal` instead
--    of `concurrent` after a restart, so we never raise a phantom conflict (§2.5).
--    Keyed by (table_name, record_id). The write path and the pull/merge path both
--    upsert here; the cache hydrates from it on launch.
--
-- 2. Sync-column conformance — two tables that join sync in this stage lacked the
--    columns the engine needs:
--      * `sessions`        had no soft-delete column → add `deleted_at`.
--      * `trade_partials`  had only `created_at`     → add `updated_at` + `deleted_at`
--                          so an edited/removed partial syncs like any other row.
--    All three are nullable with no default, so the ALTERs touch no existing row.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE `sync_clocks` (
  `table_name` text NOT NULL,
  `record_id`  text NOT NULL,
  `clock`      text NOT NULL,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`table_name`, `record_id`)
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `deleted_at` integer;
--> statement-breakpoint
ALTER TABLE `trade_partials` ADD COLUMN `updated_at` integer;
--> statement-breakpoint
ALTER TABLE `trade_partials` ADD COLUMN `deleted_at` integer;
