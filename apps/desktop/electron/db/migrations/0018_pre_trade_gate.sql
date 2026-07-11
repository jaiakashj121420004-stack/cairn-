CREATE TABLE `pre_trade_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL REFERENCES `accounts`(`id`),
	`pair_id` text NOT NULL REFERENCES `pairs`(`id`),
	`direction` text NOT NULL,
	`intended_entry` integer,
	`intended_sl` integer,
	`intended_tp` integer,
	`sl_pips` integer,
	`rr_ratio` integer,
	`lot_size` integer,
	`risk_pct_bps` integer,
	`confluences_json` text,
	`invalidation` text,
	`breach_ack` integer NOT NULL DEFAULT 0,
	`status` text NOT NULL DEFAULT 'pending',
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_trade_id` text REFERENCES `trades`(`id`)
);
--> statement-breakpoint
CREATE INDEX `pre_trade_plans_lookup` ON `pre_trade_plans`(`account_id`, `pair_id`, `direction`, `status`);
--> statement-breakpoint
ALTER TABLE `trades` ADD COLUMN `gate_outcome` text;
