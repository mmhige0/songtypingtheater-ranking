import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../src/index'
import { hashInstallationToken } from '../src/lib/token'
import { resetDb } from './helpers'

// 架空のIDとtoken
const PLAYER = '428d19c3-786c-4650-81c1-06848583d7fa'
const OTHER_PLAYER = 'f3e1a5de-d740-43d2-bce1-cd513c9b6790'
const TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const OTHER_TOKEN = 'HxweHRwbGhkYFxYVFBMSERAPDg0MCwoJCAcGBQQDAgE'

const register = (body: unknown, headers: Record<string, string> = {}) =>
  app.request(
    '/api/v1/installations',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    env,
  )

const playerRows = () =>
  env.DB.prepare('SELECT * FROM player ORDER BY player_id').all<Record<string, unknown>>().then((r) => r.results)

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(res.headers.get('Cache-Control')).toBe('no-store')
  const text = await res.text()
  expect(text).not.toContain(TOKEN)
  expect(text).not.toContain(OTHER_TOKEN)
  expect(JSON.parse(text).error.code).toBe(code)
}

beforeEach(resetDb)

describe('POST /api/v1/installations', () => {
  it('registers a new player and stores only the token hash', async () => {
    const res = await register({ playerId: PLAYER, installationToken: TOKEN })
    expect(res.status).toBe(201)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ playerId: PLAYER, status: 'created' })

    const rows = await playerRows()
    expect(rows).toEqual([
      { player_id: PLAYER, token_hash: await hashInstallationToken(TOKEN), revoked_at: null, created_at: expect.any(String) },
    ])
    expect(JSON.stringify(rows)).not.toContain(TOKEN)
  })

  it('normalizes an uppercase playerId to lowercase', async () => {
    const res = await register({ playerId: PLAYER.toUpperCase(), installationToken: TOKEN })
    expect(await res.json()).toEqual({ playerId: PLAYER, status: 'created' })
  })

  it('returns 200 for a resend with the same id and token without changing the row', async () => {
    await register({ playerId: PLAYER, installationToken: TOKEN })
    const before = await playerRows()

    const res = await register({ playerId: PLAYER.toUpperCase(), installationToken: TOKEN })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ playerId: PLAYER, status: 'already_registered' })
    expect(await playerRows()).toEqual(before)
  })

  it('rejects a different token for a registered playerId with 409', async () => {
    await register({ playerId: PLAYER, installationToken: TOKEN })
    const before = await playerRows()

    await expectError(await register({ playerId: PLAYER, installationToken: OTHER_TOKEN }), 409, 'PLAYER_ID_ALREADY_REGISTERED')
    expect(await playerRows()).toEqual(before)
  })

  it('rejects a token already registered to another playerId with 409', async () => {
    await register({ playerId: PLAYER, installationToken: TOKEN })
    await expectError(await register({ playerId: OTHER_PLAYER, installationToken: TOKEN }), 409, 'TOKEN_ALREADY_REGISTERED')
    expect(await playerRows()).toHaveLength(1)
  })

  describe('revoked token', () => {
    beforeEach(async () => {
      await register({ playerId: PLAYER, installationToken: TOKEN })
      await env.DB.prepare(`UPDATE player SET revoked_at = '2026-10-10T00:00:00.000Z'`).run()
    })

    it('rejects the same id and token with 401 and does not reactivate it', async () => {
      await expectError(await register({ playerId: PLAYER, installationToken: TOKEN }), 401, 'REVOKED_TOKEN')
      const [row] = await playerRows()
      expect(row?.revoked_at).toBe('2026-10-10T00:00:00.000Z')
    })

    it('rejects the revoked token under another playerId with 409', async () => {
      await expectError(await register({ playerId: OTHER_PLAYER, installationToken: TOKEN }), 409, 'TOKEN_ALREADY_REGISTERED')
    })

    it('rejects a different token for the revoked playerId with 409', async () => {
      await expectError(await register({ playerId: PLAYER, installationToken: OTHER_TOKEN }), 409, 'PLAYER_ID_ALREADY_REGISTERED')
    })
  })

  describe('concurrent registration', () => {
    it('stores one row for the same id and token and returns 201 and 200', async () => {
      const responses = await Promise.all([
        register({ playerId: PLAYER, installationToken: TOKEN }),
        register({ playerId: PLAYER, installationToken: TOKEN }),
      ])
      expect(responses.map((r) => r.status).sort()).toEqual([200, 201])
      expect(await playerRows()).toHaveLength(1)
    })

    it('lets only one player register the same token', async () => {
      const responses = await Promise.all([
        register({ playerId: PLAYER, installationToken: TOKEN }),
        register({ playerId: OTHER_PLAYER, installationToken: TOKEN }),
      ])
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409])
      expect(await playerRows()).toHaveLength(1)
    })
  })

  describe('request validation', () => {
    it.each([
      ['legacy playerId', { playerId: 'legacy-0001', installationToken: TOKEN }],
      ['UUIDv1 playerId', { playerId: 'a978c461-3a06-187d-80c8-552eb969031a', installationToken: TOKEN }],
      ['short token', { playerId: PLAYER, installationToken: TOKEN.slice(0, 42) }],
      ['padded token', { playerId: PLAYER, installationToken: TOKEN.slice(0, 42) + '=' }],
      ['non-canonical token', { playerId: PLAYER, installationToken: TOKEN.slice(0, 42) + '9' }],
      ['unknown field', { playerId: PLAYER, installationToken: TOKEN, extra: 1 }],
      ['missing token', { playerId: PLAYER }],
      ['duplicate key', `{"playerId":"${PLAYER}","installationToken":"${TOKEN}","installationToken":"${TOKEN}"}`],
    ])('rejects %s with 400 and stores nothing', async (_, body) => {
      await expectError(await register(body), 400, 'INVALID_REQUEST')
      expect(await playerRows()).toHaveLength(0)
    })

    it('rejects a non-JSON content type with 415', async () => {
      const res = await register({ playerId: PLAYER, installationToken: TOKEN }, { 'Content-Type': 'text/plain' })
      await expectError(res, 415, 'UNSUPPORTED_MEDIA_TYPE')
    })
  })
})
