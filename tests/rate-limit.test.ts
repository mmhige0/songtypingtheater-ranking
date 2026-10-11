import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../src/index'
import { hashInstallationToken } from '../src/lib/token'
import { resetDb } from './helpers'

// 架空のIDとtoken
const HOST = '428d19c3-786c-4650-81c1-06848583d7fa'
const HOST_TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'

// 呼ばれたキーを記録し、指定したキーだけ上限超過として扱うテスト用のRateLimit
const fakeLimiter = (blockedKeys: string[] = []) => {
  const keys: string[] = []
  const limiter: RateLimit = {
    limit: async ({ key }) => {
      keys.push(key)
      return { success: !blockedKeys.includes(key) }
    },
  }
  return { limiter, keys }
}

const post = (path: string, testEnv: Env, headers: Record<string, string> = {}) =>
  app.request(
    path,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' },
    testEnv,
  )

const expectRateLimited = async (res: Response) => {
  expect(res.status).toBe(429)
  expect(res.headers.get('Retry-After')).toBe('60')
  const json = (await res.json()) as { error: { code: string; retryable: boolean } }
  expect(json.error).toMatchObject({ code: 'RATE_LIMITED', retryable: true })
}

beforeEach(async () => {
  await resetDb()
  await env.DB.prepare('INSERT INTO player (player_id, token_hash, created_at) VALUES (?, ?, ?)')
    .bind(HOST, await hashInstallationToken(HOST_TOKEN), '2026-10-10T13:00:02.120Z')
    .run()
})

describe('POST /api/v1/installations rate limit', () => {
  it('limits by CF-Connecting-IP before validating the body', async () => {
    const { limiter, keys } = fakeLimiter(['198.51.100.1'])
    const testEnv = { ...env, INSTALLATIONS_IP_LIMITER: limiter }

    await expectRateLimited(await post('/api/v1/installations', testEnv, { 'CF-Connecting-IP': '198.51.100.1' }))
    // 別IPは制限されず、本文の検証（400）まで進む
    expect((await post('/api/v1/installations', testEnv, { 'CF-Connecting-IP': '198.51.100.2' })).status).toBe(400)
    expect(keys).toEqual(['198.51.100.1', '198.51.100.2'])
  })

  it('ignores X-Forwarded-For', async () => {
    const { limiter, keys } = fakeLimiter()
    await post('/api/v1/installations', { ...env, INSTALLATIONS_IP_LIMITER: limiter }, { 'X-Forwarded-For': '203.0.113.9' })
    expect(keys).toEqual(['unknown'])
  })

  it('keeps Cache-Control: no-store on 429', async () => {
    const { limiter } = fakeLimiter(['unknown'])
    const res = await post('/api/v1/installations', { ...env, INSTALLATIONS_IP_LIMITER: limiter })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('POST /api/v1/plays rate limit', () => {
  it('limits by IP before authentication', async () => {
    const { limiter } = fakeLimiter(['198.51.100.1'])
    const res = await post('/api/v1/plays', { ...env, PLAYS_IP_LIMITER: limiter }, { 'CF-Connecting-IP': '198.51.100.1' })
    await expectRateLimited(res)
  })

  it('limits by the authenticated playerId after authentication', async () => {
    const ip = fakeLimiter()
    const player = fakeLimiter([HOST])
    const testEnv = { ...env, PLAYS_IP_LIMITER: ip.limiter, PLAYS_PLAYER_LIMITER: player.limiter }

    await expectRateLimited(await post('/api/v1/plays', testEnv, { Authorization: `Bearer ${HOST_TOKEN}` }))
    expect(player.keys).toEqual([HOST])
  })

  it('does not count unauthenticated requests per player', async () => {
    const player = fakeLimiter()
    const res = await post('/api/v1/plays', { ...env, PLAYS_PLAYER_LIMITER: player.limiter })
    expect(res.status).toBe(401)
    expect(player.keys).toEqual([])
  })
})

describe('Workers Rate Limiting binding', () => {
  it('is configured and returns an outcome', async () => {
    // テスト環境の上限（100,000）は超えず、設定したバインディングが成否を返すことだけを確認する
    expect(await env.INSTALLATIONS_IP_LIMITER.limit({ key: 'binding-check' })).toEqual({ success: true })
  })
})
