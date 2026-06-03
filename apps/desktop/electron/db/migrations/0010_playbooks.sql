-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0010 — playbooks (v1.2 Wave 3 item 24)
--
-- A playbook is a per-account saved trade template: a named configuration of
-- pair + setup + killzone + required-confluence notes + default risk % + default
-- invalidation chip. Selecting one in the New Trade panel pre-fills those fields
-- in a single tap; the trader still enters live prices.
--
-- Columns:
--   pair_id                  nullable FK — some playbooks apply to any pair
--   setup_id                 required FK — every playbook has a primary setup
--   killzone_id              nullable FK — playbook may be killzone-agnostic
--   required_confluence_md   markdown notes (e.g. "OB must be unmitigated")
--   default_risk_pct         integer basis points; 1.5% → 150; null = use account default
--   default_invalidation_chip chip id string (e.g. "below-ob"); null = free-text
--   version                  increments on every content-touching update
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE `playbooks` (
  `id`                        text PRIMARY KEY NOT NULL,
  `account_id`                text NOT NULL REFERENCES `accounts`(`id`),
  `name`                      text NOT NULL,
  `pair_id`                   text REFERENCES `pairs`(`id`),
  `setup_id`                  text NOT NULL REFERENCES `setups`(`id`),
  `killzone_id`               text REFERENCES `killzones`(`id`),
  `required_confluence_md`    text,
  `default_risk_pct`          integer,
  `default_invalidation_chip` text,
  `created_at`                integer NOT NULL,
  `updated_at`                integer NOT NULL,
  `deleted_at`                integer,
  `version`                   integer NOT NULL DEFAULT 1
);
