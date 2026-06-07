-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0014 — widen rule_violations.outcome CHECK to admit 'detected_live'.
--
-- WHY
-- ───
-- Wave 4 live broker detection (docs/broker-integration.md §5) records a
-- non-blocking, real-time rule breach observed on a live position with outcome
-- 'detected_live'. It is deliberately DISTINCT from 'blocked' so analytics never
-- count a detection (which Cairn could not prevent — the order was already live
-- at the broker) as a prevention. The original CHECK from 0001 admitted only
-- ('blocked', 'user_overrode', 'logged_post_hoc'), so an insert would fail.
--
-- SQLite cannot ALTER a CHECK constraint, so the table is rebuilt. Nothing
-- FK-references `rule_violations`, and it carries no sync columns, so a simple
-- create-copy-drop-rename is safe. Drizzle wraps the migration in a transaction,
-- so a short copy rolls the whole thing back.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE `rule_violations_new` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `accounts`(`id`),
  `trade_id` text REFERENCES `trades`(`id`),
  `rule_key` text NOT NULL,
  `severity` text NOT NULL CHECK (`severity` IN ('warning', 'blocking', 'logged')),
  `outcome` text NOT NULL CHECK (`outcome` IN ('blocked', 'user_overrode', 'logged_post_hoc', 'detected_live')),
  `context_json` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `rule_violations_new`
  (`id`, `account_id`, `trade_id`, `rule_key`, `severity`, `outcome`, `context_json`, `created_at`)
SELECT `id`, `account_id`, `trade_id`, `rule_key`, `severity`, `outcome`, `context_json`, `created_at`
FROM `rule_violations`;
--> statement-breakpoint
DROP TABLE `rule_violations`;
--> statement-breakpoint
ALTER TABLE `rule_violations_new` RENAME TO `rule_violations`;
--> statement-breakpoint
CREATE INDEX `idx_rule_violations_account` ON `rule_violations` (`account_id`, `created_at`);
