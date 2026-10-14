import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/index'
import { fetchPopularSongs, POPULAR_SONGS_CACHE_TTL_MS } from '../src/lib/popular-songs'
import { DAILY_PAST_CACHE_TTL_MS, dailySongs } from '../src/lib/daily'
import { resetDb } from './helpers'
import { at, insertPlay, insertPlayers, insertSong } from './view-helpers'

// 架空のID・名前のみ使用
const IDS = Array.from({ length: 12 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)

const get = (path: string, testEnv: Env = env) => app.request(path, {}, testEnv)

// トップのホスト（vitest.config.tsで本番の値に固定）。相対パスのリクエストはlocalhost＝ランキング側になる
const TOP = 'https://kayomodoki.com/'
const RANKING = 'https://ranking.kayomodoki.com'

const html = async (path: string, status = 200) => {
  const res = await get(path)
  expect(res.status, path).toBe(status)
  expect(res.headers.get('Content-Type')).toContain('text/html')
  const text = await res.text()
  expect(text.startsWith('<!DOCTYPE html>')).toBe(true)
  return text
}

let song: number

beforeEach(async () => {
  await resetDb()
  song = await insertSong('001', '架空の曲名', { artist: '架空のアーティスト', level: '5+', levelSortValue: 16 })
  await insertPlayers(...IDS)
})

describe('top page', () => {
  // 日本時間 2026-10-14 12:00。人気曲の期間は10/7 0:00〜10/14 0:00（日本時間）
  const NOW_UTC = '2026-10-14T03:00:00.000Z'
  const FIRST = '2026-10-06T15:00:00.000Z'
  const solo = (i: number, name: string) => [{ id: IDS[i]!, name, color: 'R' as const }]
  const popularSection = (text: string) => {
    const start = text.indexOf('id="popular-title"')
    return text.slice(start, text.indexOf('</section>', start))
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(NOW_UTC))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('links to the editor, practice and the ranking, with credits and without the subtitle', async () => {
    const text = await html(TOP)
    expect(text).toContain('<title>Song Typing Theater</title>')
    expect(text).not.toContain('class="brand-sub"')
    expect(text).toContain('href="https://ldc.kayomodoki.com/editor"')
    expect(text).toContain('href="https://ldc.kayomodoki.com/songs"')
    expect(text).toContain(`href="${RANKING}/songs"`)
    expect(text).toContain('クレジット')
    expect(text).toContain('href="https://ytyping.net/" target="_blank" rel="noopener noreferrer"')
    expect(text).not.toContain('新着記録')
  })

  it('links the site name on ranking pages to the top', async () => {
    const text = await html('/songs')
    expect(text).toContain('<a class="brand" href="https://kayomodoki.com/">')
    expect(text).toContain('class="brand-sub"')
  })

  it("lists today's songs and links to their ranking", async () => {
    for (let i = 2; i <= 6; i++) await insertSong(String(i).padStart(3, '0'), `架空の曲${i}`)
    const picked = await dailySongs(env.DB, '2026-10-14')
    const text = await html(TOP)
    expect(text).toContain('>10/14<')
    expect(text).not.toContain('(水)')
    expect(text.match(/class="box daily-title"/g)).toHaveLength(4)
    for (const s of picked) expect(text).toContain(`href="${RANKING}/songs/${s.gameSongId}"`)
    expect(text).toContain(`href="${RANKING}/daily"`)
  })

  it('counts plays by song over the 7 days up to yesterday', async () => {
    const song2 = await insertSong('002', '別の曲')
    const at = (ms: number) => new Date(Date.parse(FIRST) + ms).toISOString()
    for (let i = 0; i < 3; i++) {
      await insertPlay({ playId: `a${i}`, songRefId: song, score: 1, participants: solo(i, `P${i}`), receivedAt: at(i) })
    }
    await insertPlay({
      playId: 'duo',
      songRefId: song2,
      score: 1,
      participants: [
        { id: IDS[0]!, name: 'P0', color: 'R' },
        { id: IDS[1]!, name: 'P1', color: 'B' },
      ],
      receivedAt: at(100),
    })
    await insertPlay({ playId: 'b1', songRefId: song2, score: 1, participants: solo(1, 'P1'), receivedAt: at(200) })
    // 期間の直前・今日・移行分・除外済みは数えない
    await insertPlay({ playId: 'early', songRefId: song2, score: 1, participants: solo(2, 'P2'), receivedAt: at(-1) })
    await insertPlay({ playId: 'today', songRefId: song2, score: 1, participants: solo(3, 'P3'), receivedAt: '2026-10-13T15:00:00.000Z' })
    await insertPlay({ playId: 'legacy', songRefId: song2, score: 1, participants: solo(4, 'P4'), receivedAt: at(300), hostPlayerId: null })
    await insertPlay({ playId: 'excluded', songRefId: song2, score: 1, participants: solo(5, 'P5'), receivedAt: at(300), excluded: true })

    const text = await html(TOP)
    expect(text).not.toContain('よく遊んだ人')
    const popular = popularSection(text)
    expect(popular).toContain('>人気曲</h2>')
    expect(popular).toContain('10/7〜10/13')
    expect(popular.indexOf('架空の曲名')).toBeLessThan(popular.indexOf('別の曲'))
    expect(popular).toContain(`href="${RANKING}/songs/001"`)
    // 回数は出さず、曲番・曲名・アーティスト名の順に出す
    expect(popular).not.toContain('回<')
    const row = popular.slice(popular.indexOf('>No.001<'))
    expect(row.indexOf('>No.001<')).toBeLessThan(row.indexOf('架空の曲名'))
    expect(row.indexOf('架空の曲名')).toBeLessThan(row.indexOf('架空のアーティスト'))
  })

  it('gives tied counts the same rank and shows 5 at most', async () => {
    for (let i = 0; i < 6; i++) {
      const ref = await insertSong(String(100 + i), `曲${i}`)
      await insertPlay({ playId: `p${i}`, songRefId: ref, score: 1, participants: solo(i, `P${i}`), receivedAt: FIRST })
    }
    const popular = popularSection(await html(TOP))
    expect(popular.match(/class="popular-row"/g)).toHaveLength(5)
    expect(popular.match(/>1位</g)).toHaveLength(5)
  })

  it('caches the counts until the date changes or an hour passes', async () => {
    const song2 = await insertSong('002', '別の曲')
    await insertPlay({ playId: 'p0', songRefId: song, score: 1, participants: solo(0, 'P0'), receivedAt: FIRST })
    expect((await fetchPopularSongs(env.DB, '2026-10-14')).songs).toHaveLength(1)
    await insertPlay({ playId: 'p1', songRefId: song2, score: 1, participants: solo(1, 'P1'), receivedAt: FIRST })
    expect((await fetchPopularSongs(env.DB, '2026-10-14')).songs).toHaveLength(1)

    vi.setSystemTime(new Date(Date.parse(NOW_UTC) + POPULAR_SONGS_CACHE_TTL_MS + 1))
    expect((await fetchPopularSongs(env.DB, '2026-10-14')).songs).toHaveLength(2)

    await insertPlay({ playId: 'p2', songRefId: song, score: 1, participants: solo(2, 'P2'), receivedAt: '2026-10-13T15:00:00.000Z' })
    const nextDay = await fetchPopularSongs(env.DB, '2026-10-15')
    expect(nextDay.firstDate).toBe('2026-10-08')
    expect(nextDay.songs).toHaveLength(1)
  })

  it('redirects other paths on the top host to the ranking host', async () => {
    for (const path of ['songs', 'songs/001?players=2', 'api/v1/songs']) {
      const res = await get(`${TOP}${path}`)
      expect(res.status, path).toBe(301)
      expect(res.headers.get('Location')).toBe(`${RANKING}/${path}`)
    }
    const post = await app.request(`${TOP}api/v1/plays`, { method: 'POST' }, env)
    expect(post.status).toBe(404)
  })

  it('serves both the top and the ranking on one host when the origins are the same', async () => {
    const single = { ...env, TOP_ORIGIN: 'http://localhost:8787', RANKING_ORIGIN: 'http://localhost:8787' }
    const top = await get('/', single)
    expect(top.status).toBe(200)
    const text = await top.text()
    expect(text).toContain('id="popular-title"')
    expect(text).toContain('href="http://localhost:8787/songs"')
    expect((await get('/songs', single)).status).toBe(200)
  })

  it('redirects the ranking root to the song list with the same query', async () => {
    for (const query of ['', '?q=abc', '?sort=level&dir=asc', '?page=2']) {
      const res = await get(`/${query}`)
      expect(res.status, query).toBe(301)
      expect(res.headers.get('Location')).toBe(`/songs${query}`)
    }
  })
})

describe('song list page', () => {
  it('shows songs with best scores and the solo top player', async () => {
    await insertPlay({
      playId: 'p1',
      songRefId: song,
      score: 123456,
      participants: [{ id: IDS[0]!, name: 'ソロの人', color: 'R' }],
    })
    const text = await html('/songs')
    expect(text).toContain('架空の曲名')
    expect(text).toContain('123,456')
    expect(text).toContain('ソロの人')
    expect(text).toContain('href="/songs/001?players=1"')
    expect(text).toContain('<h1 class="page-title">ランキング</h1>')
    // No.・曲名・Lv.の3セルがどれも曲別ランキングへのリンク（Tab移動は曲名だけ）
    expect(text.match(/class="cell-link[^"]*" href="\/songs\/001"/g)).toHaveLength(3)
    expect(text.match(/href="\/songs\/001" tabindex="-1" aria-hidden="true"/g)).toHaveLength(2)
    expect(text).not.toContain('class="dot')
  })

  it('shows every member of the top team and the full combo mark', async () => {
    await insertPlay({
      playId: 'p1',
      songRefId: song,
      score: 4000,
      participants: [
        { id: IDS[0]!, name: 'よにんめ', color: 'G' },
        { id: IDS[1]!, name: 'ひとりめ', color: 'R' },
        { id: IDS[2]!, name: 'さんにんめ', color: 'Y' },
        { id: IDS[3]!, name: 'ふたりめ', color: 'B' },
      ],
      isFullCombo: true,
    })
    const text = await html('/songs')
    const cell = text.slice(text.indexOf('href="/songs/001?players=4"'))
    expect(cell.indexOf('ひとりめ')).toBeLessThan(cell.indexOf('ふたりめ'))
    expect(cell.indexOf('さんにんめ')).toBeLessThan(cell.indexOf('よにんめ'))
    expect(cell.indexOf('aria-label="フルコンボ"')).toBeLessThan(cell.indexOf('</td>'))
  })

  it('colors a cell with any full combo record, marking only a full combo top', async () => {
    const solo = (playId: string, i: number, score: number, isFullCombo: boolean, excluded = false) =>
      insertPlay({
        playId,
        songRefId: song,
        score,
        participants: [{ id: IDS[i]!, name: `Player${i}`, color: 'R' }],
        isFullCombo,
        excluded,
      })
    // 1位はFCではないが、2位にFCがある
    await solo('top', 0, 900, false)
    await solo('second-fc', 1, 800, true)
    // 2人の記録のFCは除外済みだけ
    await insertPlay({
      playId: 'excluded-fc',
      songRefId: song,
      score: 700,
      participants: [
        { id: IDS[2]!, name: 'Player2', color: 'R' },
        { id: IDS[3]!, name: 'Player3', color: 'B' },
      ],
      isFullCombo: true,
      excluded: true,
    })
    await insertPlay({
      playId: 'pair',
      songRefId: song,
      score: 600,
      participants: [
        { id: IDS[2]!, name: 'Player2', color: 'R' },
        { id: IDS[3]!, name: 'Player3', color: 'B' },
      ],
    })
    const text = await html('/songs')
    const cell = (count: number) => {
      const start = text.lastIndexOf('<td', text.indexOf(`href="/songs/001?players=${count}"`))
      return text.slice(start, text.indexOf('</td>', start))
    }
    expect(cell(1)).toMatch(/^<td class="best full-combo">/)
    expect(cell(1)).not.toContain('aria-label="フルコンボ"')
    expect(cell(2)).toMatch(/^<td class="best">/)
  })

  it('shows a message when nothing matches', async () => {
    expect(await html('/songs?q=存在しない曲')).toContain('条件に一致する曲がありません')
  })

  it('filters songs by level range including + and - levels', async () => {
    await insertSong('002', 'レベル3の曲', { level: '3', levelSortValue: 9 })
    await insertSong('003', 'レベル7-の曲', { level: '7-', levelSortValue: 20 })
    await insertSong('004', 'レベル未設定の曲', { level: '?' })
    await insertSong('005', 'レベル7+の曲', { level: '7+', levelSortValue: 22 })
    for (const path of ['/songs?levelMin=5&levelMax=7', '/songs?levelMin=7&levelMax=5']) {
      const text = await html(path)
      expect(text, path).toContain('架空の曲名')
      expect(text, path).toContain('レベル7-の曲')
      expect(text, path).toContain('レベル7+の曲')
      expect(text, path).not.toContain('レベル3の曲')
      expect(text, path).not.toContain('レベル未設定の曲')
      expect(text, path).toContain('全3曲')
      // 並べ替え・ページ送り・検索のクリアでも範囲を保つ
      expect(text, path).toContain('href="/songs?levelMin=5&amp;levelMax=7&amp;dir=asc"')
      expect(text, path).toContain('href="/songs?levelMin=5&amp;levelMax=7&amp;sort=level"')
    }
    // 全範囲は絞り込まず、レベル未設定の曲も出す。既定値はリンクに付けない
    const all = await html('/songs?levelMin=1&levelMax=10')
    expect(all).toContain('レベル未設定の曲')
    expect(all).toContain('href="/songs?dir=asc"')
    const upper = await html('/songs?levelMax=3')
    expect(upper).toContain('レベル3の曲')
    expect(upper).not.toContain('架空の曲名')
    expect(upper).toContain('href="/songs?levelMax=3&amp;dir=asc"')
    expect(await html('/songs?levelMin=8')).toContain('条件に一致する曲がありません')
  })

  it('renders a table whose sort headers toggle the direction', async () => {
    await insertSong('002', '架空の曲2', { level: '3', levelSortValue: 9 })
    const text = await html('/songs')
    expect(text).toContain('<table class="songs">')
    expect(text).toContain('全2曲')
    expect(text).not.toContain('<select')
    expect(text).toContain('href="/songs?dir=asc"')
    expect(text).toContain('href="/songs?sort=level"')
    expect(text).toContain('aria-sort="descending"')
    expect(text.indexOf('架空の曲2')).toBeLessThan(text.indexOf('架空の曲名'))

    const asc = await html('/songs?dir=asc&q=架空')
    expect(asc.indexOf('架空の曲名')).toBeLessThan(asc.indexOf('架空の曲2'))
    expect(asc).toContain('aria-sort="ascending"')
    expect(asc).toContain(`href="/songs?q=${encodeURIComponent('架空')}"`)
    expect(asc).toContain('<input type="hidden" name="dir" value="asc"/>')
  })

  it('links every page by its page number', async () => {
    await env.DB.batch(
      Array.from({ length: 100 }, (_, i) =>
        env.DB.prepare(
          `INSERT INTO song (game_song_id, title, status, created_at, updated_at) VALUES (?, ?, 'approved', ?, ?)`,
        ).bind(String(100 + i), `曲${i}`, at(0), at(0)),
      ),
    )
    const first = await html('/songs?sort=level')
    expect(first).toContain('全101曲')
    expect(first).toContain('<a class="chip active num" href="/songs?sort=level" aria-current="page">1</a>')
    expect(first).toContain('<a class="chip num" href="/songs?sort=level&amp;page=2">2</a>')
    expect(first).toContain('data-live-nav="top"')
    expect(first).toContain('data-live-nav="bottom"')
    const second = await html('/songs?sort=level&page=2')
    expect(second).toContain('<a class="chip active num" href="/songs?sort=level&amp;page=2" aria-current="page">2</a>')
    expect(second).toContain('<span class="button button-outline" aria-disabled="true">次へ</span>')
  })
})

describe('daily page', () => {
  // 日本時間 2026-10-14 12:00
  const NOW_UTC = '2026-10-14T03:00:00.000Z'

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(NOW_UTC))
    for (let i = 2; i <= 6; i++) await insertSong(String(i).padStart(3, '0'), `架空の曲${i}`)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const solo = (i: number, name: string) => [{ id: IDS[i]!, name, color: 'R' as const }]

  it('shows four songs of the day and links to it from the song list', async () => {
    const picked = await dailySongs(env.DB, '2026-10-14')
    expect(picked).toHaveLength(4)
    const text = await html('/daily')
    expect(text).toContain('<h1 class="page-title">今日の曲</h1>')
    expect(text).not.toContain('受け付けた記録だけで')
    // 今日を左端に新しい順の7日分。今日はdateを付けない
    const chips = [...text.matchAll(/<a class="chip( active)? num" href="([^"]*)"[^>]*>([^<]*)</g)].map((m) => [m[2], m[3], !!m[1]])
    expect(chips).toEqual([
      ['/daily', '10/14', true],
      ['/daily?date=2026-10-13', '10/13', false],
      ['/daily?date=2026-10-12', '10/12', false],
      ['/daily?date=2026-10-11', '10/11', false],
      ['/daily?date=2026-10-10', '10/10', false],
      ['/daily?date=2026-10-09', '10/9', false],
      ['/daily?date=2026-10-08', '10/8', false],
    ])
    for (const song of picked) expect(text).toContain(`href="/songs/${song.gameSongId}"`)
    expect(text.match(/class="box daily-song"/g)).toHaveLength(4)
    expect(text.match(/class="daily-panel-title">ソロ</g)).toHaveLength(4)
    expect(text.match(/class="daily-panel-title">マルチ</g)).toHaveLength(4)
    expect(text).toContain('記録なし')
    expect(await html('/songs')).toContain('href="/daily"')
  })

  it('ranks only the records received on that day in Japan time', async () => {
    const [song1] = await dailySongs(env.DB, '2026-10-14')
    const ref = (await env.DB.prepare('SELECT id FROM song WHERE game_song_id = ?').bind(song1!.gameSongId).first<{ id: number }>())!.id
    // 日本時間 10/13 23:59:59 と 10/14 0:00
    await insertPlay({ playId: 'before', songRefId: ref, score: 900, participants: solo(0, '前日の人'), receivedAt: '2026-10-13T14:59:59.999Z' })
    await insertPlay({ playId: 'first', songRefId: ref, score: 100, participants: solo(1, '当日の人'), receivedAt: '2026-10-13T15:00:00.000Z' })
    await insertPlay({ playId: 'legacy', songRefId: ref, score: 800, participants: solo(2, '移行の人'), receivedAt: '2026-10-14T01:00:00.000Z', hostPlayerId: null })
    await insertPlay({ playId: 'excluded', songRefId: ref, score: 700, participants: solo(3, '除外の人'), receivedAt: '2026-10-14T01:00:00.000Z', excluded: true })
    const today = await html('/daily')
    expect(today).toContain('当日の人')
    expect(today).toContain('1位')
    for (const name of ['前日の人', '移行の人', '除外の人']) expect(today).not.toContain(name)

    // 昨日（10/13）の曲が同じ曲とは限らないため、昨日の曲に前日の記録を入れて確認する
    const [yesterdaySong] = await dailySongs(env.DB, '2026-10-13')
    const yref = (await env.DB.prepare('SELECT id FROM song WHERE game_song_id = ?').bind(yesterdaySong!.gameSongId).first<{ id: number }>())!.id
    await insertPlay({ playId: 'yesterday', songRefId: yref, score: 500, participants: solo(4, '昨日の人'), receivedAt: '2026-10-13T10:00:00.000Z' })
    const yesterday = await html('/daily?date=2026-10-13')
    expect(yesterday).toMatch(/class="chip active num" href="\/daily\?date=2026-10-13" aria-current="page">10\/13</)
    expect(yesterday).toContain('昨日の人')
    expect(yesterday).not.toContain('当日の人')
  })

  it('ranks 2 to 4 player records together as multi, without the player count', async () => {
    const [song1] = await dailySongs(env.DB, '2026-10-14')
    const ref = (await env.DB.prepare('SELECT id FROM song WHERE game_song_id = ?').bind(song1!.gameSongId).first<{ id: number }>())!.id
    const team = (ids: number[], prefix: string) =>
      ids.map((i, n) => ({ id: IDS[i]!, name: `${prefix}${n}`, color: (['R', 'B', 'Y', 'G'] as const)[n]! }))
    const received = '2026-10-14T01:00:00.000Z'
    await insertPlay({ playId: 'solo', songRefId: ref, score: 999, participants: solo(0, 'ソロの人'), receivedAt: received })
    await insertPlay({ playId: 'duo', songRefId: ref, score: 300, participants: team([1, 2], '二人'), receivedAt: received })
    await insertPlay({ playId: 'quad', songRefId: ref, score: 500, participants: team([3, 4, 5, 6], '四人'), receivedAt: received })
    await insertPlay({ playId: 'trio', songRefId: ref, score: 400, participants: team([7, 8, 9], '三人'), receivedAt: received })
    const text = await html('/daily')
    const card = text.slice(text.indexOf(`href="/songs/${song1!.gameSongId}"`))
    const multi = card.slice(card.indexOf('>マルチ<'), card.indexOf('</section>'))
    expect(multi).not.toContain('ソロの人')
    // 2〜4人をまとめて得点順に順位を付ける。人数は出さない
    expect(multi.indexOf('四人0')).toBeLessThan(multi.indexOf('三人0'))
    expect(multi.indexOf('三人0')).toBeLessThan(multi.indexOf('二人0'))
    expect(multi).toContain('class="entry-rank rank-1 num">1位</span>')
    expect(multi).toContain('class="entry-rank num">3位</span>')
    expect(multi).not.toMatch(/[234]人</)
    const soloPanel = card.slice(card.indexOf('>ソロ<'), card.indexOf('>マルチ<'))
    expect(soloPanel).toContain('ソロの人')
  })

  it('caches past days for 6 hours but not today', async () => {
    const solo1 = solo(0, '最初の人')
    const songOf = async (date: string) => {
      const [s1] = await dailySongs(env.DB, date)
      return (await env.DB.prepare('SELECT id FROM song WHERE game_song_id = ?').bind(s1!.gameSongId).first<{ id: number }>())!.id
    }
    // 昨日（10/13）の記録は、昨日の画面を一度開いた後に入っても6時間は出ない
    const past = await songOf('2026-10-13')
    expect(await html('/daily?date=2026-10-13')).not.toContain('最初の人')
    await insertPlay({ playId: 'late', songRefId: past, score: 1, participants: solo1, receivedAt: '2026-10-13T10:00:00.000Z' })
    expect(await html('/daily?date=2026-10-13')).not.toContain('最初の人')
    vi.setSystemTime(new Date(Date.parse(NOW_UTC) + DAILY_PAST_CACHE_TTL_MS + 1))
    expect(await html('/daily?date=2026-10-13')).toContain('最初の人')

    // 今日の記録はすぐ出る
    vi.setSystemTime(new Date(NOW_UTC))
    const today = await songOf('2026-10-14')
    expect(await html('/daily')).not.toContain('今日の人')
    await insertPlay({ playId: 'now', songRefId: today, score: 1, participants: solo(1, '今日の人'), receivedAt: '2026-10-14T01:00:00.000Z' })
    expect(await html('/daily')).toContain('今日の人')
  })

  it('rejects dates outside the 7 days', async () => {
    for (const date of ['2026-10-07', '2026-10-15', '2026-10-1', 'yesterday']) {
      expect(await html(`/daily?date=${date}`, 400), date).toContain('dateは2026-10-08〜2026-10-14の日付（YYYY-MM-DD）にしてください')
    }
  })
})

describe('song ranking page', () => {
  it('shows all four player counts on one page with the selected tab', async () => {
    await insertPlay({
      playId: 'p1',
      songRefId: song,
      score: 500,
      participants: [
        { id: IDS[0]!, name: 'ふたりめ', color: 'B' },
        { id: IDS[1]!, name: 'ひとりめ', color: 'R' },
      ],
      isFullCombo: true,
    })
    const text = await html('/songs/001?players=2')
    for (const count of [1, 2, 3, 4]) expect(text).toContain(`class="box panel panel-${count}"`)
    expect(text).toMatch(/id="tab-2"[^>]*checked/)
    expect(text).not.toMatch(/id="tab-1"[^>]*checked/)
    expect(text.indexOf('ひとりめ')).toBeLessThan(text.indexOf('ふたりめ'))
    expect(text).toContain('aria-label="フルコンボ"')
    expect(text).not.toContain('受付')
    expect(text).toContain('記録はまだありません')
  })

  it('ignores retired full-combo filters on page URLs and keeps all records visible', async () => {
    await insertPlay({
      playId: 'non-fc',
      songRefId: song,
      score: 500,
      participants: [{ id: IDS[0]!, name: '通常の記録', color: 'R' }],
      isFullCombo: false,
    })
    for (const path of ['/songs/001?fc=1', '/songs/001/players/1?fc=1']) {
      const text = await html(path)
      expect(text).toContain('通常の記録')
      expect(text).not.toContain('フルコンボのみ')
      expect(text).not.toContain('name="fc"')
      expect(text).not.toMatch(/href="[^"]*[?&]fc=/)
    }
  })

  it('escapes player names', async () => {
    await insertPlay({
      playId: 'p1',
      songRefId: song,
      score: 1,
      participants: [{ id: IDS[0]!, name: '<script>alert("x")</script>', color: 'R' }],
    })
    const text = await html('/songs/001')
    expect(text).not.toContain('<script>alert')
    expect(text).toContain('&lt;script&gt;')
  })

  it('shows legacy records without the received time or a legacy label', async () => {
    await insertPlay({
      playId: 'legacy-1',
      songRefId: song,
      score: 1,
      participants: [{ id: IDS[0]!, name: '旧記録', color: 'R' }],
      isFullCombo: null,
      hostPlayerId: null,
    })
    const text = await html('/songs/001')
    expect(text).toContain('旧記録')
    expect(text).not.toContain('移行記録')
  })

  it('shows the top 10 per player count and links to the full ranking', async () => {
    for (let i = 0; i < 12; i++) {
      await insertPlay({
        playId: `p${i}`,
        songRefId: song,
        score: 1000 - i,
        participants: [{ id: IDS[i]!, name: `Player${String(i).padStart(2, '0')}`, color: 'R' }],
        receivedAt: at(i),
      })
    }
    const text = await html('/songs/001?fc=0&name=player')
    expect(text).toContain('Player09')
    expect(text).not.toContain('Player10')
    expect(text).toContain('href="/songs/001/players/1?name=player"')
    expect(text).toContain('すべて見る（12件）')

    const full = await html('/songs/001/players/1')
    expect(full).toContain('Player11')
    // 1ページに収まる場合はページ送りを出さない
    expect(full).not.toContain('ページ送り')
  })

  it('pages the per-player-count ranking by 50', async () => {
    const batch = []
    for (let i = 0; i < 51; i++) {
      batch.push(
        env.DB.prepare('INSERT INTO player (player_id, created_at) VALUES (?, ?)').bind(`legacy-p${i}`, at(0)),
        env.DB.prepare(
          `INSERT INTO play (play_id, song_ref_id, score, received_at, player_count, team_key) VALUES (?, ?, ?, ?, 1, ?)`,
        ).bind(`legacy-${i}`, song, 1000 - i, at(0), JSON.stringify([`legacy-p${i}`])),
        env.DB.prepare(
          `INSERT INTO play_participant (play_id, player_id, name_at_play, color_at_play) VALUES (?, ?, ?, 'R')`,
        ).bind(`legacy-${i}`, `legacy-p${i}`, `Legacy${i}`),
      )
    }
    await env.DB.batch(batch)
    const second = await html('/songs/001/players/1?page=2')
    expect(second).toContain('Legacy50')
    expect(second).not.toContain('Legacy49<')
    expect(second).toContain('2 / 2 ページ（51件）')
    expect(second).toContain('href="/songs/001/players/1"')
  })
})

