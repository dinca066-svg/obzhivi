CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`generation_id` text,
	`stage` text NOT NULL,
	`rating` integer,
	`message` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`request_id` text NOT NULL,
	`status` text NOT NULL,
	`provider_task_id` text,
	`style` text NOT NULL,
	`prompt` text NOT NULL,
	`scene_json` text NOT NULL,
	`reference_key` text NOT NULL,
	`reference_token_hash` text NOT NULL,
	`result_url` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_request` ON `generations` (`session_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);