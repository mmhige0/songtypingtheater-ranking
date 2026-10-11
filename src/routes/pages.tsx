import { Hono, type Context } from 'hono'
import { raw } from 'hono/html'
import type { Child } from 'hono/jsx'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ApiError } from '../lib/http'
import { limitByIp } from '../lib/rate-limit'
import { fetchBestScores, fetchRankings } from '../lib/ranking'
import { findApprovedSong, searchSongs } from '../lib/song-query'
import {
  PLAYER_COUNTS,
  parseFlag,
  parsePage,
  parsePlayerCount,
  parseSearchText,
  parseSongSort,
  parseSortDir,
} from '../lib/view-query'
import { ErrorPage, PlayerRankingPage, SongListPage, SongRankingPage } from '../views/pages'

const SONG_LIST_LIMIT = 50
// 曲別ランキングで人数ごとに表示する件数。超えた分は人数別ページで見る
const SONG_RANKING_LIMIT = 10
const PLAYER_RANKING_LIMIT = 50

const render = (c: Context, page: Child, status: ContentfulStatusCode = 200) =>
  c.html(
    <>
      {raw('<!DOCTYPE html>')}
      {page}
    </>,
    status,
  )

export const renderNotFound = (c: Context, message = 'ページが見つかりません') =>
  render(c, <ErrorPage title="見つかりません" message={message} />, 404)

const rankingFilter = (c: Context) => ({
  fullComboOnly: parseFlag(c.req.query('fc'), 'fc'),
  name: parseSearchText(c.req.query('name'), 'name'),
})

export const pages = new Hono<{ Bindings: Env }>()

pages.use('*', limitByIp((env) => env.VIEW_IP_LIMITER))

pages.onError((error, c) => {
  if (!(error instanceof ApiError)) throw error
  const title = error.status === 429 ? 'アクセスが集中しています' : '表示できません'
  // レート制限のRetry-After等、エラーに付いたヘッダーもHTML応答に引き継ぐ
  for (const [name, value] of Object.entries(error.headers)) c.header(name, value)
  return render(c, <ErrorPage title={title} message={error.message} />, error.status)
})

pages.get('/', async (c) => {
  const q = parseSearchText(c.req.query('q'), 'q')
  const sort = parseSongSort(c.req.query('sort'))
  const dir = parseSortDir(c.req.query('dir'))
  const page = parsePage(c.req.query('page'))
  const { songs, total } = await searchSongs(c.env.DB, {
    q,
    level: null,
    sort,
    dir,
    limit: SONG_LIST_LIMIT,
    offset: (page - 1) * SONG_LIST_LIMIT,
  })
  const bestScores = await fetchBestScores(
    c.env.DB,
    songs.map((song) => song.id),
  )
  return render(
    c,
    <SongListPage
      songs={songs.map((song) => ({ ...song, bestScores: bestScores.get(song.id)! }))}
      q={q}
      sort={sort}
      dir={dir}
      page={page}
      limit={SONG_LIST_LIMIT}
      total={total}
    />,
  )
})

pages.get('/songs/:gameSongId', async (c) => {
  const selected = parsePlayerCount(c.req.query('players')) ?? 1
  const filter = rankingFilter(c)
  const song = await findApprovedSong(c.env.DB, c.req.param('gameSongId'))
  if (!song) return renderNotFound(c, '曲が見つかりません')

  const rankings = await fetchRankings(c.env.DB, song.id, PLAYER_COUNTS, filter, {
    limit: SONG_RANKING_LIMIT,
    offset: 0,
  })
  return render(
    c,
    <SongRankingPage
      song={song}
      rankings={rankings}
      selected={selected}
      fullComboOnly={filter.fullComboOnly}
      name={filter.name}
      limit={SONG_RANKING_LIMIT}
    />,
  )
})

pages.get('/songs/:gameSongId/players/:players', async (c) => {
  const players = parsePlayerCount(c.req.param('players'))
  if (players === undefined) return renderNotFound(c)
  const filter = rankingFilter(c)
  const page = parsePage(c.req.query('page'))
  const song = await findApprovedSong(c.env.DB, c.req.param('gameSongId'))
  if (!song) return renderNotFound(c, '曲が見つかりません')

  const rankings = await fetchRankings(c.env.DB, song.id, [players], filter, {
    limit: PLAYER_RANKING_LIMIT,
    offset: (page - 1) * PLAYER_RANKING_LIMIT,
  })
  return render(
    c,
    <PlayerRankingPage
      song={song}
      players={players}
      ranking={rankings.get(players)!}
      fullComboOnly={filter.fullComboOnly}
      name={filter.name}
      page={page}
      limit={PLAYER_RANKING_LIMIT}
    />,
  )
})
