import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../src/index'
import { resetDb } from './helpers'
import { at, insertPlay, insertPlayers, insertSong } from './view-helpers'

// 架空のID・名前のみ使用
const A = '428d19c3-786c-4650-81c1-06848583d7fa'
const B = 'f3e1a5de-d740-43d2-bce1-cd513c9b6790'
const C = '0b5c7a4e-1f2d-4e8a-9c3b-6d7e8f9a0b1c'

type SongsResponse = {
  songs: { gameSongId: string; title: string; artist: string | null; level: string | null; bestScores: unknown }[]
  page: number
  limit: number
  total: number
}

const get = (path: string) => app.request(path, {}, env)

const listSongs = async (query = '') => {
  const res = await get(`/api/v1/songs${query}`)
  expect(res.status).toBe(200)
  return (await res.json()) as SongsResponse
}

const solo = (id: string, name: string) => [{ id, name, color: 'R' as const }]

beforeEach(async () => {
  await resetDb()
  await insertPlayers(A, B, C)
})

describe('GET /api/v1/songs', () => {
  beforeEach(async () => {
    await insertSong('1000', 'Zeta Song', { artist: 'Artist X', level: '3', levelSortValue: 9 })
    await insertSong('002', 'beta song', { level: '?' })
    await insertSong('010', '架空の曲', { artist: 'artist y', level: '5+', levelSortValue: 16 })
    await insertSong('999', 'Alpha', { level: '3', levelSortValue: 9 })
  })

  it('lists songs in numeric song id order without internal ids', async () => {
    const json = await listSongs()
    expect(json.songs.map((s) => s.gameSongId)).toEqual(['002', '010', '999', '1000'])
    expect(json).toMatchObject({ page: 1, limit: 50, total: 4 })
    expect(Object.keys(json.songs[0]!).sort()).toEqual(['artist', 'bestScores', 'gameSongId', 'level', 'title'])
  })

  it('searches title and artist case-insensitively and filters by level', async () => {
    expect((await listSongs('?q=SONG')).songs.map((s) => s.gameSongId)).toEqual(['002', '1000'])
    expect((await listSongs('?q=ARTIST%20Y')).songs.map((s) => s.gameSongId)).toEqual(['010'])
    expect((await listSongs('?level=3')).songs.map((s) => s.gameSongId)).toEqual(['999', '1000'])
    expect((await listSongs('?level=%3F')).songs.map((s) => s.gameSongId)).toEqual(['002'])
  })

  it('sorts by level with unknown levels last', async () => {
    expect((await listSongs('?sort=level')).songs.map((s) => s.gameSongId)).toEqual(['999', '1000', '010', '002'])
  })

  it('pages through the list', async () => {
    const json = await listSongs('?limit=3&page=2')
    expect(json.songs.map((s) => s.gameSongId)).toEqual(['1000'])
    expect(json).toMatchObject({ page: 2, limit: 3, total: 4 })
  })

  it('rejects invalid queries', async () => {
    for (const query of ['?sort=title', '?level=abc', '?limit=0', '?page=-1', `?q=${'x'.repeat(101)}`]) {
      expect((await get(`/api/v1/songs${query}`)).status, query).toBe(400)
    }
  })
})

describe('best scores in the song list', () => {
  it('returns the top score per player count, with the solo name', async () => {
    const song = await insertSong('001', '架空の曲名')
    await insertPlay({ playId: 's1', songRefId: song, score: 300, participants: solo(A, 'Alice') })
    await insertPlay({ playId: 's2', songRefId: song, score: 500, participants: solo(B, 'Bob'), excluded: true })
    await insertPlay({
      playId: 'd1',
      songRefId: song,
      score: 800,
      participants: [
        { id: A, name: 'Alice', color: 'R' },
        { id: C, name: 'Carol', color: 'B' },
      ],
    })
    const [entry] = (await listSongs()).songs
    expect(entry!.bestScores).toEqual({ '1': { score: 300, name: 'Alice', tiedOthers: 0 }, '2': { score: 800 }, '3': null, '4': null })
  })

  it('shows the first tied solo player in ranking order and counts the others once each', async () => {
    const song = await insertSong('001', '架空の曲名')
    await insertPlay({ playId: 's1', songRefId: song, score: 300, participants: solo(B, 'Bob'), receivedAt: at(20) })
    await insertPlay({ playId: 's2', songRefId: song, score: 300, participants: solo(A, 'Alice'), receivedAt: at(10) })
    // Aliceの同点の2回目（FC）がAliceの代表になり、受付日時が遅くなるのでBobが先頭
    await insertPlay({
      playId: 's3',
      songRefId: song,
      score: 300,
      participants: solo(A, 'Alice2'),
      isFullCombo: true,
      receivedAt: at(30),
    })
    await insertPlay({ playId: 's4', songRefId: song, score: 300, participants: solo(C, 'Carol'), receivedAt: at(40) })

    const [entry] = (await listSongs()).songs
    expect(entry!.bestScores).toMatchObject({ '1': { score: 300, name: 'Bob', tiedOthers: 2 } })

    const ranking = (await (await get('/api/v1/songs/001/rankings?players=1')).json()) as {
      entries: { participants: { name: string }[] }[]
    }
    expect(ranking.entries[0]!.participants[0]!.name).toBe('Bob')
  })
})
