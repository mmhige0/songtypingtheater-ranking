CREATE TABLE `legacy_identity_mapping` (
	`legacy_player_id` text PRIMARY KEY NOT NULL,
	`new_player_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`legacy_player_id`) REFERENCES `player`(`player_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`new_player_id`) REFERENCES `player`(`player_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "legacy_identity_mapping_status_check" CHECK("legacy_identity_mapping"."status" IN ('pending', 'confirmed'))
);
--> statement-breakpoint
CREATE INDEX `legacy_identity_mapping_new_player_idx` ON `legacy_identity_mapping` (`new_player_id`);--> statement-breakpoint
CREATE TABLE `play_participant` (
	`play_id` text NOT NULL,
	`player_id` text NOT NULL,
	`name_at_play` text NOT NULL,
	`color_at_play` text NOT NULL,
	PRIMARY KEY(`play_id`, `player_id`),
	FOREIGN KEY (`play_id`) REFERENCES `play`(`play_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`player_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "play_participant_color_check" CHECK("play_participant"."color_at_play" IN ('R', 'B', 'Y', 'G'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `play_participant_play_color_unique` ON `play_participant` (`play_id`,`color_at_play`);--> statement-breakpoint
CREATE INDEX `play_participant_player_idx` ON `play_participant` (`player_id`);--> statement-breakpoint
CREATE TABLE `player` (
	`player_id` text PRIMARY KEY NOT NULL,
	`token_hash` text,
	`revoked_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_token_hash_unique` ON `player` (`token_hash`);--> statement-breakpoint
CREATE TABLE `play` (
	`play_id` text PRIMARY KEY NOT NULL,
	`song_ref_id` integer NOT NULL,
	`score` integer NOT NULL,
	`is_full_combo` integer,
	`is_taipen` integer,
	`received_at` text NOT NULL,
	`game_version` text,
	`host_player_id` text,
	`player_count` integer NOT NULL,
	`team_key` text NOT NULL,
	`excluded_at` text,
	FOREIGN KEY (`song_ref_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`host_player_id`) REFERENCES `player`(`player_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "play_score_range" CHECK("play"."score" BETWEEN 0 AND 2147483647),
	CONSTRAINT "play_player_count_range" CHECK("play"."player_count" BETWEEN 1 AND 4),
	CONSTRAINT "play_is_full_combo_bool" CHECK("play"."is_full_combo" IN (0, 1)),
	CONSTRAINT "play_is_taipen_bool" CHECK("play"."is_taipen" IN (0, 1)),
	CONSTRAINT "play_taipen_four_players" CHECK("play"."is_taipen" IS NOT 1 OR "play"."player_count" = 4)
);
--> statement-breakpoint
CREATE INDEX `play_team_best_idx` ON `play` (`song_ref_id`,`player_count`,`team_key`,`score`);--> statement-breakpoint
CREATE INDEX `play_ranking_idx` ON `play` (`song_ref_id`,`player_count`,`score`);--> statement-breakpoint
CREATE TABLE `song` (
	`id` integer PRIMARY KEY NOT NULL,
	`game_song_id` text,
	`title` text NOT NULL,
	`artist` text,
	`level` text,
	`level_sort_value` integer,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "song_status_check" CHECK("song"."status" IN ('approved', 'pending', 'rejected', 'withdrawn')),
	CONSTRAINT "song_approved_has_game_song_id" CHECK("song"."status" <> 'approved' OR "song"."game_song_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `song_game_song_id_unique` ON `song` (`game_song_id`);--> statement-breakpoint
CREATE INDEX `song_status_game_song_number_idx` ON `song` (`status`,CAST("game_song_id" AS INTEGER),`game_song_id`);--> statement-breakpoint
CREATE INDEX `song_status_level_sort_value_idx` ON `song` (`status`,`level_sort_value`);