-- Cairn server — subscription lifecycle state + region routing (CLAUDE.md §20.5).
--
-- Adds the explicit billing-state-machine column (`status`), the trial deadline, and
-- the regional gateway choice recorded at checkout (IN → Razorpay, else Stripe).
-- `entitlement` (free/trial/pro) stays the feature-gating value; `status` is the
-- lifecycle position (trial/active/past_due/canceled) the §20.5 machine transitions.
-- Idempotent: ADD COLUMN IF NOT EXISTS + a guarded CHECK constraint.

ALTER TABLE "subscription" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'trial';
ALTER TABLE "subscription" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamptz;
ALTER TABLE "subscription" ADD COLUMN IF NOT EXISTS "billing_region" text;

-- Backfill the lifecycle status from the legacy entitlement for any pre-existing rows.
-- The column default seeds every row to 'trial'; correct paid/lapsed rows here.
UPDATE "subscription"
SET "status" = CASE
    WHEN "entitlement" = 'pro' THEN 'active'
    WHEN "entitlement" = 'trial' THEN 'trial'
    ELSE 'canceled'
  END
WHERE "status" = 'trial';

-- Guard the small enum with a CHECK (idempotent: ignore if it already exists).
DO $$ BEGIN
  ALTER TABLE "subscription"
    ADD CONSTRAINT "subscription_status_check"
    CHECK ("status" IN ('trial', 'active', 'past_due', 'canceled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
