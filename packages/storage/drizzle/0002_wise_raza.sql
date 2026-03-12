CREATE TABLE `job_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`run_id` text,
	`status` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`executed_at` text,
	`error` text,
	FOREIGN KEY (`job_id`) REFERENCES `scheduled_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `job_executions_job_id_idx` ON `job_executions` (`job_id`);--> statement-breakpoint
CREATE INDEX `job_executions_scheduled_at_idx` ON `job_executions` (`scheduled_at`);--> statement-breakpoint
CREATE INDEX `job_executions_status_idx` ON `job_executions` (`status`);--> statement-breakpoint
CREATE TABLE `scheduled_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`name` text NOT NULL,
	`cron_expression` text NOT NULL,
	`input` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`allow_concurrent` integer DEFAULT false NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`max_retries` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scheduled_jobs_agent_id_idx` ON `scheduled_jobs` (`agent_id`);--> statement-breakpoint
CREATE INDEX `scheduled_jobs_enabled_idx` ON `scheduled_jobs` (`enabled`);--> statement-breakpoint
CREATE INDEX `scheduled_jobs_next_run_at_idx` ON `scheduled_jobs` (`next_run_at`);