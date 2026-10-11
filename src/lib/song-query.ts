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

// 曲番号順は4桁以上・先頭ゼロ混在でも数値順（索引song_status_game_song_number_idxと同じ式）。
// 難易度順は降順でも難易度未設定を最後にし、同じ難易度の中は曲番号の昇順
const orderBy = (sort: SongSort, dir: SortDir) => {
  const d = dir === 'desc' ? ' DESC' : ''
  return sort === 'id'
    ? `CAST(game_song_id AS INTEGER)${d}, game_song_id${d}`
    : `level_sort_value IS NULL, level_sort_value${d}, CAST(game_song_id AS INTEGER), game_song_id`
}

// 曲番号・曲名・アーティストの部分一致（英字の大文字・小文字は区別しない）は全件走査を許容する
const SEARCH_WHERE = `status = 'approved'
  AND (?1 IS NULL OR instr(game_song_id, ?1) > 0 OR instr(lower(title), lower(?1)) > 0
    OR instr(lower(coalesce(artist, '')), lower(?1)) > 0)
  AND (?2 IS NULL OR level = ?2)`

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
  const [page, count] = await db.batch<unknown>([
    db
      .prepare(
        `SELECT id, game_song_id, title, artist, level FROM song WHERE ${SEARCH_WHERE} ORDER BY ${orderBy(sort, dir)} LIMIT ?3 OFFSET ?4`,
      )
      .bind(q, level, limit, offset),
    db.prepare(`SELECT COUNT(*) AS total FROM song WHERE ${SEARCH_WHERE}`).bind(q, level),
  ])
  return {
    songs: (page!.results as SongRow[]).map(toSummary),
    total: (count!.results[0] as { total: number }).total,
  }
}

export const findApprovedSong = async (db: D1Database, gameSongId: string) => {
  const row = await db
    .prepare(`SELECT id, game_song_id, title, artist, level FROM song WHERE game_song_id = ? AND status = 'approved'`)
    .bind(gameSongId)
    .first<SongRow>()
  return row ? toSummary(row) : null
}
