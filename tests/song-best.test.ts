import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { fetchBestScores } from '../src/lib/ranking'
import { songBestRebuildStatements } from '../src/lib/song-best'
import { SONG_BEST_REBUILD_SQL } from '../src/lib/song-best-sql'
import { toTeamKey } from '../src/lib/team-key'
import { resetDb } from './helpers'
import { at, insertPlayers, insertSong } from './view-helpers'

// 架空のID・名前のみ使用
const IDS = Array.from({ length: 6 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)

// song_bestを更新せずに記録だけを入れる（旧記録の取り込みや除外のように記録を直接変えた状態を作る）
const insertRawPlay = (
  playId: string,
  songRefId: number,
  score: number,
  members: { id: string; name: string; color: 'R' | 'B' | 'Y' | 'G' }[],
  { isFullCombo = 0 as number | null, receivedAt = at(0), excluded = false } = {},
) =>
  env.DB.batch([
    env.DB.prepare(
      `INSERT INTO play (play_id, song_ref_id, score, is_full_combo, received_at, host_player_id, player_count, team_key, excluded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      playId,
      songRefId,
      score,
      isFullCombo,
      receivedAt,
      members[0]!.id,
      members.length,
      toTeamKey(members.map((m) => m.id)),
      excluded ? at(0) : null,
    ),
    ...members.map((m) =>
      env.DB.prepare(
        'INSERT INTO play_participant (play_id, player_id, name_at_play, color_at_play) VALUES (?, ?, ?, ?)',
      ).bind(playId, m.id, m.name, m.color),
    ),
  ])

const rebuild = () => env.DB.batch(songBestRebuildStatements(env.DB))
const rowCount = () => env.DB.prepare('SELECT COUNT(*) AS n FROM song_best').first<number>('n')

let song: number
let other: number

beforeEach(async () => {
  await resetDb()
  song = await insertSong('001', '架空の曲')
  other = await insertSong('002', '架空の別の曲')
  await insertPlayers(...IDS)
})

describe('song_best rebuild', () => {
  it('computes the top of every song and player count from the plays', async () => {
    const [a, b, c, d] = IDS
    await insertRawPlay('s1', song, 500, [{ id: a!, name: 'Alice', color: 'R' }], { receivedAt: at(2) })
    // 同点の別チーム（受付が早い方が代表）と、同じチームの同点（チームは1組と数える）
    await insertRawPlay('s2', song, 500, [{ id: b!, name: 'Bob', color: 'R' }], { receivedAt: at(1) })
    await insertRawPlay('s3', song, 500, [{ id: b!, name: 'Bob', color: 'R' }], { receivedAt: at(3) })
    // 1位でないFCも「FCあり」に数える
    await insertRawPlay('s4', song, 100, [{ id: c!, name: 'Carol', color: 'R' }], { isFullCombo: 1 })
    // 除外済みは数えない
    await insertRawPlay('s5', song, 900, [{ id: d!, name: 'Dave', color: 'R' }], { excluded: true })
    await insertRawPlay(
      'd1',
      other,
      300,
      [
        { id: c!, name: 'Carol', color: 'Y' },
        { id: a!, name: 'Alice', color: 'R' },
      ],
      { isFullCombo: null },
    )
    await rebuild()

    const best = await fetchBestScores(env.DB, [song, other])
    expect(best.get(song)!['1']).toEqual({
      score: 500,
      isFullCombo: false,
      hasFullCombo: true,
      participants: [{ name: 'Bob', color: 'R' }],
      tiedOthers: 1,
      name: 'Bob',
    })
    expect(best.get(song)!['2']).toBeNull()
    // 参加者は色の順に並べ替える。移行分のFC不明はnull
    expect(best.get(other)!['2']).toEqual({
      score: 300,
      isFullCombo: null,
      hasFullCombo: false,
      participants: [
        { name: 'Alice', color: 'R' },
        { name: 'Carol', color: 'Y' },
      ],
      tiedOthers: 0,
    })
    expect(await rowCount()).toBe(2)
  })

  it('drops rows of songs and player counts that no longer have plays', async () => {
    await insertRawPlay('s1', song, 500, [{ id: IDS[0]!, name: 'Alice', color: 'R' }])
    await rebuild()
    expect(await rowCount()).toBe(1)
    await env.DB.prepare('UPDATE play SET excluded_at = ?').bind(at(1)).run()
    await rebuild()
    expect(await rowCount()).toBe(0)
  })

  it('is the same statement the migration runs for existing plays', () => {
    const normalize = (sql: string) =>
      sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/;\s*$/, '')
        .trim()
    const migration = env.TEST_MIGRATIONS.find((m) => m.name === '0002_song_best.sql')!
    const backfill = migration.queries.map(normalize).find((q) => q.startsWith('INSERT INTO song_best'))
    expect(backfill).toBe(normalize(SONG_BEST_REBUILD_SQL[1]))
  })
})
