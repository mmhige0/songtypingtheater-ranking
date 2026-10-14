import { Hono, type Context } from 'hono'
import { raw } from 'hono/html'
import type { Child } from 'hono/jsx'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { addDays, dailySongs, jstDate, jstDayRange } from '../lib/daily'
import { ApiError, invalidRequest } from '../lib/http'
import { limitByIp } from '../lib/rate-limit'
import { fetchBestScores, fetchRankings } from '../lib/ranking'
import { findApprovedSong, searchSongs } from '../lib/song-query'
import {
  PLAYER_COUNTS,
  parseLevelRange,
  parsePage,
  parsePlayerCount,
  parseSearchText,
  parseSongSort,
  parseSortDir,
} from '../lib/view-query'
import { DAILY_PATH, DailyPage, ErrorPage, PlayerRankingPage, SongListPage, SongRankingPage } from '../views/pages'

// fetchBestScoresは曲IDを1つずつバインドするため、D1の上限（1クエリ100個）を超えないこと
const SONG_LIST_LIMIT = 100
// 曲別ランキングで人数ごとに表示する件数。超えた分は人数別ページで見る
const SONG_RANKING_LIMIT = 10
const PLAYER_RANKING_LIMIT = 50
// 今日の曲で人数ごとに表示する件数
const DAILY_RANKING_LIMIT = 3

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
  fullComboOnly: false,
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
  const levelRange = parseLevelRange(c.req.query('levelMin'), c.req.query('levelMax'))
  const sort = parseSongSort(c.req.query('sort'))
  const dir = parseSortDir(c.req.query('dir'))
  const page = parsePage(c.req.query('page'))
  const { songs, total } = await searchSongs(c.env.DB, {
    q,
    level: null,
    levelRange,
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
      levelRange={levelRange}
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
      name={filter.name}
      page={page}
      limit={PLAYER_RANKING_LIMIT}
    />,
  )
})

// 今日の曲。dayを指定しなければ今日、yesterdayなら昨日
pages.get(DAILY_PATH, async (c) => {
  const dayParam = c.req.query('day')
  if (dayParam !== undefined && dayParam !== '' && dayParam !== 'yesterday') {
    throw invalidRequest('dayはyesterdayだけ指定できます')
  }
  const day = dayParam === 'yesterday' ? 'yesterday' : 'today'
  const today = jstDate(Date.now())
  const date = day === 'yesterday' ? addDays(today, -1) : today
  const received = jstDayRange(date)
  const songs = await dailySongs(c.env.DB, date)
  const rankings = await Promise.all(
    songs.map((song) =>
      fetchRankings(c.env.DB, song.id, PLAYER_COUNTS, { fullComboOnly: false, name: null, received }, {
        limit: DAILY_RANKING_LIMIT,
        offset: 0,
      }),
    ),
  )
  return render(
    c,
    <DailyPage
      day={day}
      date={date}
      songs={songs.map((song, i) => ({ song, rankings: rankings[i]! }))}
      limit={DAILY_RANKING_LIMIT}
    />,
  )
})
