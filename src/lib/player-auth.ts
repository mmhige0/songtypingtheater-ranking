import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createMiddleware } from 'hono/factory'
import { players } from '../db/schema'
import { ApiError, readBearerToken } from './http'
import { hashInstallationToken, isValidInstallationToken } from './token'

export type PlayerAuthVariables = { authPlayerId: string }

// installationTokenのBearer認証。認証したtokenの所有playerIdをc.var.authPlayerIdに設定する
export const requirePlayerToken = createMiddleware<{ Bindings: Env; Variables: PlayerAuthVariables }>(
  async (c, next) => {
    const token = readBearerToken(c)
    if (!token || !isValidInstallationToken(token)) {
      throw new ApiError(401, 'INVALID_TOKEN', '認証に失敗しました')
    }

    const tokenHash = await hashInstallationToken(token)
    const player = await drizzle(c.env.DB)
      .select({ playerId: players.playerId, revokedAt: players.revokedAt })
      .from(players)
      .where(eq(players.tokenHash, tokenHash))
      .get()

    if (!player) throw new ApiError(401, 'INVALID_TOKEN', '認証に失敗しました')
    if (player.revokedAt !== null) throw new ApiError(401, 'REVOKED_TOKEN', 'このtokenは失効しています')

    c.set('authPlayerId', player.playerId)
    await next()
  },
)