describe('page errors', () => {
  it('returns HTML for unknown songs and paths, JSON for unknown API paths', async () => {
    expect(await html('/songs/999', 404)).toContain('曲が見つかりません')
    expect(await html('/songs/001/players/5', 400)).toContain('表示できません')
    await html('/no-such-page', 404)
    const res = await get('/api/v1/no-such-api')
    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toContain('application/json')
  })

  it('returns HTML for invalid queries', async () => {
    expect(await html('/songs?sort=title', 400)).toContain('sortはidまたはlevelにしてください')
    expect(await html('/songs?dir=up', 400)).toContain('dirはascまたはdescにしてください')
    expect(await html('/songs?levelMin=0', 400)).toContain('levelMinは1〜10の整数にしてください')
    expect(await html('/songs?levelMax=11', 400)).toContain('levelMaxは1〜10の整数にしてください')
    expect(await html('/songs?levelMin=5.5', 400)).toContain('levelMinは1〜10の整数にしてください')
  })
})

describe('search engines', () => {
  it('marks pages, API responses and errors as noindex', async () => {
    for (const path of [TOP, `${TOP}songs`, '/', '/songs/001', '/songs/999', '/no-such-page', '/api/v1/songs', '/api/v1/no-such-api']) {
      expect((await get(path)).headers.get('X-Robots-Tag'), path).toBe('noindex, nofollow, noarchive')
    }
    expect(await html('/songs')).toContain('<meta name="robots" content="noindex, nofollow, noarchive"/>')
  })
})

describe('favicon', () => {
  it('links the favicon from every page', async () => {
    for (const path of [TOP, '/songs', '/songs/001']) {
      expect(await html(path), path).toContain('<link rel="icon" href="/favicon.ico"/>')
    }
  })
})

describe('view rate limit', () => {
  it('limits pages and view APIs by CF-Connecting-IP', async () => {
    const keys: string[] = []
    const limiter: RateLimit = {
      limit: async ({ key }) => {
        keys.push(key)
        return { success: false }
      },
    }
    const testEnv = { ...env, VIEW_IP_LIMITER: limiter }
    const headers = { 'CF-Connecting-IP': '198.51.100.1' }

    const page = await app.request('/', { headers }, testEnv)
    expect(page.status).toBe(429)
    expect(page.headers.get('Content-Type')).toContain('text/html')
    expect(page.headers.get('Retry-After')).toBe('60')
    expect(page.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive')
    const api = await app.request('/api/v1/songs', { headers }, testEnv)
    expect(api.status).toBe(429)
    expect(api.headers.get('Retry-After')).toBe('60')
    expect(keys).toEqual(['198.51.100.1', '198.51.100.1'])
  })
})
