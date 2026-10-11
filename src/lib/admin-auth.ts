import { createMiddleware } from 'hono/factory'
import { ApiError, readBearerToken } from './http'

const sha256 = async (value: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))

// 長さの違いも漏らさないよう、ハッシュ同士を定数時間で比較する
const timingSafeEqualText = async (a: string, b: string) => {
  const [hashA, hashB] = await Promise.all([sha256(a), sha256(b)])
  return crypto.subtle.timingSafeEqual(hashA, hashB)
}

// 管理用キーのBearer認証。サーバー側でキーが未設定なら全リクエストを拒否する
export const requireAdminKey = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const expected = c.env.ADMIN_API_KEY
  const provided = readBearerToken(c)

  if (!expected || !provided || !(await timingSafeEqualText(provided, expected))) {
    throw new ApiError(401, 'INVALID_TOKEN', '認証に失敗しました')
  }
  await next()
})
