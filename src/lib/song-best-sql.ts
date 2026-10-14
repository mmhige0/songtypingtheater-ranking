// 曲・人数ごとのランキング1位（song_best）を作るSQL。曲一覧・閲覧APIは表示のたびに記録を集計せず、この表を読む。
// 移行スクリプトからも使うためWorkers固有の型に依存しない（D1の文にするのはsong-best.ts）。
// 記録の受付時に、保存と同じバッチでその曲・人数の分を作り直す。
// 記録を直接変えた後（旧記録の取り込み直し、除外、旧IDと新IDの紐付けの反映）は必ず作り直すこと
// （該当する曲・人数はsongBestRefreshSql、全体はSONG_BEST_REBUILD_SQL）

// 1位の得点の記録からteamKeyごとに代表記録を選び（得点は同じなのでFC → 受付日時 → playId）、
// ランキングの表示順（受付日時 → playId）で先頭の記録と同点の組数を、曲・人数ごとに1件選ぶ。
// has_full_comboは1位に限らず、その曲・人数の記録に1件でもFCがあるか。参加者は色の順を問わないJSON配列
// （表示時に並べ替える）。filterは集計する記録の追加条件（playの列に別名なしで使う）
const songBestSelect = (filter: string, updatedAt: string) => `
WITH top AS (
  SELECT song_ref_id, player_count, MAX(score) AS score, MAX(is_full_combo IS 1) AS has_full_combo FROM play
  WHERE excluded_at IS NULL AND ${filter}
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
  ${updatedAt}
FROM ordered AS o
  JOIN top AS t ON t.song_ref_id = o.song_ref_id AND t.player_count = o.player_count
WHERE o.position = 1`

const INSERT_COLUMNS =
  'INSERT INTO song_best (song_ref_id, player_count, score, is_full_combo, has_full_combo, tied_others, participants, updated_at)'

// 1曲・1人数の分を作り直す2文（?1 曲の内部ID、?2 人数、?3 更新日時）。記録がなくなっていれば行を消したままにする
export const songBestRefreshSql = [
  'DELETE FROM song_best WHERE song_ref_id = ?1 AND player_count = ?2',
  `${INSERT_COLUMNS}${songBestSelect('song_ref_id = ?1 AND player_count = ?2', '?3')}`,
] as const

// 全曲分を作り直す2文（更新日時は実行時刻）。D1の書き込みは行数（最大で曲数×4）の2倍程度
export const SONG_BEST_REBUILD_SQL = [
  'DELETE FROM song_best',
  `${INSERT_COLUMNS}${songBestSelect('1 = 1', "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")}`,
] as const
