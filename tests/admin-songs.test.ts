import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'
import { isDuplicateKeyError } from '../src/db/errors'
import { songs } from '../src/db/schema'
import app from '../src/index'
import { resetDb } from './helpers'

// 架空データのみ使用
const SONG = { title: '架空の曲名', artist: '架空のアーティスト', level: '5+' }

const put = (
  gameSongId: string,
  body: unknown,
  { key = 'test-admin-key', headers = {}, testEnv = env }: {
    key?: string | null
    headers?: Record<string, string>
    testEnv?: Env
  } = {},
) =>
  app.request(
    `/api/v1/admin/songs/${gameSongId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(key === null ? {} : { Authorization: `Bearer ${key}` }),
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    testEnv,
  )

const songRow = (gameSongId: string) =>
  env.DB.prepare('SELECT * FROM song WHERE game_song_id = ?').bind(gameSongId).first<Record<string, unknown>>()

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  const json = (await res.json()) as { error: { code: string; retryable: boolean }; requestId: string }
  expect(json.error.code).toBe(code)
  expect(json.error.retryable).toBe(status === 429 || status >= 500)
  expect(json.requestId).toEqual(expect.any(String))
}

beforeEach(resetDb)

describe('PUT /api/v1/admin/songs/:gameSongId', () => {
  it('creates an approved song with the computed sort value', async () => {
    const res = await put('001', SONG)
    expect(res.status).toBe(201)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ status: 'created', song: { gameSongId: '001', ...SONG } })

    const row = await songRow('001')
    expect(row).toMatchObject({ title: SONG.title, level: '5+', level_sort_value: 16, status: 'approved' })
    expect(row?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('returns unchanged for the same body and keeps the row untouched', async () => {
    await put('001', SONG)
    const before = await songRow('001')

    const res = await put('001', SONG)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { status: string }).status).toBe('unchanged')
    expect(await songRow('001')).toEqual(before)
  })

  it('updates song info without changing the internal id, status or plays', async () => {
    await put('001', SONG)
    const before = await songRow('001')
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO player (player_id, created_at) VALUES ('legacy-0001', 'x')`),
      env.DB.prepare(
        `INSERT INTO play (play_id, song_ref_id, score, received_at, player_count, team_key)
         VALUES ('p1', ?, 100, 'x', 1, '["legacy-0001"]')`,
      ).bind(before?.id),
    ])

    const res = await put('001', { title: '架空の曲名（修正）', artist: null, level: null })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { status: string }).status).toBe('updated')

    const after = await songRow('001')
    expect(after).toMatchObject({
      id: before?.id,
      status: 'approved',
      title: '架空の曲名（修正）',
      artist: null,
      level: null,
      level_sort_value: null,
      created_at: before?.created_at,
    })
    const playSong = await env.DB.prepare(`SELECT song_ref_id FROM play WHERE play_id = 'p1'`).first('song_ref_id')
    expect(playSong).toBe(before?.id)
  })

  it.each(['-', '?'])('stores the placeholder level %s without a sort value', async (level) => {
    expect((await put('001', { ...SONG, level })).status).toBe(201)
    expect(await songRow('001')).toMatchObject({ level, level_sort_value: null })
  })

  it('keeps leading zeros as distinct song ids', async () => {
    expect((await put('001', SONG)).status).toBe(201)
    expect((await put('0001', SONG)).status).toBe(201)
  })

  describe('authentication', () => {
    it.each([
      ['missing header', { key: null }],
      ['wrong key', { key: 'wrong-key' }],
      ['wrong scheme', { key: null, headers: { Authorization: 'Basic test-admin-key' } }],
      ['extra spaces', { key: null, headers: { Authorization: 'Bearer  test-admin-key' } }],
    ])('rejects %s with 401', async (_, options) => {
      const res = await put('001', SONG, options)
      await expectError(res, 401, 'INVALID_TOKEN')
      expect(await songRow('001')).toBeNull()
    })

    it('rejects every request when the server key is not set', async () => {
      const res = await put('001', SONG, { testEnv: { ...env, ADMIN_API_KEY: undefined } })
      await expectError(res, 401, 'INVALID_TOKEN')
    })

    it('does not reflect the provided key in the response', async () => {
      const res = await put('001', SONG, { key: 'leaked-secret-value' })
      expect(await res.text()).not.toContain('leaked-secret-value')
    })
  })

  describe('request validation', () => {
    it('rejects a non-JSON content type with 415', async () => {
      await expectError(await put('001', SONG, { headers: { 'Content-Type': 'text/plain' } }), 415, 'UNSUPPORTED_MEDIA_TYPE')
    })

    it('accepts a quoted charset parameter', async () => {
      const res = await put('001', SONG, { headers: { 'Content-Type': 'application/json; charset="utf-8"' } })
      expect(res.status).toBe(201)
    })

    it('rejects a body over 16 KiB with 413', async () => {
      await expectError(await put('001', { ...SONG, title: 'あ'.repeat(6000) }), 413, 'PAYLOAD_TOO_LARGE')
    })

    it.each([
      ['malformed JSON', '{"title":'],
      ['duplicate key', '{"title":"a","title":"b","artist":null,"level":null}'],
      ['array body', '[]'],
      ['unknown field', { ...SONG, youtubeUrl: 'https://example.com' }],
      ['missing artist key', { title: SONG.title, level: SONG.level }],
      ['empty title', { ...SONG, title: '' }],
      ['title with newline', { ...SONG, title: 'a\nb' }],
      ['title over 200 characters', { ...SONG, title: 'a'.repeat(201) }],
      ['numeric title', { ...SONG, title: 1 }],
      ['empty artist', { ...SONG, artist: '' }],
      ['level with spaces', { ...SONG, level: ' 5' }],
      ['level 0', { ...SONG, level: '0' }],
      ['numeric level', { ...SONG, level: 5 }],
    ])('rejects %s with 400', async (_, body) => {
      await expectError(await put('001', body), 400, 'INVALID_REQUEST')
      expect(await songRow('001')).toBeNull()
    })

    it.each(['000', '12', '123456789', 'abc'])('rejects gameSongId %s with 400', async (gameSongId) => {
      await expectError(await put(gameSongId, SONG), 400, 'INVALID_REQUEST')
    })
  })
})

describe('isDuplicateKeyError', () => {
  it('detects a duplicate gameSongId raised through Drizzle', async () => {
    const db = drizzle(env.DB)
    const row = { gameSongId: '001', title: 't', status: 'approved' as const, createdAt: 'x', updatedAt: 'x' }
    await db.insert(songs).values(row)

    const error = await db.insert(songs).values(row).then(
      () => null,
      (e: unknown) => e,
    )
    expect(isDuplicateKeyError(error, 'song.game_song_id')).toBe(true)
    expect(isDuplicateKeyError(error, 'player.token_hash')).toBe(false)
  })
})
