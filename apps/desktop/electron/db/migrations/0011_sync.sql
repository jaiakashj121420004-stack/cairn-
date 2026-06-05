-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0011 — sync queue (v2.0 Stage 18.6)
--
-- The outbound op queue for E2E-encrypted cloud sync (docs/sync-protocol.md §2.3).
-- The write path (a later stage) appends one row per local mutation; the push
-- service drains it in created_at order, encrypts each row's plaintext `payload`
-- with the vault data key, POSTs to /vault/push, and deletes the row only after the
-- server acknowledges the op.
--
-- Stored plaintext on purpose: the device is the only place plaintext exists, and
-- encrypting at push (not write) time means a key rotation re-encrypts the queue
-- rather than the whole journal. This table is empty on existing installs until the
-- write path opts rows in — push simply no-ops while it is empty.
--
-- Columns:
--   payload     plaintext sync envelope to encrypt at push; '' for a bare delete
--   created_at  epoch ms; queue order is (created_at, id)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE `sync_queue` (
  `id`          integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `table_name`  text NOT NULL,
  `record_id`   text NOT NULL,
  `op_type`     text NOT NULL,
  `payload`     text NOT NULL DEFAULT '',
  `created_at`  integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_queue_created_idx` ON `sync_queue` (`created_at`, `id`);
