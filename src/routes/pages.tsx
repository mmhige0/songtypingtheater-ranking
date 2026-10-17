import { PAGE_FEATURES } from '../lib/page-features'
import { Hono, type Context } from 'hono'
import { raw } from 'hono/html'
import type { Child } from 'hono/jsx'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { dailySongs, fetchDailyRankings, jstDate, parseDailyDate } from '../lib/daily'
import { ApiError } from '../lib/http'
import { limitByIp } from '../lib/rate-limit'
import { isTopHost } from '../lib/site-host'
import { fetchPopularSongs } from '../lib/popular-songs'
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
import {
  DAILY_PATH,
  DailyPage,
  ErrorPage,
  PlayerRankingPage,
  SONG_LIST_PATH,
  SongListPage,
  SongRankingPage,
  TopPage,
} from '../views/pages'
import { SiteContext } from '../views/site'

// fetchBestScoresは曲IDを1つずつバインドするため、D1の上限（1クエリ100個）を超えないこと
const SONG_LIST_LIMIT = 100
// 曲別ランキングで人数ごとに表示する件数。超えた分は人数別ページで見る
const SONG_RANKING_LIMIT = 10
const PLAYER_RANKING_LIMIT = 50

const render = (c: Context, page: Child, status: ContentfulStatusCode = 200) =>
  c.html(
    <>
      {raw('<!DOCTYPE html>')}
      <SiteContext.Provider value={{ top: c.env.TOP_ORIGIN, ranking: c.env.TOP_ORIGIN }}>{page}</SiteContext.Provider>
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

// メインホストではトップを出す。旧ランキングホストはindex.tsで転送済み。
// localhost等の別ホストは、従来どおり曲一覧へクエリを保って転送する。
pages.get('/', async (c) => {
  const url = new URL(c.req.url)
  if (!isTopHost(c.env, url)) return c.redirect(`${SONG_LIST_PATH}${url.search}`, 301)
  const today = jstDate(Date.now())
  const [songs, popular] = await Promise.all([
    PAGE_FEATURES.dailySongs ? dailySongs(c.env.DB, today) : [],
    PAGE_FEATURES.popularSongs ? fetchPopularSongs(c.env.DB, today) : null,
  ])
  return render(c, <TopPage today={today} dailySongs={songs} popular={popular} />)
})

pages.get(SONG_LIST_PATH, async (c) => {
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

// 今日の曲。dateで今日を含む7日間の日付を選ぶ（指定なしは今日）
pages.get(DAILY_PATH, async (c) => {
  if (!PAGE_FEATURES.dailySongs) return renderNotFound(c)
  const today = jstDate(Date.now())
  const date = parseDailyDate(c.req.query('date'), today)
  const songs = await fetchDailyRankings(c.env.DB, date, today)
  return render(c, <DailyPage date={date} today={today} songs={songs} />)
})
