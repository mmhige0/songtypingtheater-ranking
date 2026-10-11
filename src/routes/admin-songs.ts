import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { isDuplicateKeyError } from '../db/errors'
import { songs } from '../db/schema'
import { requireAdminKey } from '../lib/admin-auth'
import { expectExactObject, invalidRequest, readJsonBody } from '../lib/http'
import { isValidGameSongId, isValidLevel, toLevelSortValue } from '../lib/song'
import { isValidText } from '../lib/text'

type SongInput = { title: string; artist: string | null; level: string | null }

const parseSongInput = (body: unknown): SongInput => {
  const { title, artist, level } = expectExactObject(body, ['title', 'artist', 'level'])
  if (!isValidText(title, 1, 200)) throw invalidRequest('titleは制御文字を含まない1〜200文字の文字列にしてください')
  if (artist !== null && !isValidText(artist, 1, 200)) {
    throw invalidRequest('artistは制御文字を含まない1〜200文字の文字列またはnullにしてください')
  }
  if (level !== null && (typeof level !== 'string' || !isValidLevel(level))) {
    throw invalidRequest('levelは「5」「5+」「5-」の形式の文字列またはnullにしてください')
  }
  return { title, artist, level }
}

export const adminSongs = new Hono<{ Bindings: Env }>()

adminSongs.use('*', requireAdminKey)

adminSongs.put('/:gameSongId', async (c) => {
  const gameSongId = c.req.param('gameSongId')
  if (!isValidGameSongId(gameSongId)) throw invalidRequest('gameSongIdは数字3〜8桁にしてください（000は不可）')
  const input = parseSongInput(await readJsonBody(c))

  const db = drizzle(c.env.DB)
  const now = new Date().toISOString()
  const values = { ...input, levelSortValue: toLevelSortValue(input.level), updatedAt: now }
  const findExisting = () => db.select().from(songs).where(eq(songs.gameSongId, gameSongId)).get()
  const respond = (status: 'created' | 'updated' | 'unchanged') => {
    c.header('Cache-Control', 'no-store')
    return c.json({ status, song: { gameSongId, ...input } }, status === 'created' ? 201 : 200)
  }

  let existing = await findExisting()
  if (!existing) {
    try {
      await db.insert(songs).values({ ...values, gameSongId, status: 'approved', createdAt: now })
      return respond('created')
    } catch (error) {
      // 同時登録で先に作成された場合は、既存行への更新として処理する
      if (!isDuplicateKeyError(error, 'song.game_song_id')) throw error
      existing = await findExisting()
      if (!existing) throw error
    }
  }

  if (existing.title === input.title && existing.artist === input.artist && existing.level === input.level) {
    return respond('unchanged')
  }
  // 内部ID・gameSongId・statusは変更しない
  await db.update(songs).set(values).where(eq(songs.id, existing.id))
  return respond('updated')
})
