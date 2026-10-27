import type { LevelRange, SongSort, SortDir } from './view-query'

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
export const SONG_CACHE_TTL_MS = 60 * 60 * 1000

type CachedSong = SongSummary & { levelSortValue: number | null; songNumber: number; createdAt: string }

// リクエスト間で共有するのは読み込み済みのデータだけ。読み込み中のPromiseを共有すると、
// 読み込んだリクエストが切断でキャンセルされたとき後続が完了しないPromiseを待ち続けるため
let songCache: { songs: CachedSong[]; expiresAt: number } | null = null
let generation = 0

// テスト用。DBの中身を入れ替えたときに呼ぶ
export const clearSongCache = () => {
  songCache = null
  generation++
}

const loadApprovedSongs = async (db: D1Database): Promise<CachedSong[]> => {
  if (songCache && Date.now() < songCache.expiresAt) return songCache.songs
  const loadedGeneration = generation
  const { results } = await db
    .prepare(
      `SELECT id, game_song_id, title, artist, level, level_sort_value, created_at FROM song WHERE status = 'approved'`,
    )
    .all<SongRow & { level_sort_value: number | null; created_at: string }>()
  const songs = results.map((row) => ({
    ...toSummary(row),
    levelSortValue: row.level_sort_value,
    songNumber: Number(row.game_song_id),
    createdAt: row.created_at,
  }))
  // 読み込み中にclearSongCacheされた場合は古い結果を残さない
  if (loadedGeneration === generation) songCache = { songs, expiresAt: Date.now() + SONG_CACHE_TTL_MS }
  return songs
}

// SQLiteのlower()と同じく英字A〜Zだけを小文字にする（全角英字等は区別したまま）
const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32))

// 英字の大小と、ひらがな・カタカナをそろえて比較する。濁点・半濁点の結合文字も統一する
const normalizeSearchText = (s: string) =>
  asciiLower(s.normalize('NFC')).replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

// 曲番号・曲名・アーティストの部分一致（英字の大小、ひらがな・カタカナは区別しない）。
// レベルの範囲はLv.5〜7なら「5-」〜「7+」で、レベル未設定の曲は含めない
const matches = (song: CachedSong, q: string | null, level: string | null, levelRange: LevelRange | null) => {
  if (level !== null && song.level !== level) return false
  if (
    levelRange !== null &&
    (song.levelSortValue === null ||
      song.levelSortValue < levelRange.min * 3 - 1 ||
      song.levelSortValue > levelRange.max * 3 + 1)
  ) {
    return false
  }
  if (q === null) return true
  const lq = normalizeSearchText(q)
  return (
    song.gameSongId.includes(q) || normalizeSearchText(song.title).includes(lq) || normalizeSearchText(song.artist ?? '').includes(lq)
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
    levelRange,
    sort,
    dir,
    limit,
    offset,
  }: {
    q: string | null
    level: string | null
    levelRange: LevelRange | null
    sort: SongSort
    dir: SortDir
    limit: number
    offset: number
  },
) => {
  const matched = (await loadApprovedSongs(db)).filter((song) => matches(song, q, level, levelRange))
  matched.sort(songComparator(sort, dir))
  return {
    songs: matched
      .slice(offset, offset + limit)
      .map(({ id, gameSongId, title, artist, level }) => ({ id, gameSongId, title, artist, level })),
    total: matched.length,
  }
}

// 承認済みの全曲を曲番号順で返す（今日の曲の選曲用）
export const listApprovedSongs = async (db: D1Database) => [...(await loadApprovedSongs(db))].sort(byId)

export const findApprovedSong = async (db: D1Database, gameSongId: string) => {
  const row = await db
    .prepare(`SELECT id, game_song_id, title, artist, level FROM song WHERE game_song_id = ? AND status = 'approved'`)
    .bind(gameSongId)
    .first<SongRow>()
  return row ? toSummary(row) : null
}

// 既存の曲キャッシュを共有し、公開曲の曲番号順で隣接曲を探す。端では循環しない。
export type AdjacentSongs = { previous: string | null; next: string | null }

export const findAdjacentSongs = async (db: D1Database, gameSongId: string): Promise<AdjacentSongs | null> => {
  const songs = await listApprovedSongs(db)
  const index = songs.findIndex((song) => song.gameSongId === gameSongId)
  if (index < 0) return null
  return {
    previous: songs[index - 1]?.gameSongId ?? null,
    next: songs[index + 1]?.gameSongId ?? null,
  }
}
