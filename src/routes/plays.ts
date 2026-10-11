import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { isDuplicateKeyError } from '../db/errors'
import { PLAYER_COLORS, playParticipants, players, plays, songs } from '../db/schema'
import { ApiError, expectExactObject, invalidRequest, readJsonBody } from '../lib/http'
import { requirePlayerToken, type PlayerAuthVariables } from '../lib/player-auth'
import { limitByIp, limitByPlayer } from '../lib/rate-limit'
import { isValidGameSongId } from '../lib/song'
import { toTeamKey } from '../lib/team-key'
import { isValidText } from '../lib/text'
import { normalizeUuidV4 } from '../lib/uuid'

const MAX_SCORE = 2_147_483_647
const GAME_VERSION = /^[\x20-\x7e]{1,32}$/

type PlayerColor = (typeof PLAYER_COLORS)[number]
type PlayInput = {
  playId: string
  songId: string
  score: number
  isFullCombo: boolean
  hostPlayerId: string
  players: { playerId: string; name: string; color: PlayerColor }[]
  gameVersion: string
  isTaipen: boolean
}

const requireUuid = (value: unknown, field: string) => {
  const id = normalizeUuidV4(value)
  if (!id) throw invalidRequest(`${field}はUUIDv4にしてください`)
  return id
}

const requireBoolean = (value: unknown, field: string) => {
  if (typeof value !== 'boolean') throw invalidRequest(`${field}はtrueまたはfalseにしてください`)
  return value
}

// 型・構造・各値の形式を検証する（400）。得点範囲など登録条件の検証は後段（422）で行う
const parsePlayInput = (body: unknown): PlayInput => {
  const input = expectExactObject(body, [
    'playId',
    'songId',
    'score',
    'isFullCombo',
    'hostPlayerId',
    'players',
    'gameVersion',
    'isTaipen',
  ])

  if (typeof input.songId !== 'string' || !isValidGameSongId(input.songId)) {
    throw invalidRequest('songIdは数字3〜8桁の文字列にしてください（000は不可）')
  }
  if (typeof input.score !== 'number' || !Number.isInteger(input.score)) {
    throw invalidRequest('scoreは整数にしてください')
  }
  if (!Array.isArray(input.players) || input.players.length < 1 || input.players.length > 4) {
    throw invalidRequest('playersは1〜4件の配列にしてください')
  }
  if (typeof input.gameVersion !== 'string' || !GAME_VERSION.test(input.gameVersion)) {
    throw invalidRequest('gameVersionは表示可能なASCII文字1〜32文字にしてください')
  }

  return {
    playId: requireUuid(input.playId, 'playId'),
    songId: input.songId,
    score: input.score,
    isFullCombo: requireBoolean(input.isFullCombo, 'isFullCombo'),
    hostPlayerId: requireUuid(input.hostPlayerId, 'hostPlayerId'),
    players: input.players.map((item: unknown, i) => {
      const player = expectExactObject(item, ['playerId', 'name', 'color'])
      if (!isValidText(player.name, 1, 40)) {
        throw invalidRequest(`players[${i}].nameは制御文字を含まない1〜40文字の文字列にしてください`)
      }
      if (!PLAYER_COLORS.includes(player.color as PlayerColor)) {
        throw invalidRequest(`players[${i}].colorはR・B・Y・Gのいずれかにしてください`)
      }
      return {
        playerId: requireUuid(player.playerId, `players[${i}].playerId`),
        name: player.name,
        color: player.color as PlayerColor,
      }
    }),
    gameVersion: input.gameVersion,
    isTaipen: requireBoolean(input.isTaipen, 'isTaipen'),
  }
}

export const playsRoute = new Hono<{ Bindings: Env; Variables: PlayerAuthVariables }>()

// IP単位は認証前（拒否されるリクエストも数える）、プレイヤー単位は認証後に制限する
playsRoute.use('*', limitByIp((env) => env.PLAYS_IP_LIMITER))
playsRoute.use('*', requirePlayerToken)
playsRoute.use('*', limitByPlayer((env) => env.PLAYS_PLAYER_LIMITER))

playsRoute.post('/', async (c) => {
  const input = parsePlayInput(await readJsonBody(c))
  const playerIds = input.players.map((p) => p.playerId)

  if (new Set(playerIds).size !== playerIds.length) {
    throw new ApiError(400, 'DUPLICATE_PLAYER_ID', '同じplayerIdの参加者が含まれています')
  }
  if (new Set(input.players.map((p) => p.color)).size !== input.players.length) {
    throw new ApiError(400, 'DUPLICATE_COLOR', '同じ色の参加者が含まれています')
  }
  if (!playerIds.includes(input.hostPlayerId) || input.hostPlayerId !== c.var.authPlayerId) {
    throw new ApiError(403, 'HOST_ID_MISMATCH', 'hostPlayerIdが参加者または認証したプレイヤーと一致しません')
  }

  const db = drizzle(c.env.DB)
  const findReceivedAt = () =>
    db.select({ receivedAt: plays.receivedAt }).from(plays).where(eq(plays.playId, input.playId)).get()
  const alreadyRegistered = (receivedAt: string) =>
    c.json({ playId: input.playId, status: 'already_registered', receivedAt }, 200)

  // 再送は本文を比較せず、初回のreceivedAtを返す
  const existing = await findReceivedAt()
  if (existing) return alreadyRegistered(existing.receivedAt)

  const song = await db
    .select({ id: songs.id })
    .from(songs)
    .where(and(eq(songs.gameSongId, input.songId), eq(songs.status, 'approved')))
    .get()
  if (!song) throw new ApiError(422, 'UNKNOWN_SONG', '曲が未登録です')

  // 初回登録済み＝tokenHashあり。移行用Player（tokenHashなし）は登録済みとみなさない
  const registered = await db
    .select({ playerId: players.playerId })
    .from(players)
    .where(and(inArray(players.playerId, playerIds), isNotNull(players.tokenHash)))
    .all()
  if (registered.length !== playerIds.length) {
    throw new ApiError(422, 'UNKNOWN_PLAYER', '初回登録が完了していない参加者が含まれています')
  }

  if (input.isTaipen && input.players.length !== 4) {
    throw new ApiError(422, 'INVALID_TAIPEN_PLAYER_COUNT', 'TAIPENの記録は4人の場合だけ登録できます')
  }
  if (input.score < 0 || input.score > MAX_SCORE) {
    throw new ApiError(422, 'SCORE_OUT_OF_RANGE', `scoreは0〜${MAX_SCORE}にしてください`)
  }

  const receivedAt = new Date().toISOString()
  try {
    await db.batch([
      db.insert(plays).values({
        playId: input.playId,
        songRefId: song.id,
        score: input.score,
        isFullCombo: input.isFullCombo,
        isTaipen: input.isTaipen,
        receivedAt,
        gameVersion: input.gameVersion,
        hostPlayerId: input.hostPlayerId,
        playerCount: input.players.length,
        teamKey: toTeamKey(playerIds),
      }),
      db.insert(playParticipants).values(
        input.players.map((p) => ({
          playId: input.playId,
          playerId: p.playerId,
          nameAtPlay: p.name,
          colorAtPlay: p.color,
        })),
      ),
    ])
  } catch (error) {
    // 同時に届いた再送で先に保存された場合
    if (!isDuplicateKeyError(error, 'play.play_id')) throw error
    const saved = await findReceivedAt()
    if (!saved) throw error
    return alreadyRegistered(saved.receivedAt)
  }

  return c.json({ playId: input.playId, status: 'created', receivedAt }, 201)
})
