import { addDays, jstDayRange } from './daily'

// トップの人気曲。昨日までの7日間（日本時間の0時区切り）の曲ごとのプレイ回数で数える。
// 移行分（受付日時がインポート時刻）と除外済みは数えない

export const POPULAR_SONG_DAYS = 7
export const POPULAR_SONG_LIMIT = 5
// 期間は日付が変わるまで同じなので、isolateのメモリに保持する。除外の反映は最大TTLの間遅れる
export const POPULAR_SONGS_CACHE_TTL_MS = 60 * 60 * 1000

export type PopularSong = { rank: number; gameSongId: string; title: string; artist: string | null }
export type PopularSongs = {
  // 期間の最初と最後の日付（日本時間の「YYYY-MM-DD」）
  firstDate: string
  lastDate: string
  songs: PopularSong[]
}

// 数える記録（playの別名p）。?1・?2 受付日時の範囲（?1を含み?2を含まない）
const COUNTED = 'p.received_at >= ?1 AND p.received_at < ?2 AND p.host_player_id IS NOT NULL AND p.excluded_at IS NULL'

// 同じ回数は同じ順位。表示順は回数 → 期間中の最後のプレイが新しい順
const queryPopularSongs = async (db: D1Database, from: string, to: string, limit: number) => {
  const { results } = await db
    .prepare(
      `WITH counted AS (
         SELECT p.song_ref_id, COUNT(*) AS plays, MAX(p.received_at) AS last_at
         FROM play AS p
         WHERE ${COUNTED}
         GROUP BY p.song_ref_id
       )
       SELECT RANK() OVER (ORDER BY c.plays DESC) AS rank, s.game_song_id AS gameSongId, s.title, s.artist
       FROM counted AS c JOIN song AS s ON s.id = c.song_ref_id AND s.status = 'approved'
       ORDER BY rank, c.last_at DESC, s.id
       LIMIT ?3`,
    )
    .bind(from, to, limit)
    .all<PopularSong>()
  return results
}

let popularSongsCache: { today: string; popular: PopularSongs; expiresAt: number } | null = null

// テスト用。DBの中身を入れ替えたときに呼ぶ
export const clearPopularSongsCache = () => {
  popularSongsCache = null
}

// todayは日本時間の今日。期間はtodayの7日前からtodayの前日まで
export const fetchPopularSongs = async (db: D1Database, today: string): Promise<PopularSongs> => {
  if (popularSongsCache && popularSongsCache.today === today && Date.now() < popularSongsCache.expiresAt) {
    return popularSongsCache.popular
  }
  const firstDate = addDays(today, -POPULAR_SONG_DAYS)
  const from = jstDayRange(firstDate).from
  const to = jstDayRange(today).from
  const songs = await queryPopularSongs(db, from, to, POPULAR_SONG_LIMIT)
  const popular = { firstDate, lastDate: addDays(today, -1), songs }
  popularSongsCache = { today, popular, expiresAt: Date.now() + POPULAR_SONGS_CACHE_TTL_MS }
  return popular
}
