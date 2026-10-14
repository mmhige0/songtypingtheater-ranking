import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../src/index'
import { fetchBestScores } from '../src/lib/ranking'
import { hashInstallationToken } from '../src/lib/token'
import { resetDb } from './helpers'

// 架空のID・token・名前のみ使用
const HOST = '428d19c3-786c-4650-81c1-06848583d7fa'
const GUEST = 'f3e1a5de-d740-43d2-bce1-cd513c9b6790'
const THIRD = '0b5c7a4e-1f2d-4e8a-9c3b-6d7e8f9a0b1c'
const FOURTH = '1c6d8b5f-2e3a-4f9b-8d4c-7e8f9a0b1c2d'
const UNREGISTERED = '2d7e9c6a-3f4b-4a0c-9e5d-8f9a0b1c2d3e'
const HOST_TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const GUEST_TOKEN = 'HxweHRwbGhkYFxYVFBMSERAPDg0MCwoJCAcGBQQDAgE'
const PLAY = 'a978c461-3a06-487d-80c8-552eb969031a'
const NOW = '2026-10-10T13:00:02.120Z'

const player = (playerId: string, name: string, color: string) => ({ playerId, name, color })

const validBody = () => ({
  playId: PLAY,
  songId: '001',
  score: 123456,
  isFullCombo: true,
  hostPlayerId: HOST,
  players: [player(HOST, 'プレイヤーA', 'R'), player(GUEST, 'プレイヤーB', 'B')],
  gameVersion: '1.65',
  isTaipen: false,
})

const send = (body: unknown, { token = HOST_TOKEN as string | null, headers = {} as Record<string, string> } = {}) =>
  app.request(
    '/api/v1/plays',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    env,
  )

const count = (table: string) => env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<number>('n')

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  const text = await res.text()
  expect(text).not.toContain(HOST_TOKEN)
  const json = JSON.parse(text) as { error: { code: string; retryable: boolean } }
  expect(json.error.code).toBe(code)
  expect(json.error.retryable).toBe(false)
}

const registerPlayer = async (playerId: string, token: string | null) =>
  env.DB.prepare('INSERT INTO player (player_id, token_hash, created_at) VALUES (?, ?, ?)')
    .bind(playerId, token === null ? null : await hashInstallationToken(token), NOW)
    .run()

beforeEach(async () => {
  await resetDb()
  await env.DB.prepare(
    `INSERT INTO song (game_song_id, title, status, created_at, updated_at) VALUES ('001', '架空の曲名', 'approved', ?, ?)`,
  )
    .bind(NOW, NOW)
    .run()
  await registerPlayer(HOST, HOST_TOKEN)
  await registerPlayer(GUEST, GUEST_TOKEN)
  await registerPlayer(THIRD, 'AQECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8')
  await registerPlayer(FOURTH, 'AgECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8')
})

