-- Cairn server — vault key material + password-reset email tokens (CLAUDE.md §18.4, §2.13).
--
-- 1. vault_meta gains the wrapped key material a client needs to unlock the vault on a
--    new device: the data key wrapped under the password KEK and the recovery-phrase KEK,
--    the per-vault KDF salt, and the Argon2id params. All opaque to the server.
-- 2. email_token learns a third type, 'reset', for the forgot-password flow.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, and a DROP-then-ADD on the CHECK constraint
-- (DROP IF EXISTS makes the re-add safe to re-run). Forward-only, matching the
-- repo's migrator (src/db/migrate.ts); the columns are nullable and the constraint
-- only widens the allowed set, so applying this never invalidates existing rows.

ALTER TABLE "vault_meta" ADD COLUMN IF NOT EXISTS "wrapped_data_key" jsonb;
ALTER TABLE "vault_meta" ADD COLUMN IF NOT EXISTS "recovery_wrapped_data_key" jsonb;
ALTER TABLE "vault_meta" ADD COLUMN IF NOT EXISTS "kdf_salt" text;
ALTER TABLE "vault_meta" ADD COLUMN IF NOT EXISTS "kdf" jsonb;

ALTER TABLE "email_token" DROP CONSTRAINT IF EXISTS "email_token_type_check";
ALTER TABLE "email_token" ADD CONSTRAINT "email_token_type_check" CHECK ("type" IN ('verify', 'magic', 'reset'));
