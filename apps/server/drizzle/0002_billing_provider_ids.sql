-- Cairn server — billing provider linkage on the subscription row (CLAUDE.md §20.2).
--
-- Persists the provider customer/subscription ids so /billing/portal and /billing/cancel
-- can act on the right provider object without calling the provider in a hot path.
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE "subscription" ADD COLUMN IF NOT EXISTS "provider" text;
ALTER TABLE "subscription" ADD COLUMN IF NOT EXISTS "provider_customer_id" text;
ALTER TABLE "subscription" ADD COLUMN IF NOT EXISTS "provider_subscription_id" text;
