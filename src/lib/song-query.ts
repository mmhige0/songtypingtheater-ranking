import type { SongSort, SortDir } from './view-query'

// 公開の曲一覧・ランキングの対象はstatus=approvedの曲だけ

export type SongSummary = {
  id: number
  gameSongId: string
  title: string
  artist: string | null
  level: string | null
}

type SongRow = { id: number; game_song_id: string; title: string; artist: string | null; level: string | null }

const toSummary = (row: SongRow): SongSummary => ({
  id: row.id,
  gameSongId: row.game_song_id,
  title: row.title,
  artist: row.artist,
  level: row.level,
})

// 曲一覧は閲覧のたびに全件走査となりD1の読み取り行数の大半を占めていたため、承認済みの全曲を
// isolateのメモリに保持して絞り込み・並べ替えはJSで行う。曲の登録・更新は最大TTLの間反映されない
export const SONG_CACHE_TTL_MS = 5 * 60 * 1000

type CachedSong = SongSummary & { levelSortValue: number | null; songNumber: number }

let songCache: { songs: CachedSong[]; expiresAt: number } | null = null
// キャッシュ切れに同時に来たリクエストの読み込みを1回にまとめる
let loading: Promise<CachedSong[]> | null = null

// テスト用。DBの中身を入れ替えたときに呼ぶ
export const clearSongCache = () => {
  songCache = null
  loading = null
}

const loadApprovedSongs = (db: D1Database): Promise<CachedSong[]> => {
  if (songCache && Date.now() < songCache.expiresAt) return Promise.resolve(songCache.songs)
  if (loading) return loading
  const current = db
    .prepare(`SELECT id, game_song_id, title, artist, level, level_sort_value FROM song WHERE status = 'approved'`)
    .all<SongRow & { level_sort_value: number | null }>()
    .then(({ results }) => {
      const songs = results.map((row) => ({
        ...toSummary(row),
        levelSortValue: row.level_sort_value,
        songNumber: Number(row.game_song_id),
      }))
      // 読み込み中にclearSongCacheされた場合は古い結果を残さない
      if (loading === current) songCache = { songs, expiresAt: Date.now() + SONG_CACHE_TTL_MS }
      return songs
    })
    .finally(() => {
      if (loading === current) loading = null
    })
  loading = current
  return current
}

// SQLiteのlower()と同じく英字A〜Zだけを小文字にする（全角英字等は区別したまま）
const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32))

// 曲番号・曲名・アーティストの部分一致（英字の大文字・小文字は区別しない）
const matches = (song: CachedSong, q: string | null, level: string | null) => {
  if (level !== null && song.level !== level) return false
  if (q === null) return true
  const lq = asciiLower(q)
  return (
    song.gameSongId.includes(q) || asciiLower(song.title).includes(lq) || asciiLower(song.artist ?? '').includes(lq)
  )
}

const compare = (a: number | string, b: number | string) => (a < b ? -1 : a > b ? 1 : 0)

// 曲番号順は4桁以上・先頭ゼロ混在でも数値順。
// 難易度順は降順でも難易度未設定を最後にし、同じ難易度の中は曲番号の昇順
const byId = (a: CachedSong, b: CachedSong) =>
  compare(a.songNumber, b.songNumber) || compare(a.gameSongId, b.gameSongId)

const songComparator = (sort: SongSort, dir: SortDir) => {
  const sign = dir === 'desc' ? -1 : 1
  if (sort === 'id') return (a: CachedSong, b: CachedSong) => sign * byId(a, b)
  return (a: CachedSong, b: CachedSong) => {
    if (a.levelSortValue === null || b.levelSortValue === null) {
      return compare(a.levelSortValue === null ? 1 : 0, b.levelSortValue === null ? 1 : 0) || byId(a, b)
    }
    return sign * compare(a.levelSortValue, b.levelSortValue) || byId(a, b)
  }
}

export const searchSongs = async (
  db: D1Database,
  {
    q,
    level,
    sort,
    dir,
    limit,
    offset,
  }: { q: string | null; level: string | null; sort: SongSort; dir: SortDir; limit: number; offset: number },
) => {
  const matched = (await loadApprovedSongs(db)).filter((song) => matches(song, q, level))
  matched.sort(songComparator(sort, dir))
  return {
    songs: matched
      .slice(offset, offset + limit)
      .map(({ id, gameSongId, title, artist, level }) => ({ id, gameSongId, title, artist, level })),
    total: matched.length,
  }
}

export const findApprovedSong = async (db: D1Database, gameSongId: string) => {
  const row = await db
    .prepare(`SELECT id, game_song_id, title, artist, level FROM song WHERE game_song_id = ? AND status = 'approved'`)
    .bind(gameSongId)
    .first<SongRow>()
  return row ? toSummary(row) : null
}
