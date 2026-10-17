CREATE TABLE `membership_requests` (
	`community_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` text,
	PRIMARY KEY(`community_id`, `user_id`),
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `membership_requests_status_idx` ON `membership_requests` (`community_id`,`status`);--> statement-breakpoint
ALTER TABLE `communities` ADD `join_approval` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `topics` ADD `withdrawn` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `topics` ADD `updated_at` integer;