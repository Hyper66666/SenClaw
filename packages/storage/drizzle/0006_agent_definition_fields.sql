ALTER TABLE `agents` ADD `effort` text DEFAULT 'medium' NOT NULL;
--> statement-breakpoint
ALTER TABLE `agents` ADD `isolation` text DEFAULT 'shared' NOT NULL;
--> statement-breakpoint
ALTER TABLE `agents` ADD `permission_mode` text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
ALTER TABLE `agents` ADD `mode` text DEFAULT 'standard' NOT NULL;
--> statement-breakpoint
ALTER TABLE `agents` ADD `max_turns` integer;
--> statement-breakpoint
ALTER TABLE `agents` ADD `background` integer DEFAULT false NOT NULL;
