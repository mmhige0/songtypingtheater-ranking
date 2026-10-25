// 障害復旧用の全件再集計。通常はplay・参加者のトリガーで自動更新する。
// 2文を同一トランザクションで実行する。既存データのバックフィルと選択規則を一致させる。
export const TEAM_BEST_REBUILD_SQL = [
  'DELETE FROM team_best',
  `INSERT INTO team_best (song_ref_id, player_count, team_key, play_id, score, is_full_combo, received_at, host_player_id, best_fc_score, participants)
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
SELECT song_ref_id, player_count, team_key, play_id, score, is_full_combo, received_at, host_player_id, best_fc_score, (SELECT json_group_array(json_object('name', name_at_play, 'color', color_at_play))
  FROM (SELECT name_at_play, color_at_play FROM play_participant
    WHERE play_id = candidates.play_id ORDER BY CASE color_at_play WHEN 'R' THEN 0 WHEN 'B' THEN 1 WHEN 'Y' THEN 2 ELSE 3 END)) FROM candidates WHERE team_order = 1`,
] as const
