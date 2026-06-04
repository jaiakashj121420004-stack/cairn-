-- Cairn server — devices, vault ops, vault metadata, webhook idempotency (CLAUDE.md §18.5).
--
-- Idempotent by construction: every object uses IF NOT EXISTS or ADD COLUMN IF NOT EXISTS.
-- The `vault_op.id` is a serial (auto-increment integer) used as a global sync cursor.
-- The `webhook_event` unique index enforces exactly-once delivery at the DB level.

CREATE TABLE IF NOT EXISTS "device" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "platform" text,
  "registered_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz,
  "revoked_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "device_user_idx" ON "device" ("user_id");

CREATE TABLE IF NOT EXISTS "vault_op" (
  "id" serial PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "device_id" uuid NOT NULL REFERENCES "device" ("id"),
  "table_name" text NOT NULL,
  "record_id" text NOT NULL,
  "op_type" text NOT NULL CHECK ("op_type" IN ('upsert', 'delete')),
  "payload_ciphertext" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "vault_op_user_idx" ON "vault_op" ("user_id");
CREATE INDEX IF NOT EXISTS "vault_op_user_table_idx" ON "vault_op" ("user_id", "table_name");

CREATE TABLE IF NOT EXISTS "vault_meta" (
  "user_id" uuid PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  "key_version" integer NOT NULL DEFAULT 1,
  "schema_version" integer NOT NULL DEFAULT 1,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "webhook_event" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" text NOT NULL CHECK ("provider" IN ('stripe', 'razorpay')),
  "external_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "processed_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_event_provider_external_unique"
  ON "webhook_event" ("provider", "external_id");
