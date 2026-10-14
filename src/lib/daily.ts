import { listApprovedSongs, type SongSummary } from './song-query'

// 今日の曲。日付は日本時間の「YYYY-MM-DD」で、0時に切り替わる

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export const DAILY_SONG_COUNT = 4

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
