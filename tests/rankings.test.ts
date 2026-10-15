import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../src/index'
import { resetDb } from './helpers'
import { at, insertPlay, insertPlayers, insertSong } from './view-helpers'

// 架空のID・名前のみ使用
const A = '428d19c3-786c-4650-81c1-06848583d7fa'
const B = 'f3e1a5de-d740-43d2-bce1-cd513c9b6790'
const C = '0b5c7a4e-1f2d-4e8a-9c3b-6d7e8f9a0b1c'
const D = '1c6d8b5f-2e3a-4f9b-8d4c-7e8f9a0b1c2d'

type Entry = {
  rank: number
  score: number
  isFullCombo: boolean | null
  fullComboScore: number | null
  receivedAt: string
  isLegacy: boolean
  participants: { name: string; color: string }[]
}
type RankingResponse = { song: Record<string, unknown>; players: number; entries: Entry[]; page: number; limit: number; total: number }

const get = (path: string) => app.request(path, {}, env)

const rankings = async (query: string, songId = '001') => {
  const res = await get(`/api/v1/songs/${songId}/rankings?${query}`)
  expect(res.status).toBe(200)
  return (await res.json()) as RankingResponse
}

const pair = (x: string, xName: string, y: string, yName: string) => [
  { id: x, name: xName, color: 'R' as const },
  { id: y, name: yName, color: 'B' as const },
]

let song: number

beforeEach(async () => {
  await resetDb()
  song = await insertSong('001', '架空の曲名', { artist: '架空のアーティスト', level: '5+', levelSortValue: 16 })
  await insertPlayers(A, B, C, D)
})

