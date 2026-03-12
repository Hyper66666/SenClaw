CREATE TABLE `connector_events` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_id` text NOT NULL,
	`payload` text NOT NULL,
	`transformed_input` text,
	`status` text NOT NULL,
	`run_id` text,
	`error` text,
	`received_at` text NOT NULL,
	`processed_at` text,
	FOREIGN KEY (`connector_id`) REFERENCES `connectors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `connector_events_connector_id_idx` ON `connector_events` (`connector_id`);--> statement-breakpoint
CREATE INDEX `connector_events_status_idx` ON `connector_events` (`status`);--> statement-breakpoint
CREATE INDEX `connector_events_received_at_idx` ON `connector_events` (`received_at`);--> statement-breakpoint
CREATE TABLE `connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`agent_id` text NOT NULL,
	`config` text NOT NULL,
	`transformation` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_event_at` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `connectors_type_idx` ON `connectors` (`type`);--> statement-breakpoint
CREATE INDEX `connectors_enabled_idx` ON `connectors` (`enabled`);--> statement-breakpoint
CREATE INDEX `connectors_agent_id_idx` ON `connectors` (`agent_id`);