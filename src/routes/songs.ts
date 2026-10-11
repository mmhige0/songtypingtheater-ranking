import { Hono } from 'hono'
import { ApiError, invalidRequest } from '../lib/http'
import { limitByIp } from '../lib/rate-limit'
import { fetchBestScores, fetchRankings } from '../lib/ranking'
import { findApprovedSong, searchSongs, type SongSummary } from '../lib/song-query'
import {
  parseFlag,
  parseLevel,
  parseLimit,
  parsePage,
  parsePlayerCount,
  parseSearchText,
  parseSongSort,
  parseSortDir,
} from '../lib/view-query'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

// 内部IDは公開しない
const toPublicSong = ({ gameSongId, title, artist, level }: SongSummary) => ({ gameSongId, title, artist, level })

export const songsRoute = new Hono<{ Bindings: Env }>()

songsRoute.use('*', limitByIp((env) => env.VIEW_IP_LIMITER))

songsRoute.get('/', async (c) => {
  const page = parsePage(c.req.query('page'))
  const limit = parseLimit(c.req.query('limit'), DEFAULT_LIMIT, MAX_LIMIT)
  const { songs, total } = await searchSongs(c.env.DB, {
    q: parseSearchText(c.req.query('q'), 'q'),
    level: parseLevel(c.req.query('level')),
    sort: parseSongSort(c.req.query('sort')),
    dir: parseSortDir(c.req.query('dir')),
    limit,
    offset: (page - 1) * limit,
  })
  const bestScores = await fetchBestScores(
    c.env.DB,
    songs.map((song) => song.id),
  )
  return c.json({
    songs: songs.map((song) => ({ ...toPublicSong(song), bestScores: bestScores.get(song.id) })),
    page,
    limit,
    total,
  })
})

songsRoute.get('/:gameSongId/rankings', async (c) => {
  const players = parsePlayerCount(c.req.query('players'))
  if (players === undefined) throw invalidRequest('playersは1〜4にしてください')
  const page = parsePage(c.req.query('page'))
  const limit = parseLimit(c.req.query('limit'), DEFAULT_LIMIT, MAX_LIMIT)
  const filter = { fullComboOnly: parseFlag(c.req.query('fc'), 'fc'), name: parseSearchText(c.req.query('name'), 'name') }

  const song = await findApprovedSong(c.env.DB, c.req.param('gameSongId'))
  if (!song) throw new ApiError(404, 'NOT_FOUND', '曲が見つかりません')

  const rankings = await fetchRankings(c.env.DB, song.id, [players], filter, { limit, offset: (page - 1) * limit })
  const { entries, total } = rankings.get(players)!
  return c.json({ song: toPublicSong(song), players, entries, page, limit, total })
})
