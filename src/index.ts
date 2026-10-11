import { Hono } from 'hono'
import { ApiError, errorResponse } from './lib/http'
import { adminSongs } from './routes/admin-songs'
import { installations } from './routes/installations'
import { playsRoute } from './routes/plays'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))
app.route('/api/v1/admin/songs', adminSongs)
app.route('/api/v1/installations', installations)
app.route('/api/v1/plays', playsRoute)

app.notFound((c) => errorResponse(c, 404, 'NOT_FOUND', '見つかりません'))

app.onError((error, c) => {
  if (error instanceof ApiError) return errorResponse(c, error.status, error.code, error.message)
  // 応答には詳細を出さない。ログには最も内側の原因だけを残す
  // （Drizzleのエラー本文はクエリのパラメーター＝プレイヤー名等を含むため、包んだ側は出さない）
  let cause: unknown = error
  while (cause instanceof Error && cause.cause instanceof Error) cause = cause.cause
  console.error('unhandled error', cause instanceof Error ? `${cause.name}: ${cause.message}` : typeof cause)
  return errorResponse(c, 500, 'SERVER_ERROR', 'サーバーエラーが発生しました')
})

export default app
