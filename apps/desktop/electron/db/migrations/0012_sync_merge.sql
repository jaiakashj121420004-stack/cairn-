-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0012 — sync merge state (v2.0 Stage 18.6)
--
-- Pull/merge bookkeeping for E2E-encrypted sync (docs/sync-protocol.md §4–8):
--   sync_conflicts  concurrent edits retained for the user to resolve (both sides kept)
--   sync_quarantine pulled ops that could not be applied (decrypt/schema failure),
--                   preserved verbatim rather than silently dropped
--   sync_audit      append-only log of non-trivial sync decisions (conflict, quarantine)
--   sync_state      key/value bookkeeping; holds the persisted pull cursor
--
-- All four are empty on existing installs and stay empty until sync is enrolled and a
-- pull runs. No existing table is touched, so this is additive and idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE `sync_conflicts` (
  `id`               integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `table_name`       text NOT NULL,
  `record_id`        text NOT NULL,
  `local_clock`      text NOT NULL,
  `remote_clock`     text NOT NULL,
  `local_payload`    text NOT NULL,
  `remote_payload`   text NOT NULL,
  `remote_op_id`     integer NOT NULL,
  `remote_device_id` text NOT NULL,
  `detected_at`      integer NOT NULL,
  `resolved_at`      integer
);
--> statement-breakpoint
CREATE INDEX `sync_conflicts_record_idx` ON `sync_conflicts` (`table_name`, `record_id`);
--> statement-breakpoint
CREATE INDEX `sync_conflicts_unresolved_idx` ON `sync_conflicts` (`resolved_at`);
--> statement-breakpoint
CREATE TABLE `sync_quarantine` (
  `id`                 integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `table_name`         text NOT NULL,
  `record_id`          text NOT NULL,
  `remote_op_id`       integer NOT NULL,
  `remote_device_id`   text NOT NULL,
  `reason`             text NOT NULL,
  `detail`             text NOT NULL,
  `payload_ciphertext` text NOT NULL,
  `created_at`         integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_quarantine_record_idx` ON `sync_quarantine` (`table_name`, `record_id`);
--> statement-breakpoint
CREATE TABLE `sync_audit` (
  `id`         integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `event`      text NOT NULL,
  `table_name` text,
  `record_id`  text,
  `detail`     text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_audit_created_idx` ON `sync_audit` (`created_at`);
--> statement-breakpoint
CREATE TABLE `sync_state` (
  `key`   text PRIMARY KEY NOT NULL,
  `value` integer NOT NULL
);
