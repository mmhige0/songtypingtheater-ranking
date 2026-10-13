import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../src/index'
import { resetDb } from './helpers'
import { at, insertPlay, insertPlayers, insertSong } from './view-helpers'

// 架空のID・名前のみ使用
const IDS = Array.from({ length: 12 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)

const get = (path: string, testEnv: Env = env) => app.request(path, {}, testEnv)

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

describe('song list page', () => {
  it('shows songs with best scores and the solo top player', async () => {
    await insertPlay({
      playId: 'p1',
      songRefId: song,
      score: 123456,
      participants: [{ id: IDS[0]!, name: 'ソロの人', color: 'R' }],
    })
    const text = await html('/')
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
    const text = await html('/')
    const cell = text.slice(text.indexOf('href="/songs/001?players=4"'))
    expect(cell.indexOf('ひとりめ')).toBeLessThan(cell.indexOf('ふたりめ'))
    expect(cell.indexOf('さんにんめ')).toBeLessThan(cell.indexOf('よにんめ'))
    expect(cell.indexOf('aria-label="フルコンボ"')).toBeLessThan(cell.indexOf('</td>'))
  })

  it('shows a message when nothing matches', async () => {
    expect(await html('/?q=存在しない曲')).toContain('条件に一致する曲がありません')
  })

  it('renders a table whose sort headers toggle the direction', async () => {
    await insertSong('002', '架空の曲2', { level: '3', levelSortValue: 9 })
    const text = await html('/')
    expect(text).toContain('<table class="songs">')
    expect(text).toContain('全2曲')
    expect(text).not.toContain('<select')
    expect(text).toContain('href="/?dir=asc"')
    expect(text).toContain('href="/?sort=level"')
    expect(text).toContain('aria-sort="descending"')
    expect(text.indexOf('架空の曲2')).toBeLessThan(text.indexOf('架空の曲名'))

    const asc = await html('/?dir=asc&q=架空')
    expect(asc.indexOf('架空の曲名')).toBeLessThan(asc.indexOf('架空の曲2'))
    expect(asc).toContain('aria-sort="ascending"')
    expect(asc).toContain(`href="/?q=${encodeURIComponent('架空')}"`)
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
    const first = await html('/?sort=level')
    expect(first).toContain('全101曲')
    expect(first).toContain('<a class="chip active num" href="/?sort=level" aria-current="page">1</a>')
    expect(first).toContain('<a class="chip num" href="/?sort=level&amp;page=2">2</a>')
    expect(first).toContain('data-live-nav="top"')
    expect(first).toContain('data-live-nav="bottom"')
    const second = await html('/?sort=level&page=2')
    expect(second).toContain('<a class="chip active num" href="/?sort=level&amp;page=2" aria-current="page">2</a>')
    expect(second).toContain('<span class="button button-outline" aria-disabled="true">次へ</span>')
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
    expect(await html('/?sort=title', 400)).toContain('sortはidまたはlevelにしてください')
    expect(await html('/?dir=up', 400)).toContain('dirはascまたはdescにしてください')
  })
})

describe('search engines', () => {
  it('marks pages, API responses and errors as noindex', async () => {
    for (const path of ['/', '/songs/001', '/songs/999', '/no-such-page', '/api/v1/songs', '/api/v1/no-such-api']) {
      expect((await get(path)).headers.get('X-Robots-Tag'), path).toBe('noindex, nofollow, noarchive')
    }
    expect(await html('/')).toContain('<meta name="robots" content="noindex, nofollow, noarchive"/>')
  })
})

describe('favicon', () => {
  it('links the favicon from every page', async () => {
    for (const path of ['/', '/songs/001']) {
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
