import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

// 架空データのみ使用
const NOW = '2026-10-10T13:00:02.120Z'
const HOST = '428d19c3-786c-4650-81c1-06848583d7fa'
const GUEST = 'f3e1a5de-d740-43d2-bce1-cd513c9b6790'
const PLAY = 'a978c461-3a06-487d-80c8-552eb969031a'

const run = (query: string, ...params: unknown[]) => env.DB.prepare(query).bind(...params).run()

const insertSong = (gameSongId: string | null, status = 'approved') =>
  run(
    'INSERT INTO song (game_song_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    gameSongId,
    '架空の曲名',
    status,
    NOW,
    NOW,
  )

const insertPlayer = (playerId: string) =>
  run('INSERT INTO player (player_id, created_at) VALUES (?, ?)', playerId, NOW)

const insertPlay = (playId: string, overrides: { isTaipen?: number | null; playerCount?: number } = {}) =>
  run(
    `INSERT INTO play (play_id, song_ref_id, score, is_full_combo, is_taipen, received_at, game_version,
      host_player_id, player_count, team_key)
     VALUES (?, 1, 123456, 1, ?, ?, '1.65', ?, ?, ?)`,
    playId,
    'isTaipen' in overrides ? overrides.isTaipen : 0,
    NOW,
    HOST,
    overrides.playerCount ?? 2,
    JSON.stringify([HOST, GUEST].sort()),
  )

const insertParticipant = (playerId: string, color: string | null) =>
  run(
    'INSERT INTO play_participant (play_id, player_id, name_at_play, color_at_play) VALUES (?, ?, ?, ?)',
    PLAY,
    playerId,
    'プレイヤーA',
    color,
  )

// 一意インデックスはSQLITE_CONSTRAINT_UNIQUE、主キーはSQLITE_CONSTRAINT_PRIMARYKEYになる
const duplicateError = (target: string, kind: 'UNIQUE' | 'PRIMARYKEY') =>
  new RegExp(`UNIQUE constraint failed: ${target.replaceAll('.', '\\.')}: .*SQLITE_CONSTRAINT_${kind}\\b`)
const CHECK_ERROR = /CHECK constraint failed/

beforeEach(async () => {
  await env.DB.batch(
    ['play_participant', 'play', 'legacy_identity_mapping', 'player', 'song'].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  )
  await insertSong('001')
  await insertPlayer(HOST)
  await insertPlayer(GUEST)
})

