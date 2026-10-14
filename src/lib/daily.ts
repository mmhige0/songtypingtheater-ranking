import { invalidRequest } from './http'
import { fetchGroupRankings, type RankingPage } from './ranking'
import { listApprovedSongs, type SongSummary } from './song-query'

// 今日の曲。日付は日本時間の「YYYY-MM-DD」で、0時に切り替わる

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export const DAILY_SONG_COUNT = 4
// ランキングはソロ（1人）とマルチ（2〜4人をまとめた順位）に分け、それぞれ上位DAILY_RANKING_LIMIT件
export const DAILY_GROUPS = [
  { label: 'ソロ', min: 1, max: 1 },
  { label: 'マルチ', min: 2, max: 4 },
] as const
export const DAILY_RANKING_LIMIT = 3
// 今日を含めて選べる日数
export const DAILY_HISTORY_DAYS = 7
// 昨日以前の記録は増えない（受付日時はサーバーの受付時刻）ため長めに保持する。除外の反映は最大TTLの間遅れる
export const DAILY_PAST_CACHE_TTL_MS = 6 * 60 * 60 * 1000

export const jstDate = (now: number) => new Date(now + JST_OFFSET_MS).toISOString().slice(0, 10)

export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

// その日の受付日時の範囲（fromを含みtoを含まない。受付日時と同じUTCのISO 8601）
export const jstDayRange = (date: string) => {
  const start = Date.parse(`${date}T00:00:00Z`) - JST_OFFSET_MS
  return { from: new Date(start).toISOString(), to: new Date(start + DAY_MS).toISOString() }
}

// 日付の文字列から作る疑似乱数（FNV-1aで種を作り、mulberry32で0以上1未満を返す）
const seededRandom = (seed: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193)
  let state = h >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// その日の0時より前に登録された曲から重複なしでcount曲選ぶ。songsは曲番号順で渡す
// （同じ日付・同じ候補なら誰がいつ開いても同じ曲になる）
export const pickDailySongs = <T extends { createdAt: string }>(songs: T[], date: string, count: number): T[] => {
  const { from } = jstDayRange(date)
  const candidates = songs.filter((song) => song.createdAt < from)
  const random = seededRandom(date)
  for (let i = 0; i < Math.min(count, candidates.length); i++) {
    const j = i + Math.floor(random() * (candidates.length - i))
    const picked = candidates[j]!
    candidates[j] = candidates[i]!
    candidates[i] = picked
  }
  return candidates.slice(0, count)
}

// その日の曲。ゲームのミッション（1日ごとの課題曲4曲）と連携するときはここを差し替える
export const dailySongs = async (db: D1Database, date: string): Promise<SongSummary[]> =>
  pickDailySongs(await listApprovedSongs(db), date, DAILY_SONG_COUNT).map(
    ({ id, gameSongId, title, artist, level }) => ({ id, gameSongId, title, artist, level }),
  )

// 選べる日付。今日から新しい順にDAILY_HISTORY_DAYS日
export const dailyDates = (today: string) => Array.from({ length: DAILY_HISTORY_DAYS }, (_, i) => addDays(today, -i))

// 指定なしなら今日。YYYY-MM-DDで、選べる日付のどれかでなければ400
export const parseDailyDate = (value: string | undefined, today: string) => {
  if (value === undefined || value === '') return today
  if (!dailyDates(today).includes(value)) {
    throw invalidRequest(`dateは${addDays(today, 1 - DAILY_HISTORY_DAYS)}〜${today}の日付（YYYY-MM-DD）にしてください`)
  }
  return value
}

export type DailyRanking = { song: SongSummary; rankings: RankingPage[] }

// 昨日以前の分だけisolateのメモリに保持する（今日の分は記録が入るとすぐ出す）
const pastCache = new Map<string, { songs: DailyRanking[]; expiresAt: number }>()

// テスト用。DBの中身を入れ替えたときに呼ぶ
export const clearDailyCache = () => pastCache.clear()

// その日の曲と、その日に受け付けた記録だけのランキング（rankingsはDAILY_GROUPSと同じ順）
export const fetchDailyRankings = async (db: D1Database, date: string, today: string): Promise<DailyRanking[]> => {
  const cached = pastCache.get(date)
  if (date < today && cached && Date.now() < cached.expiresAt) return cached.songs

  const received = jstDayRange(date)
  const songs = await dailySongs(db, date)
  const rankings = await Promise.all(
    songs.map((song) =>
      fetchGroupRankings(db, song.id, DAILY_GROUPS, { fullComboOnly: false, name: null, received }, {
        limit: DAILY_RANKING_LIMIT,
        offset: 0,
      }),
    ),
  )
  const result = songs.map((song, i) => ({ song, rankings: rankings[i]! }))
  if (date < today) {
    const now = Date.now()
    // 期限切れと選べなくなった日付を捨てる
    for (const [key, entry] of pastCache) {
      if (now >= entry.expiresAt || !dailyDates(today).includes(key)) pastCache.delete(key)
    }
    pastCache.set(date, { songs: result, expiresAt: now + DAILY_PAST_CACHE_TTL_MS })
  }
  return result
}
