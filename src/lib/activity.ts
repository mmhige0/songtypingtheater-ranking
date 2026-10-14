import { addDays, jstDayRange } from './daily'

// トップの「よく遊んだ人」「よく遊ばれた曲」。昨日までの7日間（日本時間の0時区切り）のプレイ回数で数える。
// 移行分（受付日時がインポート時刻）と除外済みは数えない

export const ACTIVITY_DAYS = 7
export const ACTIVITY_LIMIT = 5
// 期間は日付が変わるまで同じなので、isolateのメモリに保持する。除外の反映は最大TTLの間遅れる
export const ACTIVITY_CACHE_TTL_MS = 60 * 60 * 1000

export type ActivePlayer = { rank: number; name: string; plays: number }
export type PopularSong = { rank: number; gameSongId: string; title: string; plays: number }
export type Activity = {
  // 期間の最初と最後の日付（日本時間の「YYYY-MM-DD」）
  firstDate: string
  lastDate: string
  players: ActivePlayer[]
  songs: PopularSong[]
}

// 数える記録（playの別名p）。?1・?2 受付日時の範囲（?1を含み?2を含まない）
const COUNTED = 'p.received_at >= ?1 AND p.received_at < ?2 AND p.host_player_id IS NOT NULL AND p.excluded_at IS NULL'

// 同じ回数は同じ順位。表示順は回数 → 期間中の最後のプレイが新しい順。名前は期間中の最後のプレイ時の名前
const fetchActivePlayers = async (db: D1Database, from: string, to: string, limit: number) => {
  const { results } = await db
    .prepare(
      `WITH counted AS (
         SELECT pp.player_id, COUNT(*) AS plays, MAX(p.received_at) AS last_at
         FROM play AS p JOIN play_participant AS pp ON pp.play_id = p.play_id
         WHERE ${COUNTED}
         GROUP BY pp.player_id
       ),
       ranked AS (SELECT *, RANK() OVER (ORDER BY plays DESC) AS rank FROM counted)
       SELECT r.rank, r.plays,
         (SELECT pp.name_at_play FROM play_participant AS pp JOIN play AS p ON p.play_id = pp.play_id
          WHERE pp.player_id = r.player_id AND ${COUNTED}
          ORDER BY p.received_at DESC, p.play_id DESC LIMIT 1) AS name
       FROM ranked AS r
       ORDER BY r.rank, r.last_at DESC, r.player_id
       LIMIT ?3`,
    )
    .bind(from, to, limit)
    .all<ActivePlayer>()
  return results
}

const fetchPopularSongs = async (db: D1Database, from: string, to: string, limit: number) => {
  const { results } = await db
    .prepare(
      `WITH counted AS (
         SELECT p.song_ref_id, COUNT(*) AS plays, MAX(p.received_at) AS last_at
         FROM play AS p
         WHERE ${COUNTED}
         GROUP BY p.song_ref_id
       )
       SELECT RANK() OVER (ORDER BY c.plays DESC) AS rank, c.plays, s.game_song_id AS gameSongId, s.title
       FROM counted AS c JOIN song AS s ON s.id = c.song_ref_id AND s.status = 'approved'
       ORDER BY rank, c.last_at DESC, s.id
       LIMIT ?3`,
    )
    .bind(from, to, limit)
    .all<PopularSong>()
  return results
}

let activityCache: { today: string; activity: Activity; expiresAt: number } | null = null

// テスト用。DBの中身を入れ替えたときに呼ぶ
export const clearActivityCache = () => {
  activityCache = null
}

// todayは日本時間の今日。期間はtodayの7日前からtodayの前日まで
export const fetchActivity = async (db: D1Database, today: string): Promise<Activity> => {
  if (activityCache && activityCache.today === today && Date.now() < activityCache.expiresAt) {
    return activityCache.activity
  }
  const firstDate = addDays(today, -ACTIVITY_DAYS)
  const from = jstDayRange(firstDate).from
  const to = jstDayRange(today).from
  const [players, songs] = await Promise.all([
    fetchActivePlayers(db, from, to, ACTIVITY_LIMIT),
    fetchPopularSongs(db, from, to, ACTIVITY_LIMIT),
  ])
  const activity = { firstDate, lastDate: addDays(today, -1), players, songs }
  activityCache = { today, activity, expiresAt: Date.now() + ACTIVITY_CACHE_TTL_MS }
  return activity
}