describe('POST /api/v1/plays', () => {
  it('stores a two-player clear with its participants', async () => {
    const res = await send(validBody())
    expect(res.status).toBe(201)
    const json = (await res.json()) as { playId: string; status: string; receivedAt: string }
    expect(json).toEqual({ playId: PLAY, status: 'created', receivedAt: expect.any(String) })
    expect(json.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

    const play = await env.DB.prepare('SELECT * FROM play').first<Record<string, unknown>>()
    expect(play).toMatchObject({
      play_id: PLAY,
      score: 123456,
      is_full_combo: 1,
      is_taipen: 0,
      received_at: json.receivedAt,
      game_version: '1.65',
      host_player_id: HOST,
      player_count: 2,
      team_key: JSON.stringify([GUEST, HOST].sort()),
      excluded_at: null,
    })
    const participants = await env.DB.prepare(
      'SELECT player_id, name_at_play, color_at_play FROM play_participant ORDER BY color_at_play',
    ).all()
    expect(participants.results).toEqual([
      { player_id: GUEST, name_at_play: 'プレイヤーB', color_at_play: 'B' },
      { player_id: HOST, name_at_play: 'プレイヤーA', color_at_play: 'R' },
    ])
  })

  it('normalizes uppercase UUIDs and produces the same teamKey regardless of order', async () => {
    const body = validBody()
    body.playId = PLAY.toUpperCase()
    body.hostPlayerId = HOST.toUpperCase()
    body.players = [player(GUEST.toUpperCase(), 'プレイヤーB', 'B'), player(HOST.toUpperCase(), 'プレイヤーA', 'R')]
    expect((await send(body)).status).toBe(201)

    const play = await env.DB.prepare('SELECT play_id, host_player_id, team_key FROM play').first()
    expect(play).toEqual({ play_id: PLAY, host_player_id: HOST, team_key: JSON.stringify([GUEST, HOST].sort()) })
  })

  it('accepts any color combination for three players', async () => {
    const body = {
      ...validBody(),
      players: [player(HOST, 'A', 'R'), player(GUEST, 'B', 'Y'), player(THIRD, 'C', 'G')],
    }
    expect((await send(body)).status).toBe(201)
  })

  describe('resend', () => {
    it('returns 200 with the original receivedAt and stores nothing new', async () => {
      const first = (await (await send(validBody())).json()) as { receivedAt: string }
      const res = await send(validBody())
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ playId: PLAY, status: 'already_registered', receivedAt: first.receivedAt })
      expect(await count('play')).toBe(1)
      expect(await count('play_participant')).toBe(2)
    })

    it('returns 200 for a different body with the same playId without changing the stored play', async () => {
      await send(validBody())
      const res = await send({ ...validBody(), score: 1, isFullCombo: false })
      expect(res.status).toBe(200)
      const play = await env.DB.prepare('SELECT score, is_full_combo FROM play').first()
      expect(play).toEqual({ score: 123456, is_full_combo: 1 })
    })

    it('stores one play when the same play arrives concurrently', async () => {
      const responses = await Promise.all([send(validBody()), send(validBody())])
      expect(responses.map((r) => r.status).sort()).toEqual([200, 201])
      expect(await count('play')).toBe(1)
      expect(await count('play_participant')).toBe(2)
    })

    it('does not revive an excluded play', async () => {
      await send(validBody())
      await env.DB.prepare(`UPDATE play SET excluded_at = ?`).bind(NOW).run()
      expect((await send(validBody())).status).toBe(200)
      expect(await env.DB.prepare('SELECT excluded_at FROM play').first('excluded_at')).toBe(NOW)
    })
  })

  describe('registration conditions (422)', () => {
    it('rejects an unknown song', async () => {
      await expectError(await send({ ...validBody(), songId: '999' }), 422, 'UNKNOWN_SONG')
    })

    it('rejects a song that is not approved', async () => {
      await env.DB.prepare(`UPDATE song SET status = 'withdrawn'`).run()
      await expectError(await send(validBody()), 422, 'UNKNOWN_SONG')
    })

    it.each([
      ['a participant without a Player row', false],
      // 移行用Playerと同じくtokenHashのない行（移行用IDはUUIDv4ではないためAPIでは送れない）
      ['a participant whose Player row has no token', true],
    ])('rejects %s and stores nothing', async (_, hasRowWithoutToken) => {
      if (hasRowWithoutToken) await registerPlayer(UNREGISTERED, null)
      const body = { ...validBody(), players: [player(HOST, 'A', 'R'), player(UNREGISTERED, 'B', 'B')] }
      await expectError(await send(body), 422, 'UNKNOWN_PLAYER')
      expect(await count('play')).toBe(0)
      expect(await count('play_participant')).toBe(0)
    })

    it('accepts TAIPEN with four players and rejects it with three', async () => {
      const three = [player(HOST, 'A', 'R'), player(GUEST, 'B', 'B'), player(THIRD, 'C', 'Y')]
      await expectError(await send({ ...validBody(), isTaipen: true, players: three }), 422, 'INVALID_TAIPEN_PLAYER_COUNT')

      const four = [...three, player(FOURTH, 'D', 'G')]
      expect((await send({ ...validBody(), isTaipen: true, players: four })).status).toBe(201)
    })

    it.each([-1, 2_147_483_648])('rejects score %d as out of range', async (score) => {
      await expectError(await send({ ...validBody(), score }), 422, 'SCORE_OUT_OF_RANGE')
    })
  })

  describe('request validation (400)', () => {
    it.each([
      ['duplicate participant', { players: [player(HOST, 'A', 'R'), player(HOST, 'B', 'B')] }, 'DUPLICATE_PLAYER_ID'],
      ['duplicate participant in different case', { players: [player(HOST, 'A', 'R'), player(HOST.toUpperCase(), 'B', 'B')] }, 'DUPLICATE_PLAYER_ID'],
      ['duplicate color', { players: [player(HOST, 'A', 'R'), player(GUEST, 'B', 'R')] }, 'DUPLICATE_COLOR'],
      ['lowercase color', { players: [player(HOST, 'A', 'r')] }, 'INVALID_REQUEST'],
      ['HTML color', { players: [player(HOST, 'A', '#ff0000')] }, 'INVALID_REQUEST'],
      ['fractional score', { score: 1.5 }, 'INVALID_REQUEST'],
      ['string score', { score: '100' }, 'INVALID_REQUEST'],
      ['no players', { players: [] }, 'INVALID_REQUEST'],
      ['five players', { players: ['R', 'B', 'Y', 'G', 'R'].map((c, i) => player(HOST, `P${i}`, c)) }, 'INVALID_REQUEST'],
      ['name over 40 characters', { players: [player(HOST, 'あ'.repeat(41), 'R')] }, 'INVALID_REQUEST'],
      ['name with newline', { players: [player(HOST, 'A\nB', 'R')] }, 'INVALID_REQUEST'],
      ['non-ASCII gameVersion', { gameVersion: '１.65' }, 'INVALID_REQUEST'],
      ['empty gameVersion', { gameVersion: '' }, 'INVALID_REQUEST'],
      ['songId 000', { songId: '000' }, 'INVALID_REQUEST'],
      ['numeric songId', { songId: 1 }, 'INVALID_REQUEST'],
      ['string isFullCombo', { isFullCombo: 'true' }, 'INVALID_REQUEST'],
      ['finishedAt field', { finishedAt: NOW }, 'INVALID_REQUEST'],
      ['unknown player field', { players: [{ ...player(HOST, 'A', 'R'), playerNum: 1 }] }, 'INVALID_REQUEST'],
    ])('rejects %s', async (_, override, code) => {
      await expectError(await send({ ...validBody(), ...override }), 400, code)
      expect(await count('play')).toBe(0)
    })

    it('rejects a missing gameVersion', async () => {
      const body: Partial<ReturnType<typeof validBody>> = validBody()
      delete body.gameVersion
      await expectError(await send(body), 400, 'INVALID_REQUEST')
    })

    it('rejects a duplicate JSON key', async () => {
      const text = JSON.stringify(validBody()).replace('"score":123456', '"score":1,"score":123456')
      await expectError(await send(text), 400, 'INVALID_REQUEST')
    })

    it('accepts names that look like HTML or contain quotes as plain text', async () => {
      const name = '<script>"x"</script>'
      const body = { ...validBody(), players: [player(HOST, name, 'R')] }
      expect((await send(body)).status).toBe(201)
      expect(await env.DB.prepare('SELECT name_at_play FROM play_participant').first('name_at_play')).toBe(name)
    })
  })

  describe('host and authentication', () => {
    it('rejects a host that is not among the players with 403', async () => {
      const body = { ...validBody(), players: [player(GUEST, 'B', 'B')] }
      await expectError(await send(body), 403, 'HOST_ID_MISMATCH')
    })

    it('rejects a token that does not belong to the host with 403', async () => {
      await expectError(await send(validBody(), { token: GUEST_TOKEN }), 403, 'HOST_ID_MISMATCH')
    })

    it.each([
      ['missing token', null],
      ['malformed token', 'not-a-token'],
      ['unregistered token', 'BwECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'],
    ])('rejects %s with 401', async (_, token) => {
      await expectError(await send(validBody(), { token }), 401, 'INVALID_TOKEN')
    })

    it('rejects a revoked host token with 401', async () => {
      await env.DB.prepare('UPDATE player SET revoked_at = ? WHERE player_id = ?').bind(NOW, HOST).run()
      await expectError(await send(validBody()), 401, 'REVOKED_TOKEN')
    })

    it('accepts a play with a revoked guest because only registration is checked', async () => {
      await env.DB.prepare('UPDATE player SET revoked_at = ? WHERE player_id = ?').bind(NOW, GUEST).run()
      expect((await send(validBody())).status).toBe(201)
    })

    it('authenticates before reading the body', async () => {
      await expectError(await send('x'.repeat(20_000), { token: null }), 401, 'INVALID_TOKEN')
    })
  })

  describe('song best (song_best)', () => {
    const songRef = () => env.DB.prepare("SELECT id FROM song WHERE game_song_id = '001'").first<number>('id')
    const best2 = async () => (await fetchBestScores(env.DB, [(await songRef())!])).get((await songRef())!)!['2']
    const other = (playId: string, score: number, isFullCombo: boolean, members = [HOST, THIRD]) => ({
      ...validBody(),
      playId,
      score,
      isFullCombo,
      players: [player(members[0]!, 'プレイヤーA', 'R'), player(members[1]!, 'プレイヤーC', 'B')],
    })

    it('updates the top of the song and player count with each stored play', async () => {
      expect(await best2()).toBeNull()
      expect((await send(validBody())).status).toBe(201)
      expect(await best2()).toEqual({
        score: 123456,
        isFullCombo: true,
        hasFullCombo: true,
        participants: [
          { name: 'プレイヤーA', color: 'R' },
          { name: 'プレイヤーB', color: 'B' },
        ],
        tiedOthers: 0,
      })

      // 1位に届かない記録では1位は変わらない
      expect((await send(other('b0e4a7c2-5d3f-4a1b-8c9d-0e1f2a3b4c5d', 100, false))).status).toBe(201)
      expect(await best2()).toMatchObject({ score: 123456, tiedOthers: 0 })

      // 別のチームの同点は同点の組数に数え、受付が早い方を代表にする
      expect((await send(other('c1f5b8d3-6e4a-4b2c-9d0e-1f2a3b4c5d6e', 123456, false))).status).toBe(201)
      expect(await best2()).toMatchObject({ score: 123456, tiedOthers: 1, participants: [{ name: 'プレイヤーA' }, { name: 'プレイヤーB' }] })

      // 上回ればその記録が1位になる
      expect((await send(other('d2a6c9e4-7f5b-4c3d-8e1f-2a3b4c5d6e7f', 200000, false))).status).toBe(201)
      expect(await best2()).toMatchObject({
        score: 200000,
        isFullCombo: false,
        hasFullCombo: true,
        tiedOthers: 0,
        participants: [{ name: 'プレイヤーA' }, { name: 'プレイヤーC' }],
      })
    })

    it('does not touch the top on a resend', async () => {
      await send(validBody())
      const before = await env.DB.prepare('SELECT updated_at FROM song_best').first('updated_at')
      expect((await send(validBody())).status).toBe(200)
      expect(await env.DB.prepare('SELECT updated_at FROM song_best').first('updated_at')).toBe(before)
    })
  })
})
