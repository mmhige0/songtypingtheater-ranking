import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import app from '../src/index'

describe('GET /api/v1/health', () => {
  it('returns ok', async () => {
    const res = await app.request('/api/v1/health', {}, env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})
