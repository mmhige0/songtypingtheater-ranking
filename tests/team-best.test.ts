import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { fetchRankings, type RankingFilter } from '../src/lib/ranking'
import { TEAM_BEST_REBUILD_SQL } from '../src/lib/team-best-sql'
import { toTeamKey } from '../src/lib/team-key'
import { resetDb } from './helpers'
import { at, insertPlay, insertPlayers, insertSong } from './view-helpers'

// 架空のプレイヤー・曲だけを使う。
const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const filter: RankingFilter = { fullComboOnly: false, name: null }
let song: number
const solo = (id = A, name = '架空の人') => [{ id, name, color: 'R' as const }]
const row = () => env.DB.prepare('SELECT * FROM team_best WHERE song_ref_id = ? AND player_count = 1 AND team_key = ?')
  .bind(song, toTeamKey([A])).first()
const ranking = (options: RankingFilter = filter) => fetchRankings(env.DB, song, [1], options, { limit: 10, offset: 0 })

beforeEach(async () => {
  await resetDb()
  song = await insertSong('001', '架空の曲')
  await insertPlayers(A, B)
})

describe('team_best maintenance', () => {
  it('keeps the representative and FC maximum separately, including FC score zero', async () => {
    await insertPlay({ playId: 'top', songRefId: song, score: 100, participants: solo(), isFullCombo: null, hostPlayerId: null })
    await insertPlay({ playId: 'fc0', songRefId: song, score: 0, participants: solo(), isFullCombo: true })
    expect(await row()).toMatchObject({ play_id: 'top', score: 100, is_full_combo: null, host_player_id: null, best_fc_score: 0 })
    await insertPlay({ playId: 'fc50', songRefId: song, score: 50, participants: solo(), isFullCombo: true })
    await insertPlay({ playId: 'loser', songRefId: song, score: 90, participants: solo() })
    expect(await row()).toMatchObject({ play_id: 'top', best_fc_score: 50 })
    await insertPlay({ playId: 'excluded', songRefId: song, score: 200, participants: solo(), isFullCombo: true, excluded: true })
    expect(await row()).toMatchObject({ play_id: 'top', best_fc_score: 50 })
  })

  it('uses FC, receipt time, then play ID to break same-team score ties', async () => {
    for (const [playId, isFullCombo, time] of [
      ['plain', false, 0], ['z', true, 5], ['y', true, 3], ['a', true, 3], ['late', true, 8],
    ] as const) {
      await insertPlay({ playId, songRefId: song, score: 100, participants: solo(A, playId), isFullCombo, receivedAt: at(time) })
    }
    expect(await row()).toMatchObject({ play_id: 'a', received_at: at(3), best_fc_score: 100 })
    expect((await ranking()).get(1)!.entries[0]!.participants[0]!.name).toBe('a')
  })

  it('falls back after exclusion/deletion, restores after unexclusion, and removes empty teams', async () => {
    await insertPlay({ playId: 'top', songRefId: song, score: 100, participants: solo() })
    await insertPlay({ playId: 'fc', songRefId: song, score: 80, participants: solo(), isFullCombo: true })
    await insertPlay({ playId: 'fallback', songRefId: song, score: 60, participants: solo(), isFullCombo: true })
    await env.DB.prepare("UPDATE play SET excluded_at = ? WHERE play_id = 'fc'").bind(at(1)).run()
    expect(await row()).toMatchObject({ play_id: 'top', best_fc_score: 60 })
    await env.DB.prepare("UPDATE play SET excluded_at = NULL WHERE play_id = 'fc'").run()
    expect(await row()).toMatchObject({ best_fc_score: 80 })
    await env.DB.prepare("DELETE FROM play WHERE play_id = 'top'").run()
    expect(await row()).toMatchObject({ play_id: 'fc', score: 80 })
    await env.DB.prepare("DELETE FROM play WHERE play_id = 'fc'").run()
    expect(await row()).toMatchObject({ play_id: 'fallback', score: 60, best_fc_score: 60 })
    await env.DB.prepare("DELETE FROM play WHERE play_id = 'fallback'").run()
    expect(await row()).toBeNull()
  })

  it('recomputes old/new groups when team, player count or song changes, and after score/FC corrections', async () => {
    const other = await insertSong('002', '架空の別曲')
    await insertPlay({ playId: 'a', songRefId: song, score: 100, participants: solo(), isFullCombo: true })
    await insertPlay({ playId: 'b', songRefId: song, score: 80, participants: solo(B) })
    await env.DB.prepare("UPDATE play SET team_key = ? WHERE play_id = 'a'").bind(toTeamKey([B])).run()
    expect(await row()).toBeNull()
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM team_best').first('n')).toBe(1)
    await env.DB.prepare("UPDATE play SET score = 70, is_full_combo = 0 WHERE play_id = 'a'").run()
    expect(await env.DB.prepare('SELECT play_id, best_fc_score FROM team_best').first()).toEqual({ play_id: 'b', best_fc_score: null })
    await env.DB.prepare("UPDATE play SET song_ref_id = ?, player_count = 2 WHERE play_id = 'b'").bind(other).run()
    expect(await env.DB.prepare('SELECT song_ref_id, player_count, play_id FROM team_best ORDER BY song_ref_id').all()
      .then((r) => r.results)).toEqual([
      { song_ref_id: song, player_count: 1, play_id: 'a' },
      { song_ref_id: other, player_count: 2, play_id: 'b' },
    ])
  })

  it('adds no summary writes for an unimproved play or an unchanged update', async () => {
    // 参加者やsong_bestを含めず、同じ形のINSERT同士で追加書き込みを比較する。
    const insert = (id: string, score: number, excluded = false) => env.DB.prepare(
      'INSERT INTO play (play_id, song_ref_id, score, is_full_combo, received_at, player_count, team_key, excluded_at) VALUES (?, ?, ?, 0, ?, 1, ?, ?)',
    ).bind(id, song, score, at(0), toTeamKey([A]), excluded ? at(0) : null).run()
    const baseline = await insert('excluded', 200, true)
    const first = await insert('first', 100)
    const loser = await insert('loser', 90)
    const better = await insert('better', 110)
    expect(loser.meta.rows_written).toBe(baseline.meta.rows_written)
    console.log(JSON.stringify({ writeRows: { baseline: baseline.meta.rows_written, first: first.meta.rows_written, loser: loser.meta.rows_written, better: better.meta.rows_written } }))
    expect(first.meta.rows_written).toBeGreaterThan(loser.meta.rows_written)
    expect(better.meta.rows_written).toBeGreaterThan(loser.meta.rows_written)
    // 変化しないUPDATEでは集計表への書き込みがない（別のplay 1行だけ）。
    const unchanged = await env.DB.prepare("UPDATE play SET excluded_at = excluded_at WHERE play_id = 'better'").run()
    expect(unchanged.meta.rows_written).toBe(1)
  })

  it('is transactionally rolled back when participant insertion fails', async () => {
    await expect(insertPlay({ playId: 'bad', songRefId: song, score: 100, participants: solo('missing-player') })).rejects.toThrow()
    expect(await row()).toBeNull()
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM team_best').first('n')).toBe(0)
  })

  it('rebuilds existing histories with the migration selection rules', async () => {
    await insertPlay({ playId: 'top', songRefId: song, score: 100, participants: solo() })
    await insertPlay({ playId: 'fc', songRefId: song, score: 80, participants: solo(), isFullCombo: true })
    const before = await row()
    await env.DB.batch(TEAM_BEST_REBUILD_SQL.map((sql) => env.DB.prepare(sql)))
    expect(await row()).toEqual(before)
    const migration = env.TEST_MIGRATIONS.find((m) => m.name === '0003_team_best.sql')!
    // 空DBへのマイグレーション適用だけでなく、既存履歴のあるアップグレードも実行する。
    await env.DB.batch([
      ...['insert', 'update', 'delete'].map((event) => env.DB.prepare(`DROP TRIGGER team_best_play_${event}`)),
      env.DB.prepare('DROP TABLE team_best'),
      ...migration.queries.map((sql) => env.DB.prepare(sql)),
    ])
    expect(await row()).toEqual(before)
    await insertPlay({ playId: 'after-upgrade', songRefId: song, score: 120, participants: solo() })
    expect(await row()).toMatchObject({ play_id: 'after-upgrade', best_fc_score: 80 })
  })
})

