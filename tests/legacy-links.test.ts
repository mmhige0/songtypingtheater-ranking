import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildLinkSql, parseLinks, summarizeLinks, type LegacyLink } from '../scripts/legacy-links'
import app from '../src/index'
import { toTeamKey } from '../src/lib/team-key'
import { resetDb } from './helpers'
import { at, insertPlay, insertPlayers, insertSong } from './view-helpers'

// 架空のID・名前のみ使用
const NEW_A = 'f3e1a5de-d740-43d2-bce1-cd513c9b6790'
const NEW_B = '0b5c7a4e-1f2d-4e8a-9c3b-6d7e8f9a0b1c'
const NOW = '2026-10-15T00:00:00.000Z'

describe('parseLinks', () => {
  it('accepts legacy and UUIDv4 ids and lowercases the new id', () => {
    expect(parseLinks([['legacy-00001', NEW_A.toUpperCase()]])).toEqual({
      links: [{ legacyPlayerId: 'legacy-00001', newPlayerId: NEW_A }],
      errors: [],
    })
  })

  it('reports each invalid row by line number', () => {
    const { errors } = parseLinks([
      ['legacy-00001', NEW_A],
      ['00000000-0000-4000-8000-000000000001', NEW_A],
      ['legacy-00002', 'legacy-00003'],
      ['legacy-00001', NEW_B],
      ['legacy-00004'],
    ])
    expect(errors).toEqual([
      { line: 3, reason: 'invalid-legacy-id' },
      { line: 4, reason: 'invalid-new-id' },
      { line: 5, reason: 'duplicate-legacy-id' },
      { line: 6, reason: 'missing-column' },
    ])
  })
})

describe('summarizeLinks', () => {
  it('counts new ids and those with several legacy ids', () => {
    const links: LegacyLink[] = [
      { legacyPlayerId: 'legacy-00001', newPlayerId: NEW_A },
      { legacyPlayerId: 'legacy-00002', newPlayerId: NEW_A },
      { legacyPlayerId: 'legacy-00003', newPlayerId: NEW_B },
    ]
    expect(summarizeLinks(links)).toEqual({ links: 3, newPlayers: 2, newPlayersWithSeveralLegacyIds: 1 })
  })
})

