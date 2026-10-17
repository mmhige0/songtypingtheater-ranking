import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import preview from '../src/preview'

describe('閲覧専用プレビュー', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%sをDBや認証処理に到達する前に拒否する', async (method) => {
    for (const path of ['/api/v1/installations', '/api/v1/plays', '/api/v1/admin/songs/001']) {
      // バインディングがなくても拒否できることを確認する。
      const res = await preview.request('https://pr-123.example.workers.dev' + path, { method }, {} as Env)
      expect(res.status).toBe(405)
      expect(res.headers.get('Allow')).toBe('GET, HEAD, OPTIONS')
      expect(res.headers.get('X-Robots-Tag')).toContain('noindex')
      expect(await res.json()).toMatchObject({ error: { code: 'PREVIEW_READ_ONLY' } })
    }
  })

  it('GETのヘルスチェックは利用できる', async () => {
    const res = await preview.request('https://pr-123.example.workers.dev/api/v1/health', {}, env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('トップを本番へ転送せず、画面内リンクもプレビューにする', async () => {
    const origin = 'https://pr-123.example.workers.dev'
    const res = await preview.request(origin + '/', {}, env)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain(origin)
    expect(html).not.toContain('https://kayomodoki.com')
    expect(html).not.toContain('https://ranking.kayomodoki.com')
  })

  it('HEADも利用できる', async () => {
    const res = await preview.request('https://pr-123.example.workers.dev/api/v1/health', { method: 'HEAD' }, env)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
  })
})
