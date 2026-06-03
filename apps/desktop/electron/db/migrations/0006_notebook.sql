-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0006 — notebook_entries
--
-- Free-form local notes (trading plans, watchlists, weekly reviews). Content is
-- markdown text. `template` records which built-in template seeded the entry
-- (null for a blank note). `pinned` floats an entry to the top of the list.
-- Soft-deleted via `deleted_at` to match the rest of the schema.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE `notebook_entries` (
  `id`         text    PRIMARY KEY NOT NULL,
  `title`      text    NOT NULL,
  `content`    text    NOT NULL DEFAULT '',
  `template`   text,
  `pinned`     integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_notebook_entries_updated`
  ON `notebook_entries` (`deleted_at`, `pinned`, `updated_at`);
