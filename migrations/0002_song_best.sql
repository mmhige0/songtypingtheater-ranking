CREATE TABLE `song_best` (
	`song_ref_id` integer NOT NULL,
	`player_count` integer NOT NULL,
	`score` integer NOT NULL,
	`is_full_combo` integer,
	`has_full_combo` integer NOT NULL,
	`tied_others` integer NOT NULL,
	`participants` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`song_ref_id`, `player_count`),
	FOREIGN KEY (`song_ref_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- 既存の全記録から曲・人数ごとの1位を作る（src/lib/song-best-sql.tsのSONG_BEST_REBUILD_SQLと同じ）
INSERT INTO song_best (song_ref_id, player_count, score, is_full_combo, has_full_combo, tied_others, participants, updated_at)
WITH top AS (
  SELECT song_ref_id, player_count, MAX(score) AS score, MAX(is_full_combo IS 1) AS has_full_combo FROM play
  WHERE excluded_at IS NULL AND 1 = 1
  GROUP BY song_ref_id, player_count
),
representative AS (
  SELECT p.song_ref_id, p.player_count, p.play_id, p.is_full_combo, p.received_at,
    ROW_NUMBER() OVER (
      PARTITION BY p.song_ref_id, p.player_count, p.team_key
      ORDER BY p.is_full_combo IS 1 DESC, p.received_at, p.play_id
    ) AS team_order
  FROM play AS p
    JOIN top AS t ON t.song_ref_id = p.song_ref_id AND t.player_count = p.player_count AND t.score = p.score
  WHERE p.excluded_at IS NULL
),
ordered AS (
  SELECT song_ref_id, player_count, play_id, is_full_combo,
    ROW_NUMBER() OVER (PARTITION BY song_ref_id, player_count ORDER BY received_at, play_id) AS position,
    COUNT(*) OVER (PARTITION BY song_ref_id, player_count) AS teams
  FROM representative
  WHERE team_order = 1
)
SELECT o.song_ref_id, o.player_count, t.score, o.is_full_combo, t.has_full_combo, o.teams - 1,
  (SELECT json_group_array(json_object('name', pp.name_at_play, 'color', pp.color_at_play))
   FROM play_participant AS pp WHERE pp.play_id = o.play_id),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM ordered AS o
  JOIN top AS t ON t.song_ref_id = o.song_ref_id AND t.player_count = o.player_count
WHERE o.position = 1;
