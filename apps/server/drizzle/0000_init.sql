-- Cairn server — initial auth schema (CLAUDE.md §18.5).
--
-- Idempotent by construction (CLAUDE.md §19.6): every object uses IF NOT EXISTS, and
-- CHECK constraints are declared inline with their table so re-running on the
-- post-state is a no-op. gen_random_uuid() is built into Postgres 13+.

CREATE TABLE IF NOT EXISTS "user" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "email_verified_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" ("email");

CREATE TABLE IF NOT EXISTS "user_credential" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "password_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_credential_user_unique" ON "user_credential" ("user_id");

CREATE TABLE IF NOT EXISTS "user_session" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "family_id" uuid NOT NULL,
  "refresh_hash" text NOT NULL,
  "replaced_by" uuid,
  "revoked_at" timestamptz,
  "expires_at" timestamptz NOT NULL,
  "user_agent" text,
  "ip" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_session_refresh_unique" ON "user_session" ("refresh_hash");
CREATE INDEX IF NOT EXISTS "user_session_family_idx" ON "user_session" ("family_id");
CREATE INDEX IF NOT EXISTS "user_session_user_idx" ON "user_session" ("user_id");

CREATE TABLE IF NOT EXISTS "email_token" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "type" text NOT NULL CHECK ("type" IN ('verify', 'magic')),
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "email_token_hash_unique" ON "email_token" ("token_hash");
CREATE INDEX IF NOT EXISTS "email_token_user_type_idx" ON "email_token" ("user_id", "type");

CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "event" text NOT NULL,
  "severity" text NOT NULL CHECK ("severity" IN ('info', 'warning', 'critical')),
  "detail" jsonb,
  "ip" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "audit_log_user_idx" ON "audit_log" ("user_id");
CREATE INDEX IF NOT EXISTS "audit_log_severity_idx" ON "audit_log" ("severity");

CREATE TABLE IF NOT EXISTS "subscription" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "entitlement" text NOT NULL DEFAULT 'free' CHECK ("entitlement" IN ('free', 'trial', 'pro')),
  "current_period_end" timestamptz,
  "grace_until" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_user_unique" ON "subscription" ("user_id");
