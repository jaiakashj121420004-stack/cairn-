-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0005 — dismissed_insights
--
-- Stores per-user, per-account dismissals of local insight cards.
-- A row means "don't show insight <insight_id> for account <account_id>
-- until <dismissed_until> (UTC ms)".  account_id is nullable so a user
-- can dismiss a global insight (not scoped to one account).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE `dismissed_insights` (
  `id`              text    PRIMARY KEY NOT NULL,
  `insight_id`      text    NOT NULL,
  `account_id`      text    REFERENCES `accounts`(`id`),
  `dismissed_until` integer NOT NULL,
  `created_at`      integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_dismissed_insights_lookup`
  ON `dismissed_insights` (`insight_id`, `account_id`, `dismissed_until`);