describe('GET /api/v1/songs/{gameSongId}/rankings', () => {
  it('shows one best record per member combination regardless of order', async () => {
    await insertPlay({ playId: 'p1', songRefId: song, score: 100, participants: pair(A, 'A', B, 'B') })
    await insertPlay({ playId: 'p2', songRefId: song, score: 90, participants: pair(A, 'A', B, 'B') })
    await insertPlay({ playId: 'p3', songRefId: song, score: 110, participants: pair(B, 'B', A, 'A') })
    await insertPlay({ playId: 'p4', songRefId: song, score: 95, participants: pair(A, 'A', C, 'C') })

    const json = await rankings('players=2')
    expect(json.song).toEqual({ gameSongId: '001', title: '架空の曲名', artist: '架空のアーティスト', level: '5+' })
    expect(json.entries.map((e) => [e.rank, e.score])).toEqual([
      [1, 110],
      [2, 95],
    ])
    expect(json.total).toBe(2)
  })

  it('prefers a full combo among the same team at the same score, even if received later', async () => {
    await insertPlay({ playId: 'p1', songRefId: song, score: 100, participants: pair(A, 'A', B, 'B'), receivedAt: at(0) })
    await insertPlay({
      playId: 'p2',
      songRefId: song,
      score: 100,
      participants: pair(A, 'A', B, 'B'),
      isFullCombo: true,
      receivedAt: at(10),
    })
    const json = await rankings('players=2')
    expect(json.entries).toHaveLength(1)
    expect(json.entries[0]).toMatchObject({ isFullCombo: true, receivedAt: at(10) })
  })

  it("adds the team's best full combo score when the representative is not a full combo", async () => {
    // A+B: 代表は100（FCでない）。FCは90・95と除外された99
    await insertPlay({ playId: 'ab-1', songRefId: song, score: 100, participants: pair(A, 'A', B, 'B'), isFullCombo: false })
    await insertPlay({ playId: 'ab-2', songRefId: song, score: 90, participants: pair(A, 'A', B, 'B'), isFullCombo: true })
    await insertPlay({ playId: 'ab-3', songRefId: song, score: 95, participants: pair(B, 'B', A, 'A'), isFullCombo: true })
    await insertPlay({ playId: 'ab-4', songRefId: song, score: 99, participants: pair(A, 'A', B, 'B'), isFullCombo: true, excluded: true })
    // A+C: FC記録なし（FC不明の移行分はFCとみなさない）
    await insertPlay({ playId: 'ac-1', songRefId: song, score: 80, participants: pair(A, 'A', C, 'C'), isFullCombo: false })
    await insertPlay({ playId: 'ac-2', songRefId: song, score: 75, participants: pair(A, 'A', C, 'C'), isFullCombo: null, hostPlayerId: null })
    // A+D: 代表記録がFC
    await insertPlay({ playId: 'ad-1', songRefId: song, score: 70, participants: pair(A, 'A', D, 'D'), isFullCombo: true })
    await insertPlay({ playId: 'ad-2', songRefId: song, score: 60, participants: pair(A, 'A', D, 'D'), isFullCombo: true })

    expect((await rankings('players=2')).entries.map((e) => [e.rank, e.score, e.isFullCombo, e.fullComboScore])).toEqual([
      [1, 100, false, 95],
      [2, 80, false, null],
      [3, 70, true, null],
    ])
    // FC絞り込みでは代表記録がFCなので添えない
    expect((await rankings('players=2&fc=1')).entries.map((e) => [e.rank, e.score, e.fullComboScore])).toEqual([
      [1, 95, null],
      [2, 70, null],
    ])
  })

  it('gives tied teams the same rank (1, 1, 3) ordered by received time', async () => {
    await insertPlay({ playId: 'p1', songRefId: song, score: 100, participants: pair(A, 'A', B, 'B'), receivedAt: at(5) })
    await insertPlay({
      playId: 'p2',
      songRefId: song,
      score: 100,
      participants: pair(C, 'C', D, 'D'),
      isFullCombo: true,
      receivedAt: at(9),
    })
    await insertPlay({ playId: 'p3', songRefId: song, score: 90, participants: pair(A, 'A', C, 'C'), receivedAt: at(0) })
    const json = await rankings('players=2')
    expect(json.entries.map((e) => [e.rank, e.participants[0]!.name])).toEqual([
      [1, 'A'],
      [1, 'C'],
      [3, 'A'],
    ])
  })

  it('lists participants in R, B, Y, G order', async () => {
    await insertPlay({
      playId: 'p1',
      songRefId: song,
      score: 100,
      participants: [
        { id: A, name: 'G役', color: 'G' },
        { id: B, name: 'R役', color: 'R' },
        { id: C, name: 'Y役', color: 'Y' },
      ],
    })
    const json = await rankings('players=3')
    expect(json.entries[0]!.participants).toEqual([
      { name: 'R役', color: 'R' },
      { name: 'Y役', color: 'Y' },
      { name: 'G役', color: 'G' },
    ])
  })

  it('searches only the names on the representative record and keeps the original rank', async () => {
    await insertPlay({ playId: 'p1', songRefId: song, score: 200, participants: pair(A, 'Alice', B, 'Bob') })
    // 同じチームの次点にだけある旧名
    await insertPlay({ playId: 'p2', songRefId: song, score: 150, participants: pair(A, 'OldName', B, 'Bob') })
    await insertPlay({ playId: 'p3', songRefId: song, score: 100, participants: pair(C, 'Carol', D, 'Dave') })

    expect((await rankings('players=2&name=OldName')).entries).toEqual([])
    const json = await rankings(`players=2&name=${encodeURIComponent('carol')}`)
    expect(json.entries.map((e) => [e.rank, e.score])).toEqual([[2, 100]])
    expect(json.total).toBe(1)
  })

  it('applies the full combo filter before choosing the representative and searching', async () => {
    await insertPlay({ playId: 'p1', songRefId: song, score: 200, participants: pair(A, 'Alice', B, 'Bob') })
    await insertPlay({
      playId: 'p2',
      songRefId: song,
      score: 150,
      participants: pair(A, 'Alias', B, 'Bob'),
      isFullCombo: true,
    })
    await insertPlay({ playId: 'p3', songRefId: song, score: 180, participants: pair(C, 'C', D, 'D'), isFullCombo: true })

    const fc = await rankings('players=2&fc=1')
    expect(fc.entries.map((e) => [e.rank, e.score])).toEqual([
      [1, 180],
      [2, 150],
    ])
    expect((await rankings('players=2&fc=1&name=Alias')).entries.map((e) => e.score)).toEqual([150])
    expect((await rankings('players=2&fc=1&name=Alice')).entries).toEqual([])
  })

  it('treats unknown full combo like not achieved and marks legacy records', async () => {
    await insertPlay({
      playId: 'legacy-1',
      songRefId: song,
      score: 100,
      participants: [{ id: A, name: 'A', color: 'R' }],
      isFullCombo: null,
      hostPlayerId: null,
    })
    const json = await rankings('players=1')
    expect(json.entries[0]).toMatchObject({ isFullCombo: null, isLegacy: true })
  })

  it('ignores excluded records and falls back to the next best of the team', async () => {
    await insertPlay({ playId: 'p1', songRefId: song, score: 200, participants: pair(A, 'A', B, 'B'), excluded: true })
    await insertPlay({ playId: 'p2', songRefId: song, score: 150, participants: pair(A, 'A', B, 'B') })
    expect((await rankings('players=2')).entries.map((e) => e.score)).toEqual([150])
  })

  it('pages through the ranking', async () => {
    for (let i = 0; i < 5; i++) {
      await insertPlay({
        playId: `p${i}`,
        songRefId: song,
        score: 100 - i,
        participants: [{ id: [A, B, C, D, A][i]!, name: `N${i}`, color: 'R' }],
        receivedAt: at(i),
      })
    }
    // Aは2回プレイしているので4チーム
    const json = await rankings('players=1&limit=2&page=2')
    expect(json).toMatchObject({ page: 2, limit: 2, total: 4 })
    expect(json.entries.map((e) => [e.rank, e.score])).toEqual([
      [3, 98],
      [4, 97],
    ])
  })

  it('returns an empty ranking for a song without records', async () => {
    const json = await rankings('players=4')
    expect(json).toMatchObject({ players: 4, entries: [], total: 0, page: 1, limit: 50 })
  })

  it('rejects invalid queries and unknown songs', async () => {
    for (const query of ['', 'players=0', 'players=5', 'players=2&fc=yes', 'players=2&page=0', 'players=2&limit=101']) {
      const res = await get(`/api/v1/songs/001/rankings?${query}`)
      expect(res.status, query).toBe(400)
    }
    const res = await get('/api/v1/songs/999/rankings?players=1')
    expect(res.status).toBe(404)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND')
  })
})
