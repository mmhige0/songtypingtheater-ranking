// 障害復旧用の全件再集計。通常はplayのトリガーで自動更新する。
// 2文を同一トランザクションで実行する。既存データのバックフィルと選択規則を一致させる。
export const TEAM_BEST_REBUILD_SQL = [
  'DELETE FROM team_best',
  `INSERT INTO team_best (song_ref_id, player_count, team_key, play_id, score, is_full_combo, received_at, host_player_id, best_fc_score)
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
SELECT song_ref_id, player_count, team_key, play_id, score, is_full_combo, received_at, host_player_id, best_fc_score FROM candidates WHERE team_order = 1`,
] as const
