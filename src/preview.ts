import { Hono } from 'hono'
import app from './index'

// 本番と別の入口にし、本番の書き込みAPIの動作は変更しない。
const preview = new Hono<{ Bindings: Env }>()

preview.use('*', async (c, next) => {
  c.header('X-Robots-Tag', 'noindex, nofollow')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    c.header('Allow', 'GET, HEAD, OPTIONS')
    return c.json({ error: { code: 'PREVIEW_READ_ONLY', message: 'プレビューは閲覧専用です' } }, 405)
  }
  // 画面内のリンク・フォーム・転送先を現在のプレビューURLにそろえる。
  const origin = new URL(c.req.url).origin
  c.env = { ...c.env, TOP_ORIGIN: origin, RANKING_ORIGIN: origin }
  await next()
})

preview.route('/', app)

export default preview
