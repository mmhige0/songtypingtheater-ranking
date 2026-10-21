CREATE TABLE `team_best` (
	`song_ref_id` integer NOT NULL,
	`player_count` integer NOT NULL,
	`team_key` text NOT NULL,
	`play_id` text NOT NULL,
	`score` integer NOT NULL,
	`is_full_combo` integer,
	`received_at` text NOT NULL,
	`host_player_id` text,
	`best_fc_score` integer,
	PRIMARY KEY(`song_ref_id`, `player_count`, `team_key`),
	FOREIGN KEY (`song_ref_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
-- 既存履歴を1チーム1行に集計する。履歴・参加者は削除しない。
INSERT INTO team_best (song_ref_id, player_count, team_key, play_id, score, is_full_combo, received_at, host_player_id, best_fc_score)
WITH candidates AS (
  SELECT song_ref_id, player_count, team_key, play_id, score, is_full_combo, received_at, host_player_id,
    MAX(CASE WHEN is_full_combo = 1 THEN score END) OVER (
      PARTITION BY song_ref_id, player_count, team_key
    ) AS best_fc_score,
    ROW_NUMBER() OVER (
      PARTITION BY song_ref_id, player_count, team_key
      ORDER BY score DESC, is_full_combo IS 1 DESC, received_at, play_id
    ) AS team_order
  FROM play
  WHERE excluded_at IS NULL AND (1 = 1)
)
SELECT song_ref_id, player_count, team_key, play_id, score, is_full_combo, received_at, host_player_id, best_fc_score FROM candidates WHERE team_order = 1;
--> statement-breakpoint
-- 受付時は対象チームの主キーを1回探し、代表またはFC最高点が変わるときだけ書く。
CREATE TRIGGER team_best_play_insert AFTER INSERT ON play
WHEN NEW.excluded_at IS NULL
BEGIN
  INSERT INTO team_best (song_ref_id, player_count, team_key, play_id, score, is_full_combo, received_at, host_player_id, best_fc_score)
  VALUES (NEW.song_ref_id, NEW.player_count, NEW.team_key, NEW.play_id, NEW.score,
    NEW.is_full_combo, NEW.received_at, NEW.host_player_id,
    CASE WHEN NEW.is_full_combo = 1 THEN NEW.score END)
  ON CONFLICT (song_ref_id, player_count, team_key) DO UPDATE SET
  play_id = CASE WHEN (excluded.score > team_best.score
    OR (excluded.score = team_best.score AND (excluded.is_full_combo IS 1) > (team_best.is_full_combo IS 1))
    OR (excluded.score = team_best.score AND (excluded.is_full_combo IS 1) = (team_best.is_full_combo IS 1)
      AND (excluded.received_at, excluded.play_id) < (team_best.received_at, team_best.play_id))) THEN excluded.play_id ELSE team_best.play_id END,
  score = CASE WHEN (excluded.score > team_best.score
    OR (excluded.score = team_best.score AND (excluded.is_full_combo IS 1) > (team_best.is_full_combo IS 1))
    OR (excluded.score = team_best.score AND (excluded.is_full_combo IS 1) = (team_best.is_full_combo IS 1)
      AND (excluded.received_at, excluded.play_id) < (team_best.received_at, team_best.play_id))) THEN excluded.score ELSE team_best.score END,
  is_full_combo = CASE WHEN (excluded.score > team_best.score
    OR (excluded.score = team_best.score AND (excluded.is_full_combo IS 1) > (team_best.is_full_combo IS 1))
    OR (excluded.score = team_best.score AND (excluded.is_full_combo IS 1) = (team_best.is_full_combo IS 1)
      AND (excluded.received_at, excluded.play_id) < (team_best.received_at, team_best.play_id))) THEN excluded.is_full_combo ELSE team_best.is_full_combo END,
  received_at = CASE WHEN (excluded.score > team_best.score
    OR (excluded.score = team_best.score AND (excluded.is_full_combo IS 1) > (team_best.is_full_combo IS 1))
    OR (excluded.score = team_best.score AND (excluded.is_full_combo IS 1) = (team_best.is_full_combo IS 1)
      AND (excluded.received_at, excluded.play_id) < (team_best.received_at, team_best.play_id))) THEN excluded.received_at ELSE team_best.received_at END,
  host_player_id = CASE WHEN (excluded.score > team_best.score
    OR (excluded.score = team_best.score AND (excluded.is_full_combo IS 1) > (team_best.is_full_combo IS 1))
    OR (excluded.score = team_best.score AND (excluded.is_full_combo IS 1) = (team_best.is_full_combo IS 1)
      AND (excluded.received_at, excluded.play_id) < (team_best.received_at, team_best.play_id))) THEN excluded.host_player_id ELSE team_best.host_player_id END,
  best_fc_score = CASE WHEN excluded.best_fc_score IS NOT NULL
    AND (team_best.best_fc_score IS NULL OR excluded.best_fc_score > team_best.best_fc_score) THEN excluded.best_fc_score ELSE team_best.best_fc_score END
  WHERE (excluded.score > team_best.score
    OR (excluded.score = team_best.score AND (excluded.is_full_combo IS 1) > (team_best.is_full_combo IS 1))
    OR (excluded.score = team_best.score AND (excluded.is_full_combo IS 1) = (team_best.is_full_combo IS 1)
      AND (excluded.received_at, excluded.play_id) < (team_best.received_at, team_best.play_id))) OR (excluded.best_fc_score IS NOT NULL
    AND (team_best.best_fc_score IS NULL OR excluded.best_fc_score > team_best.best_fc_score));
END;
--> statement-breakpoint
-- 訂正・除外・復帰・旧ID紐付けでは旧グループと新グループを履歴から再集計する。
CREATE TRIGGER team_best_play_update
AFTER UPDATE OF play_id, song_ref_id, player_count, team_key, score, is_full_combo, received_at, host_player_id, excluded_at ON play
WHEN OLD.play_id IS NOT NEW.play_id OR
  OLD.song_ref_id IS NOT NEW.song_ref_id OR
  OLD.player_count IS NOT NEW.player_count OR
  OLD.team_key IS NOT NEW.team_key OR
  OLD.score IS NOT NEW.score OR
  OLD.is_full_combo IS NOT NEW.is_full_combo OR
  OLD.received_at IS NOT NEW.received_at OR
  OLD.host_player_id IS NOT NEW.host_player_id OR
  OLD.excluded_at IS NOT NEW.excluded_at
BEGIN
  DELETE FROM team_best WHERE (song_ref_id = OLD.song_ref_id AND player_count = OLD.player_count AND team_key = OLD.team_key) OR (song_ref_id = NEW.song_ref_id AND player_count = NEW.player_count AND team_key = NEW.team_key);
  INSERT INTO team_best (song_ref_id, player_count, team_key, play_id, score, is_full_combo, received_at, host_player_id, best_fc_score)
  WITH candidates AS (
  SELECT song_ref_id, player_count, team_key, play_id, score, is_full_combo, received_at, host_player_id,
    MAX(CASE WHEN is_full_combo = 1 THEN score END) OVER (
      PARTITION BY song_ref_id, player_count, team_key
    ) AS best_fc_score,
    ROW_NUMBER() OVER (
      PARTITION BY song_ref_id, player_count, team_key
      ORDER BY score DESC, is_full_combo IS 1 DESC, received_at, play_id
    ) AS team_order
  FROM play
  WHERE excluded_at IS NULL AND ((song_ref_id = OLD.song_ref_id AND player_count = OLD.player_count AND team_key = OLD.team_key) OR (song_ref_id = NEW.song_ref_id AND player_count = NEW.player_count AND team_key = NEW.team_key))
)
SELECT song_ref_id, player_count, team_key, play_id, score, is_full_combo, received_at, host_player_id, best_fc_score FROM candidates WHERE team_order = 1;
END;
--> statement-breakpoint
-- 代表かFC最高点の削除時だけ次点を復帰する。参加者は別表なのでCASCADEの順序に依存しない。
CREATE TRIGGER team_best_play_delete AFTER DELETE ON play
WHEN OLD.excluded_at IS NULL AND EXISTS (
  SELECT 1 FROM team_best WHERE song_ref_id = OLD.song_ref_id AND player_count = OLD.player_count AND team_key = OLD.team_key
    AND (play_id = OLD.play_id OR (OLD.is_full_combo = 1 AND best_fc_score = OLD.score))
)
BEGIN
  DELETE FROM team_best WHERE song_ref_id = OLD.song_ref_id AND player_count = OLD.player_count AND team_key = OLD.team_key;
  INSERT INTO team_best (song_ref_id, player_count, team_key, play_id, score, is_full_combo, received_at, host_player_id, best_fc_score)
  WITH candidates AS (
  SELECT song_ref_id, player_count, team_key, play_id, score, is_full_combo, received_at, host_player_id,
    MAX(CASE WHEN is_full_combo = 1 THEN score END) OVER (
      PARTITION BY song_ref_id, player_count, team_key
    ) AS best_fc_score,
    ROW_NUMBER() OVER (
      PARTITION BY song_ref_id, player_count, team_key
      ORDER BY score DESC, is_full_combo IS 1 DESC, received_at, play_id
    ) AS team_order
  FROM play
  WHERE excluded_at IS NULL AND (song_ref_id = OLD.song_ref_id AND player_count = OLD.player_count AND team_key = OLD.team_key)
)
SELECT song_ref_id, player_count, team_key, play_id, score, is_full_combo, received_at, host_player_id, best_fc_score FROM candidates WHERE team_order = 1;
END;
