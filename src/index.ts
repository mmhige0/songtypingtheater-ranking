import { Hono } from 'hono'
import { ApiError, errorResponse } from './lib/http'
import { adminSongs } from './routes/admin-songs'
import { installations } from './routes/installations'
import { pages, renderNotFound } from './routes/pages'
import { playsRoute } from './routes/plays'
import { songsRoute } from './routes/songs'
import { ROBOTS } from './views/layout'

const app = new Hono<{ Bindings: Env }>()

// 検索結果に出さない。巡回は止めない（robots.txtで止めると検索エンジンがnoindexを読めなくなるため）
app.use('*', async (c, next) => {
  await next()
  c.header('X-Robots-Tag', ROBOTS)
})

// 旧ランキングホストの画面だけをメインドメインへ移す。APIは送信先を変えず、転送もしない。
app.use('*', async (c, next) => {
  const url = new URL(c.req.url)
  if (
    c.env.TOP_ORIGIN === c.env.RANKING_ORIGIN ||
    url.host !== new URL(c.env.RANKING_ORIGIN).host ||
    url.pathname === '/api' || url.pathname.startsWith('/api/') ||
    (c.req.method !== 'GET' && c.req.method !== 'HEAD')
  ) return next()
  // 旧ルートは曲一覧だったため、検索条件を保ったまま曲一覧へ移す。
  const path = url.pathname === '/' ? '/songs' : url.pathname
  return c.redirect(`${c.env.TOP_ORIGIN}${path}${url.search}`, 301)
})

app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))
app.route('/api/v1/admin/songs', adminSongs)
app.route('/api/v1/installations', installations)
app.route('/api/v1/plays', playsRoute)
app.route('/api/v1/songs', songsRoute)
app.route('/', pages)

app.notFound((c) =>
  c.req.path.startsWith('/api/') ? errorResponse(c, 404, 'NOT_FOUND', '見つかりません') : renderNotFound(c),
)

app.onError((error, c) => {
  if (error instanceof ApiError) return errorResponse(c, error.status, error.code, error.message, error.headers)
  // 応答には詳細を出さない。ログには最も内側の原因だけを残す
  // （Drizzleのエラー本文はクエリのパラメーター＝プレイヤー名等を含むため、包んだ側は出さない）
  let cause: unknown = error
  while (cause instanceof Error && cause.cause instanceof Error) cause = cause.cause
  console.error('unhandled error', cause instanceof Error ? `${cause.name}: ${cause.message}` : typeof cause)
  return errorResponse(c, 500, 'SERVER_ERROR', 'サーバーエラーが発生しました')
})

export default app