describe('team_best read path', () => {
  it('uses history for date ranges and FC-only rankings, including their representative names', async () => {
    await insertPlay({ playId: 'old', songRefId: song, score: 100, participants: solo(A, '過去の最高'), receivedAt: at(-1) })
    await insertPlay({ playId: 'recent', songRefId: song, score: 80, participants: solo(A, '期間内'), receivedAt: at(2) })
    await insertPlay({ playId: 'fc', songRefId: song, score: 60, participants: solo(A, 'FC時点'), receivedAt: at(3), isFullCombo: true })
    const period = await ranking({ ...filter, received: { from: at(0), to: at(10) } })
    expect(period.get(1)!.entries[0]).toMatchObject({ score: 80, fullComboScore: 60, participants: [{ name: '期間内', color: 'R' }] })
    const fc = await ranking({ ...filter, fullComboOnly: true })
    expect(fc.get(1)!.entries[0]).toMatchObject({ score: 60, participants: [{ name: 'FC時点', color: 'R' }] })
  })

  it('keeps pre-migration previews working without swallowing other DB errors', async () => {
    await insertPlay({ playId: 'top', songRefId: song, score: 100, participants: solo() })
    const expected = await ranking()
    await env.DB.prepare('ALTER TABLE team_best RENAME TO team_best_unavailable').run()
    try {
      expect(await ranking()).toEqual(expected)
    } finally {
      await env.DB.prepare('ALTER TABLE team_best_unavailable RENAME TO team_best').run()
    }
    await env.DB.prepare('ALTER TABLE team_best RENAME COLUMN score TO broken_score').run()
    try {
      await expect(ranking()).rejects.toThrow()
    } finally {
      await env.DB.prepare('ALTER TABLE team_best RENAME COLUMN broken_score TO score').run()
    }
  })

  it('returns the same rankings with fewer reads for repeated plays by the same teams', async () => {
    // 10チーム×20プレイ。初期集計のsong_bestはこの測定に含めない。
    const ids = Array.from({ length: 10 }, (_, i) => `00000000-0000-4000-8000-${String(i + 10).padStart(12, '0')}`)
    await insertPlayers(...ids)
    for (let team = 0; team < ids.length; team++) {
      const statements = []
      for (let run = 0; run < 20; run++) {
        const playId = `t${team}-p${run}`
        statements.push(env.DB.prepare(
          `INSERT INTO play (play_id, song_ref_id, score, is_full_combo, received_at, host_player_id, player_count, team_key)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        ).bind(playId, song, 1000 - team - run, run % 3 === 0 ? 1 : 0, at(run), ids[team], toTeamKey([ids[team]!])))
        statements.push(env.DB.prepare(
          "INSERT INTO play_participant (play_id, player_id, name_at_play, color_at_play) VALUES (?, ?, ?, 'R')",
        ).bind(playId, ids[team], `架空${team}-${run}`))
      }
      await env.DB.batch(statements)
    }
    let reads = 0
    // 実際にランキングが使った集計クエリのmetaを測る。参加者取得は両方式で同じなので除く。
    const measured = {
      prepare: env.DB.prepare.bind(env.DB),
      batch: async (statements: D1PreparedStatement[]) => {
        const results = await env.DB.batch(statements)
        reads = results.reduce((n, r) => n + r.meta.rows_read, 0)
        return results
      },
    } as D1Database
    for (const name of [null, '架空4', '見つからない名前']) {
      for (const offset of [0, 3]) {
        const paging = { limit: 3, offset }
        const summary = await fetchRankings(measured, song, [1], { ...filter, name }, paging)
        const summaryReads = reads
        const history = await fetchRankings(measured, song, [1], {
          ...filter, name, received: { from: at(-100), to: at(100) },
        }, paging)
        expect(summary).toEqual(history)
        expect(summaryReads).toBeLessThan(reads)
        if (name === null && offset === 0) console.log(JSON.stringify({ fixture: '200 plays / 10 teams', summaryReads, historyReads: reads }))
      }
    }
  })
})
