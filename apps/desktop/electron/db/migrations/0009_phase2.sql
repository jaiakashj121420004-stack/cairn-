-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0009 — two-phase logging (v1.2 Wave 3)
--
-- Adds `phase_2_complete` to `trades`. Phase 1 (the Gate) captures only what the
-- rule engine needs in the moment; Phase 2 (the deferred Journal — honesty
-- review, rules-broken, MAE/MFE, reflection, tags) is completed later from the
-- Review screen's reflection queue.
--
--   phase_2_complete = 0  → reflection still owed (shows in the queue once closed)
--   phase_2_complete = 1  → reflection captured
--
-- Backfill: every EXISTING closed trade was logged under the old single-phase
-- flow, so its reflection is already on the row — mark those complete. Open /
-- planned / cancelled rows stay 0 (they only enter the queue once closed, and a
-- minimal close leaves them at 0 until reflected).
--
-- Stored as integer 0/1, matching every other boolean column in this schema.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `trades` ADD COLUMN `phase_2_complete` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `trades` SET `phase_2_complete` = 1 WHERE `status` = 'closed';
