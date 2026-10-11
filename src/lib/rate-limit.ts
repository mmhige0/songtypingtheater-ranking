import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { ApiError } from './http'
import type { PlayerAuthVariables } from './player-auth'

// wrangler.jsoncのratelimitsで設定した期間（秒）。limit()は残り時間を返さないため固定値で返す
const PERIOD_SECONDS = 60

const enforce = async (limiter: RateLimit, key: string) => {
  const { success } = await limiter.limit({ key })
  if (!success) {
    throw new ApiError(429, 'RATE_LIMITED', '送信回数の上限に達しました。時間をおいて再送してください', {
      'Retry-After': String(PERIOD_SECONDS),
    })
  }
}

// 送信元IPはCloudflareが設定するCF-Connecting-IPだけを使い、任意の転送ヘッダーは信頼しない
const clientIp = (c: Context) => c.req.header('CF-Connecting-IP') ?? 'unknown'

export const limitByIp = (pick: (env: Env) => RateLimit) =>
  createMiddleware<{ Bindings: Env }>(async (c, next) => {
    await enforce(pick(c.env), clientIp(c))
    await next()
  })

// requirePlayerTokenの後に置き、認証したtokenの所有playerIdごとに制限する
export const limitByPlayer = (pick: (env: Env) => RateLimit) =>
  createMiddleware<{ Bindings: Env; Variables: PlayerAuthVariables }>(async (c, next) => {
    await enforce(pick(c.env), c.var.authPlayerId)
    await next()
  })
