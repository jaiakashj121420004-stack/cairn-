-- Cairn server — allow Dodo Payments as a webhook provider (CLAUDE.md §20, docs/billing.md).
--
-- Dodo is added as an ADDITIVE billing provider alongside Stripe and Razorpay. The
-- `webhook_event.provider` column was created in 0001 with an inline CHECK restricting
-- it to ('stripe','razorpay'); widen that to include 'dodo' so the idempotency ledger
-- accepts Dodo deliveries. `subscription.provider` is plain text (0002) with no CHECK,
-- so it needs no change.
-- Idempotent: DROP … IF EXISTS then a guarded ADD CONSTRAINT.

-- The inline column CHECK from 0001 is auto-named "webhook_event_provider_check".
ALTER TABLE "webhook_event" DROP CONSTRAINT IF EXISTS "webhook_event_provider_check";

DO $$ BEGIN
  ALTER TABLE "webhook_event"
    ADD CONSTRAINT "webhook_event_provider_check"
    CHECK ("provider" IN ('stripe', 'razorpay', 'dodo'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
