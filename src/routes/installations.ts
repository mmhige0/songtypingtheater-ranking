import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { isDuplicateKeyError } from '../db/errors'
import { players } from '../db/schema'
import { ApiError, expectExactObject, invalidRequest, readJsonBody } from '../lib/http'
import { limitByIp } from '../lib/rate-limit'
import { hashInstallationToken, isValidInstallationToken } from '../lib/token'
import { normalizeUuidV4 } from '../lib/uuid'

export const installations = new Hono<{ Bindings: Env }>()

// tokenに関わる応答はエラーも含めてキャッシュさせない
installations.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})
installations.use('*', limitByIp((env) => env.INSTALLATIONS_IP_LIMITER))

installations.post('/', async (c) => {
  const body = expectExactObject(await readJsonBody(c), ['playerId', 'installationToken'])
  const playerId = normalizeUuidV4(body.playerId)
  if (!playerId) throw invalidRequest('playerIdはUUIDv4にしてください')
  // tokenの値はエラー応答に含めない
  if (!isValidInstallationToken(body.installationToken)) {
    throw invalidRequest('installationTokenは32バイトのBase64URL（パディングなし43文字）にしてください')
  }

  const db = drizzle(c.env.DB)
  const tokenHash = await hashInstallationToken(body.installationToken)

  // 先に挿入し、重複したときだけ既存行と照合する（同時登録も一意制約で1件に決まる）
  try {
    await db.insert(players).values({ playerId, tokenHash, createdAt: new Date().toISOString() })
    return c.json({ playerId, status: 'created' }, 201)
  } catch (error) {
    if (!isDuplicateKeyError(error, 'player.player_id') && !isDuplicateKeyError(error, 'player.token_hash')) {
      throw error
    }
  }

  // 再送・競合時も既存行は変更しない（上書き・再有効化しない）
  const existing = await db.select().from(players).where(eq(players.playerId, playerId)).get()
  if (!existing) {
    throw new ApiError(409, 'TOKEN_ALREADY_REGISTERED', 'このtokenは別のplayerIdで登録済みです')
  }
  if (existing.tokenHash !== tokenHash) {
    throw new ApiError(409, 'PLAYER_ID_ALREADY_REGISTERED', 'このplayerIdは別のtokenで登録済みです')
  }
  if (existing.revokedAt !== null) {
    throw new ApiError(401, 'REVOKED_TOKEN', 'このtokenは失効しています')
  }
  return c.json({ playerId, status: 'already_registered' }, 200)
})
