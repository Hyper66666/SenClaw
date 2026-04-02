CREATE TABLE `agent_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`selected_agent_id` text NOT NULL,
	`status` text NOT NULL,
	`initial_input` text NOT NULL,
	`background` integer DEFAULT true NOT NULL,
	`parent_run_id` text,
	`parent_task_id` text,
	`active_run_id` text,
	`transcript_cursor` integer DEFAULT 0 NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `agent_tasks_selected_agent_id_idx` ON `agent_tasks` (`selected_agent_id`);--> statement-breakpoint
CREATE INDEX `agent_tasks_status_idx` ON `agent_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `agent_tasks_active_run_id_idx` ON `agent_tasks` (`active_run_id`);--> statement-breakpoint
CREATE TABLE `agent_task_messages` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`source_run_id` text,
	`role` text NOT NULL,
	`content` text,
	`tool_calls` text,
	`tool_call_id` text,
	`inserted_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_task_messages_task_id_idx` ON `agent_task_messages` (`task_id`);--> statement-breakpoint
CREATE TABLE `agent_task_pending_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	`delivered_at` text,
	FOREIGN KEY (`task_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_task_pending_messages_task_id_idx` ON `agent_task_pending_messages` (`task_id`);--> statement-breakpoint
CREATE INDEX `agent_task_pending_messages_delivered_at_idx` ON `agent_task_pending_messages` (`delivered_at`);
