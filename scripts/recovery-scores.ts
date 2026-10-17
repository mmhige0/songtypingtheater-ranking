import { normalizeUuidV4 } from '../src/lib/uuid'
import { toTeamKey } from '../src/lib/team-key'
import { SONG_BEST_REBUILD_SQL } from '../src/lib/song-best-sql'
import { sqlString } from './legacy-scores'

export type RecoveryRecord = {
  recordId: string
  gameSongId: string
  score: number
  participants: { name: string; playerId: string }[]
}
export type RecoveryInput = { batchId: string; records: RecoveryRecord[] }

// 名前からIDを推測しない。確認は参加者の出現ごとに必要（同名の別人にも対応）。
export function validateRecovery(input: unknown): asserts input is RecoveryInput {
  if (!input || typeof input !== 'object') throw new Error('入力はJSONオブジェクトにしてください')
  const { batchId, records } = input as RecoveryInput
  if (typeof batchId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(batchId)) throw new Error('batchIdが不正です')
  if (!Array.isArray(records) || records.length === 0) throw new Error('recordsが空です')
  const seen = new Set<string>()
  for (const r of records) {
    if (!r || typeof r.recordId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(r.recordId) || seen.has(r.recordId)) {
      throw new Error('recordIdが不正または重複しています')
    }
    seen.add(r.recordId)
    if (typeof r.gameSongId !== 'string' || !/^[0-9]{3,8}$/.test(r.gameSongId)) throw new Error(`${r.recordId}: 曲番号が不正です`)
    if (!Number.isInteger(r.score) || r.score < 0 || r.score > 2147483647) throw new Error(`${r.recordId}: スコアが不正です`)
    if (!Array.isArray(r.participants) || r.participants.length < 1 || r.participants.length > 4) throw new Error(`${r.recordId}: 人数が不正です`)
    const ids = new Set<string>()
    for (const p of r.participants) {
      if (!p || typeof p.name !== 'string' || p.name.trim() === '') throw new Error(`${r.recordId}: 参加者名が不正です`)
      const id = typeof p.playerId === 'string' ? normalizeUuidV4(p.playerId) : null
      if (!id || ids.has(id)) throw new Error(`${r.recordId}: IDが不正またはプレイ内で重複しています`)
      ids.add(id)
    }
  }
}

export function buildRecoverySql(input: unknown): string {
  validateRecovery(input)
  const lines: string[] = []
  for (const r of input.records) {
    const id = sqlString(`recovery:${input.batchId}:${r.recordId}`)
    const song = `(SELECT id FROM song WHERE game_song_id = ${sqlString(r.gameSongId)} AND status = 'approved')`
    const team = sqlString(toTeamKey(r.participants.map((p) => normalizeUuidV4(p.playerId)!)))
    // 全IDの実在をplay追加前に検証。欠けていればNOT NULL制約で止まる。
    const count = `(SELECT CASE WHEN COUNT(*) = ${r.participants.length} THEN ${r.participants.length} ELSE NULL END FROM player WHERE player_id IN (${r.participants.map((p) => sqlString(normalizeUuidV4(p.playerId)!)).join(', ')}))`
    lines.push(`INSERT INTO play (play_id, song_ref_id, score, received_at, player_count, team_key) VALUES (${id}, ${song}, ${r.score}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ${count}, ${team}) ON CONFLICT (play_id) DO UPDATE SET score = CASE WHEN play.song_ref_id = excluded.song_ref_id AND play.score = excluded.score AND play.team_key = excluded.team_key AND play.player_count = excluded.player_count AND play.host_player_id IS NULL THEN play.score ELSE -1 END;`)
    const values = r.participants.map((p, i) => `(${id}, ${sqlString(normalizeUuidV4(p.playerId)!)}, ${sqlString(p.name)}, '${['R', 'B', 'Y', 'G'][i]}')`)
    lines.push(`INSERT INTO play_participant (play_id, player_id, name_at_play, color_at_play) VALUES ${values.join(', ')} ON CONFLICT (play_id, player_id) DO UPDATE SET name_at_play = CASE WHEN play_participant.name_at_play = excluded.name_at_play AND play_participant.color_at_play = excluded.color_at_play THEN play_participant.name_at_play ELSE NULL END;`)
  }
  lines.push(...SONG_BEST_REBUILD_SQL.map((s) => `${s.replace(/\s+/g, ' ').trim()};`))
  return `${lines.join('\n')}\n`
}