describe('buildLinkSql', () => {
  let songRefId: number

  // D1の--fileがトランザクションにならない場合に備え、1文ずつ適用する
  const apply = async (links: LegacyLink[]) => {
    for (const line of buildLinkSql(links, NOW).trim().split('\n')) await env.DB.prepare(line).run()
  }

  const participants = (playId: string) =>
    env.DB.prepare(`SELECT player_id, name_at_play FROM play_participant WHERE play_id = ? ORDER BY instr('RBYG', color_at_play)`)
      .bind(playId)
      .all()
      .then((r) => r.results)

  const play = (playId: string) =>
    env.DB.prepare('SELECT team_key, player_count FROM play WHERE play_id = ?').bind(playId).first()

  const mappings = () =>
    env.DB.prepare('SELECT legacy_player_id, new_player_id, status FROM legacy_identity_mapping ORDER BY legacy_player_id')
      .all()
      .then((r) => r.results)

  const soloRanking = async () => {
    const res = await app.request('/api/v1/songs/001/rankings?players=1', {}, env)
    return ((await res.json()) as { entries: { score: number; isLegacy: boolean }[] }).entries
  }

  beforeEach(async () => {
    await resetDb()
    songRefId = await insertSong('001', '架空の曲')
    await insertPlayers('legacy-00001', 'legacy-00002', 'legacy-00003', NEW_A, NEW_B)
    const legacy = (playId: string, score: number, ids: string[], names: string[]) =>
      insertPlay({
        playId,
        songRefId,
        score,
        isFullCombo: null,
        hostPlayerId: null,
        participants: ids.map((id, i) => ({ id, name: names[i]!, color: (['R', 'B', 'Y', 'G'] as const)[i]! })),
      })
    await legacy('legacy-solo', 100, ['legacy-00001'], ['アリス'])
    await legacy('legacy-duo', 90, ['legacy-00001', 'legacy-00002'], ['アリス', 'ボブ'])
    await legacy('legacy-other', 70, ['legacy-00003'], ['キャロル'])
    await insertPlay({
      playId: 'new-solo',
      songRefId,
      score: 80,
      receivedAt: at(60),
      participants: [{ id: NEW_A, name: 'アリス2', color: 'R' }],
    })
  })

  it('moves legacy participants to the new id and rebuilds team keys and the ranking', async () => {
    expect(await soloRanking()).toHaveLength(3)

    await apply([{ legacyPlayerId: 'legacy-00001', newPlayerId: NEW_A }])

    // 時点名は変えない
    expect(await participants('legacy-duo')).toEqual([
      { player_id: NEW_A, name_at_play: 'アリス' },
      { player_id: 'legacy-00002', name_at_play: 'ボブ' },
    ])
    expect(await play('legacy-solo')).toEqual({ team_key: toTeamKey([NEW_A]), player_count: 1 })
    expect(await play('legacy-duo')).toEqual({ team_key: toTeamKey([NEW_A, 'legacy-00002']), player_count: 2 })
    expect(await play('legacy-other')).toEqual({ team_key: toTeamKey(['legacy-00003']), player_count: 1 })
    expect(await play('new-solo')).toEqual({ team_key: toTeamKey([NEW_A]), player_count: 1 })
    expect(await mappings()).toEqual([{ legacy_player_id: 'legacy-00001', new_player_id: NEW_A, status: 'confirmed' }])

    // 旧記録と新記録が同じチームになり、代表記録だけが残る
    expect(await soloRanking()).toEqual([
      expect.objectContaining({ score: 100, isLegacy: true }),
      expect.objectContaining({ score: 70, isLegacy: true }),
    ])
    const best = await env.DB.prepare('SELECT score, tied_others FROM song_best WHERE player_count = 1').first()
    expect(best).toEqual({ score: 100, tied_others: 0 })
  })

  it('links several legacy ids to one new id when they never share a play', async () => {
    await apply([
      { legacyPlayerId: 'legacy-00001', newPlayerId: NEW_A },
      { legacyPlayerId: 'legacy-00003', newPlayerId: NEW_A },
    ])
    expect(await play('legacy-other')).toEqual({ team_key: toTeamKey([NEW_A]), player_count: 1 })
    expect(await soloRanking()).toEqual([expect.objectContaining({ score: 100 })])
  })

  it('gives the same result when applied again', async () => {
    const links = [{ legacyPlayerId: 'legacy-00001', newPlayerId: NEW_A }]
    await apply(links)
    const snapshot = [await participants('legacy-duo'), await play('legacy-duo'), await mappings()]
    await apply(links)
    expect([await participants('legacy-duo'), await play('legacy-duo'), await mappings()]).toEqual(snapshot)
  })

  it('refuses a legacy id already linked to another new id', async () => {
    await apply([{ legacyPlayerId: 'legacy-00001', newPlayerId: NEW_A }])
    await expect(apply([{ legacyPlayerId: 'legacy-00001', newPlayerId: NEW_B }])).rejects.toThrow()
    expect(await mappings()).toEqual([{ legacy_player_id: 'legacy-00001', new_player_id: NEW_A, status: 'confirmed' }])
    expect(await play('legacy-solo')).toEqual({ team_key: toTeamKey([NEW_A]), player_count: 1 })
  })

  it('refuses to merge two legacy ids of the same play into one new id', async () => {
    await expect(
      apply([
        { legacyPlayerId: 'legacy-00001', newPlayerId: NEW_A },
        { legacyPlayerId: 'legacy-00002', newPlayerId: NEW_A },
      ]),
    ).rejects.toThrow()
    expect(await participants('legacy-duo')).toEqual([
      { player_id: 'legacy-00001', name_at_play: 'アリス' },
      { player_id: 'legacy-00002', name_at_play: 'ボブ' },
    ])
    expect(await mappings()).toEqual([])
  })

  it('refuses unknown ids and recovers when applied again without them', async () => {
    await expect(
      apply([{ legacyPlayerId: 'legacy-00001', newPlayerId: '11111111-1111-4111-8111-111111111111' }]),
    ).rejects.toThrow()
    expect(await participants('legacy-solo')).toEqual([{ player_id: 'legacy-00001', name_at_play: 'アリス' }])

    // 存在しない旧IDで対応の登録だけが失敗した状態から、その行を除いて流し直す
    await expect(
      apply([
        { legacyPlayerId: 'legacy-00001', newPlayerId: NEW_A },
        { legacyPlayerId: 'legacy-09999', newPlayerId: NEW_B },
      ]),
    ).rejects.toThrow()
    await apply([{ legacyPlayerId: 'legacy-00001', newPlayerId: NEW_A }])
    expect(await play('legacy-duo')).toEqual({ team_key: toTeamKey([NEW_A, 'legacy-00002']), player_count: 2 })
    expect(await mappings()).toEqual([{ legacy_player_id: 'legacy-00001', new_player_id: NEW_A, status: 'confirmed' }])
    expect(await soloRanking()).toHaveLength(2)
  })
})
