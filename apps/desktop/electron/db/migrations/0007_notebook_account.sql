-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0007 — notebook_entries enhancements
--
-- Adds account_id (nullable FK — notes can be global or account-scoped) and
-- version (integer, used by the v2.0 sync layer; starts at 1 for all existing
-- rows). Existing rows get NULL account_id (global notes).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `notebook_entries` ADD COLUMN `account_id` text REFERENCES `accounts`(`id`);
--> statement-breakpoint
ALTER TABLE `notebook_entries` ADD COLUMN `version` integer NOT NULL DEFAULT 1;
