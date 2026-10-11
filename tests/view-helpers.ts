import { env } from 'cloudflare:workers'
import { toTeamKey } from '../src/lib/team-key'

// 閲覧系テスト用のデータ投入。架空の曲・ID・名前のみ使用

const NOW = '2026-10-10T13:00:00.000Z'

export const insertSong = async (
  gameSongId: string,
  title: string,
  { artist = null as string | null, level = null as string | null, levelSortValue = null as number | null } = {},
) => {
  const row = await env.DB.prepare(
    `INSERT INTO song (game_song_id, title, artist, level, level_sort_value, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'approved', ?, ?) RETURNING id`,
  )
    .bind(gameSongId, title, artist, level, levelSortValue, NOW, NOW)
    .first<{ id: number }>()
  return row!.id
}

export const insertPlayers = (...playerIds: string[]) =>
  env.DB.batch(
    playerIds.map((id) =>
      env.DB.prepare('INSERT INTO player (player_id, token_hash, created_at) VALUES (?, NULL, ?)').bind(id, NOW),
    ),
  )

type PlayOptions = {
  playId: string
  songRefId: number
  score: number
  participants: { id: string; name: string; color: 'R' | 'B' | 'Y' | 'G' }[]
  isFullCombo?: boolean | null
  receivedAt?: string
  // nullなら移行分
  hostPlayerId?: string | null
  excluded?: boolean
}

export const insertPlay = ({
  playId,
  songRefId,
  score,
  participants,
  isFullCombo = false,
  receivedAt = NOW,
  hostPlayerId,
  excluded = false,
}: PlayOptions) =>
  env.DB.batch([
    env.DB.prepare(
      `INSERT INTO play (play_id, song_ref_id, score, is_full_combo, is_taipen, received_at, game_version,
         host_player_id, player_count, team_key, excluded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      playId,
      songRefId,
      score,
      isFullCombo === null ? null : isFullCombo ? 1 : 0,
      hostPlayerId === null ? null : 0,
      receivedAt,
      hostPlayerId === null ? null : '1.65',
      hostPlayerId === undefined ? participants[0]!.id : hostPlayerId,
      participants.length,
      toTeamKey(participants.map((p) => p.id)),
      excluded ? NOW : null,
    ),
    ...participants.map((p) =>
      env.DB.prepare(
        'INSERT INTO play_participant (play_id, player_id, name_at_play, color_at_play) VALUES (?, ?, ?, ?)',
      ).bind(playId, p.id, p.name, p.color),
    ),
  ])

// 受付日時を秒単位でずらした値
export const at = (seconds: number) => new Date(Date.parse(NOW) + seconds * 1000).toISOString()
