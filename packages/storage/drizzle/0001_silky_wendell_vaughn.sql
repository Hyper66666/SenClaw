CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`lookup_hash` text NOT NULL,
	`key_hash` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text,
	`last_used_at` text,
	`revoked_at` text,
	`revoked_by` text,
	`revoked_reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_lookup_hash_idx` ON `api_keys` (`lookup_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_key_hash_idx` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_revoked_at_idx` ON `api_keys` (`revoked_at`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`key_id` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status` integer NOT NULL,
	`ip` text NOT NULL,
	`user_agent` text,
	`request_body` text,
	`response_time_ms` integer NOT NULL,
	`timestamp` text NOT NULL,
	FOREIGN KEY (`key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_logs_key_id_idx` ON `audit_logs` (`key_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_timestamp_idx` ON `audit_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `audit_logs_status_idx` ON `audit_logs` (`status`);