describe('song', () => {
  it('rejects duplicate gameSongId', async () => {
    await expect(insertSong('001')).rejects.toThrow(duplicateError('song.game_song_id', 'UNIQUE'))
  })

  it('allows multiple songs without gameSongId', async () => {
    await insertSong(null, 'pending')
    await expect(insertSong(null, 'pending')).resolves.toBeDefined()
  })

  it('requires gameSongId for approved songs', async () => {
    await expect(insertSong(null, 'approved')).rejects.toThrow(CHECK_ERROR)
  })

  it('lists songs in numeric order using the index', async () => {
    for (const id of ['1000', '999', '0123', '002']) await insertSong(id)
    const query = `SELECT game_song_id FROM song WHERE status = 'approved'
      ORDER BY CAST(game_song_id AS INTEGER), game_song_id LIMIT 50`

    const { results } = await env.DB.prepare(query).all<{ game_song_id: string }>()
    expect(results.map((r) => r.game_song_id)).toEqual(['001', '002', '0123', '999', '1000'])

    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${query}`).all<{ detail: string }>()
    const details = plan.results.map((r) => r.detail).join('\n')
    expect(details).toContain('song_status_game_song_number_idx')
    expect(details).not.toContain('TEMP B-TREE')
  })
})

describe('player', () => {
  const insertRegistered = (playerId: string, tokenHash: string) =>
    run('INSERT INTO player (player_id, token_hash, created_at) VALUES (?, ?, ?)', playerId, tokenHash, NOW)

  it('rejects a tokenHash registered to another player', async () => {
    await insertRegistered('0b5c7a4e-1f2d-4e8a-9c3b-6d7e8f9a0b1c', 'a'.repeat(64))
    await expect(insertRegistered('1c6d8b5f-2e3a-4f9b-8d4c-7e8f9a0b1c2d', 'a'.repeat(64))).rejects.toThrow(
      duplicateError('player.token_hash', 'UNIQUE'),
    )
  })

  it('rejects duplicate playerId as a primary key violation', async () => {
    await expect(insertPlayer(HOST)).rejects.toThrow(duplicateError('player.player_id', 'PRIMARYKEY'))
  })

  it('allows multiple legacy players without a token', async () => {
    await insertPlayer('legacy-0001')
    await expect(insertPlayer('legacy-0002')).resolves.toBeDefined()
  })
})

describe('play', () => {
  it('rejects duplicate playId as a primary key violation', async () => {
    await insertPlay(PLAY)
    await expect(insertPlay(PLAY)).rejects.toThrow(duplicateError('play.play_id', 'PRIMARYKEY'))
  })

  it('rejects TAIPEN with fewer than 4 players', async () => {
    await expect(insertPlay(PLAY, { isTaipen: 1, playerCount: 3 })).rejects.toThrow(CHECK_ERROR)
    await expect(insertPlay(PLAY, { isTaipen: 1, playerCount: 4 })).resolves.toBeDefined()
  })

  it('allows unknown TAIPEN for migrated plays', async () => {
    await insertPlay(PLAY, { isTaipen: null, playerCount: 1 })
    const stored = await env.DB.prepare('SELECT is_taipen FROM play WHERE play_id = ?')
      .bind(PLAY)
      .first<number | null>('is_taipen')
    expect(stored).toBeNull()
  })

  it('rejects a play whose song does not exist', async () => {
    await expect(
      run(
        `INSERT INTO play (play_id, song_ref_id, score, received_at, player_count, team_key)
         VALUES (?, 999, 0, ?, 1, '[]')`,
        PLAY,
        NOW,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })
})

describe('play_participant', () => {
  beforeEach(async () => {
    await insertPlay(PLAY)
    await insertParticipant(HOST, 'R')
  })

  it('rejects the same player twice in one play', async () => {
    await expect(insertParticipant(HOST, 'B')).rejects.toThrow(
      duplicateError('play_participant.play_id, play_participant.player_id', 'PRIMARYKEY'),
    )
  })

  it('rejects the same color twice in one play', async () => {
    await expect(insertParticipant(GUEST, 'R')).rejects.toThrow(
      duplicateError('play_participant.play_id, play_participant.color_at_play', 'UNIQUE'),
    )
  })

  it('rejects lowercase or missing colors', async () => {
    await expect(insertParticipant(GUEST, 'r')).rejects.toThrow(CHECK_ERROR)
    await expect(insertParticipant(GUEST, null)).rejects.toThrow(/NOT NULL constraint failed/)
  })

  it('accepts any color combination such as R and G', async () => {
    await expect(insertParticipant(GUEST, 'G')).resolves.toBeDefined()
  })
})

describe('batch', () => {
  it('rolls back the whole batch when one statement fails', async () => {
    const insertPlayStmt = env.DB.prepare(
      `INSERT INTO play (play_id, song_ref_id, score, received_at, host_player_id, player_count, team_key)
       VALUES (?, 1, 0, ?, ?, 2, '[]')`,
    ).bind(PLAY, NOW, HOST)
    const participant = (playerId: string, color: string) =>
      env.DB.prepare(
        'INSERT INTO play_participant (play_id, player_id, name_at_play, color_at_play) VALUES (?, ?, ?, ?)',
      ).bind(PLAY, playerId, 'プレイヤーA', color)

    await expect(env.DB.batch([insertPlayStmt, participant(HOST, 'R'), participant(GUEST, 'R')])).rejects.toThrow(
      duplicateError('play_participant.play_id, play_participant.color_at_play', 'UNIQUE'),
    )

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM play').first<number>('n')
    expect(count).toBe(0)
  })
})
