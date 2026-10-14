import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  assignLegacyPlayers,
  buildSqlParts,
  parseWorkbook,
  selectBestRecords,
  summarize,
  type Cell,
  type LegacyRecord,
  type Sheet,
} from '../scripts/legacy-scores'
import app from '../src/index'
import { resetDb } from './helpers'
import { insertSong } from './view-helpers'

// 架空の曲・名前・スコアのみ使用

// 実際のタブと同じく、曲名の見出し（結合セル）・案内・列見出しの順に並ぶ
const LABELS: Cell[] = [
  null,
  '順位',
  '1人スコア',
  'プレイヤー1',
  '2人スコア',
  'プレイヤー1',
  'プレイヤー2',
  '3人スコア',
  'プレイヤー1',
  'プレイヤー2',
  'プレイヤー3',
  '4人スコア',
  'プレイヤー1',
  'プレイヤー2',
  'プレイヤー3',
  'プレイヤー4',
]

type Blocks = { one?: Cell[]; two?: Cell[]; three?: Cell[]; four?: Cell[] }
const row = (rank: number, { one = [], two = [], three = [], four = [] }: Blocks): Cell[] => {
  const pad = (cells: Cell[], length: number) => Array.from({ length }, (_, i) => cells[i] ?? null)
  return [null, rank, ...pad(one, 2), ...pad(two, 3), ...pad(three, 4), ...pad(four, 5)]
}

const title = (gameSongId: string): Cell[] => Array.from({ length: 16 }, (_, i) => (i === 0 ? null : `【${gameSongId}】架空の曲`))

const songSheet = (gameSongId: string, rows: Cell[][]): Sheet => ({
  name: gameSongId,
  rows: [title(gameSongId), [...title(gameSongId), null, gameSongId], [...Array<Cell>(16).fill(null), '最高スコアに戻る'], LABELS, ...rows],
})

const record = (gameSongId: string, players: number, score: number, names: string[]): LegacyRecord => ({
  gameSongId,
  players,
  score,
  names,
})

const sequentialIds = () => {
  let n = 0
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
}

describe('parseWorkbook', () => {
  it('expands each player-count block of each row into records in tab, row and block order', () => {
    const result = parseWorkbook([
      { name: '最高スコア一覧', rows: [[null, '曲番']] },
      songSheet('001', [
        row(1, { one: [900, 'アリス'], two: [800, 'アリス', 'ボブ'], four: [700, 'アリス', 'ボブ', 'キャロル', 'デイブ'] }),
        row(2, { one: ['850', 'ボブ'], three: [600, 'ボブ', 'キャロル', 'デイブ'] }),
      ]),
      songSheet('002', [row(1, { one: [0, 1234] })]),
    ])
    expect(result.ignoredTabs).toEqual(['最高スコア一覧'])
    expect(result.heldTabs).toEqual([])
    expect(result.skipped).toEqual([])
    expect(result.records).toEqual([
      record('001', 1, 900, ['アリス']),
      record('001', 2, 800, ['アリス', 'ボブ']),
      record('001', 4, 700, ['アリス', 'ボブ', 'キャロル', 'デイブ']),
      record('001', 1, 850, ['ボブ']),
      record('001', 3, 600, ['ボブ', 'キャロル', 'デイブ']),
      record('002', 1, 0, ['1234']),
    ])
  })

  it('keeps names exactly as written, including surrounding spaces', () => {
    const result = parseWorkbook([songSheet('001', [row(1, { one: [100, ' アリス '] })])])
    expect(result.records).toEqual([record('001', 1, 100, [' アリス '])])
  })

  it('keeps whitespace-only names as names, as the API accepts them', () => {
    const result = parseWorkbook([songSheet('001', [row(1, { one: [100, ' '], two: [90, 'アリス', '　'] })])])
    expect(result.skipped).toEqual([])
    expect(result.records).toEqual([record('001', 1, 100, [' ']), record('001', 2, 90, ['アリス', '　'])])
  })

  it('skips incomplete or invalid entries with their location but without names', () => {
    const result = parseWorkbook([
      songSheet('001', [
        row(2, { one: [100, null], two: [null, 'アリス', 'ボブ'] }),
        row(3, { one: ['abc', 'アリス'], two: [-1, 'アリス', 'ボブ'], three: [{ error: '#REF!' }, 'アリス', 'ボブ', 'キャロル'] }),
        row(4, {}),
      ]),
    ])
    expect(result.records).toEqual([])
    expect(result.skipped).toEqual([
      { gameSongId: '001', players: 1, rank: '2', reason: 'missing-name' },
      { gameSongId: '001', players: 2, rank: '2', reason: 'missing-score' },
      { gameSongId: '001', players: 1, rank: '3', reason: 'invalid-score' },
      { gameSongId: '001', players: 2, rank: '3', reason: 'invalid-score' },
      { gameSongId: '001', players: 3, rank: '3', reason: 'error-value' },
    ])
  })

  it('holds tabs whose heading does not match the tab name or the expected columns', () => {
    const data = row(1, { one: [100, 'アリス'] })
    const shifted = LABELS.map((c, i) => (i === 4 ? 'スコア' : c))
    const result = parseWorkbook([
      { name: '001', rows: [title('010'), LABELS, data] },
      { name: '002', rows: [[null, '架空の曲'], LABELS, data] },
      { name: '003', rows: [title('003'), shifted, data] },
      { name: '004', rows: [title('004'), data] },
    ])
    expect(result.records).toEqual([])
    expect(result.heldTabs.map((h) => h.tab)).toEqual(['001', '002', '003', '004'])
  })
})

describe('selectBestRecords', () => {
  it('keeps the best score per song, player count and name multiset regardless of order', () => {
    const best = selectBestRecords([
      record('001', 2, 100, ['アリス', 'ボブ']),
      record('001', 2, 120, ['ボブ', 'アリス']),
      record('001', 2, 90, ['アリス', 'アリス']),
      record('001', 2, 95, ['アリス', 'アリス']),
      record('002', 2, 80, ['アリス', 'ボブ']),
    ])
    expect(best).toEqual([
      record('001', 2, 120, ['ボブ', 'アリス']),
      record('001', 2, 95, ['アリス', 'アリス']),
      record('002', 2, 80, ['アリス', 'ボブ']),
    ])
  })

  it('keeps the first record on a tie', () => {
    const best = selectBestRecords([record('001', 2, 100, ['アリス', 'ボブ']), record('001', 2, 100, ['ボブ', 'アリス'])])
    expect(best).toEqual([record('001', 2, 100, ['アリス', 'ボブ'])])
  })

  it('does not merge names that differ only in case, spaces or a delimiter', () => {
    const best = selectBestRecords([
      record('001', 1, 100, ['alice']),
      record('001', 1, 100, ['Alice']),
      record('001', 1, 100, ['Alice ']),
      record('001', 2, 100, ['a,b', 'c']),
      record('001', 2, 100, ['a', 'b,c']),
    ])
    expect(best).toHaveLength(5)
  })
})

describe('assignLegacyPlayers', () => {
  it('treats each exact whitespace-only name as its own player', () => {
    const { plays, playerIds } = assignLegacyPlayers(
      [record('001', 2, 100, ['アリス', ' ']), record('001', 2, 90, ['ボブ', '  ']), record('002', 1, 80, [' '])],
      sequentialIds(),
    )
    expect(playerIds).toEqual(['legacy-00001', 'legacy-00002', 'legacy-00003', 'legacy-00004'])
    expect(plays.map((p) => p.participants.map((x) => x.playerId))).toEqual([
      ['legacy-00001', 'legacy-00002'],
      ['legacy-00003', 'legacy-00004'],
      ['legacy-00002'],
    ])
  })

  it('reuses one id per exact name and gives repeated names in a team separate ids', () => {
    const { plays, playerIds } = assignLegacyPlayers(
      [record('001', 2, 100, ['アリス', 'ボブ']), record('001', 3, 90, ['アリス', 'アリス', 'ボブ'])],
      sequentialIds(),
    )
    expect(playerIds).toEqual(['legacy-00001', 'legacy-00002', 'legacy-00003'])
    expect(plays.map((p) => p.participants)).toEqual([
      [
        { playerId: 'legacy-00001', name: 'アリス', color: 'R' },
        { playerId: 'legacy-00002', name: 'ボブ', color: 'B' },
      ],
      [
        { playerId: 'legacy-00001', name: 'アリス', color: 'R' },
        { playerId: 'legacy-00003', name: 'アリス', color: 'B' },
        { playerId: 'legacy-00002', name: 'ボブ', color: 'Y' },
      ],
    ])
  })
})

describe('buildSqlParts', () => {
  const RECEIVED_AT = '2026-10-11T00:00:00.000Z'

  const apply = (sql: string) =>
    env.DB.batch(
      sql
        .trim()
        .split('\n')
        .map((line) => env.DB.prepare(line)),
    )

  const migrate = async (records: LegacyRecord[]) => {
    const { plays, playerIds } = assignLegacyPlayers(selectBestRecords(records), sequentialIds())
    for (const part of buildSqlParts(plays, playerIds, RECEIVED_AT)) await apply(part.sql)
  }

  const countRows = () =>
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM play) AS plays, (SELECT COUNT(*) FROM play_participant) AS participants,
         (SELECT COUNT(*) FROM player) AS players`,
    ).first()

  beforeEach(async () => {
    await resetDb()
    await insertSong('001', '架空の曲')
  })

  it('stores legacy plays that the ranking shows with unknown full combo', async () => {
    await migrate([
      record('001', 2, 100, ['ボブ', 'アリス']),
      record('001', 2, 120, ['アリス', 'ボブ']),
      record('001', 2, 110, ["キャロル's", 'ア\nリス']),
    ])

    const res = await app.request('/api/v1/songs/001/rankings?players=2', {}, env)
    const json = (await res.json()) as { entries: Record<string, unknown>[] }
    expect(json.entries).toEqual([
      expect.objectContaining({
        rank: 1,
        score: 120,
        isFullCombo: null,
        isLegacy: true,
        receivedAt: RECEIVED_AT,
        participants: [
          { name: 'アリス', color: 'R' },
          { name: 'ボブ', color: 'B' },
        ],
      }),
      expect.objectContaining({
        rank: 2,
        score: 110,
        participants: [
          { name: "キャロル's", color: 'R' },
          { name: 'ア\nリス', color: 'B' },
        ],
      }),
    ])

    // 曲一覧が読む1位（song_best）も作り直される
    const songs = (await (await app.request('/api/v1/songs', {}, env)).json()) as {
      songs: { bestScores: Record<string, unknown> }[]
    }
    expect(songs.songs[0]!.bestScores['2']).toMatchObject({ score: 120, isFullCombo: null, tiedOthers: 0 })

    const play = await env.DB.prepare(
      "SELECT team_key, player_count, host_player_id, is_taipen, game_version FROM play WHERE score = 120",
    ).first()
    expect(play).toEqual({
      team_key: '["legacy-00001","legacy-00002"]',
      player_count: 2,
      host_player_id: null,
      is_taipen: null,
      game_version: null,
    })
    const player = await env.DB.prepare("SELECT token_hash FROM player WHERE player_id = 'legacy-00001'").first()
    expect(player).toEqual({ token_hash: null })
  })

  it('replaces previous legacy data on re-import and keeps non-legacy plays', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO player (player_id, token_hash, created_at) VALUES ('428d19c3-786c-4650-81c1-06848583d7fa', 'h', ?)").bind(RECEIVED_AT),
      env.DB.prepare(
        `INSERT INTO play (play_id, song_ref_id, score, received_at, host_player_id, player_count, team_key)
         SELECT 'new-play', id, 50, ?, '428d19c3-786c-4650-81c1-06848583d7fa', 1, '["428d19c3-786c-4650-81c1-06848583d7fa"]' FROM song`,
      ).bind(RECEIVED_AT),
    ])
    const records = [record('001', 1, 100, ['アリス']), record('001', 2, 90, ['アリス', 'ボブ'])]
    await migrate(records)
    await migrate(records)

    expect(await countRows()).toEqual({ plays: 3, participants: 3, players: 3 })
  })

  it('refuses to re-import once a legacy id is mapped to a new id', async () => {
    await migrate([record('001', 1, 100, ['アリス'])])
    const NEW_ID = '428d19c3-786c-4650-81c1-06848583d7fa'
    await env.DB.batch([
      env.DB.prepare("INSERT INTO player (player_id, token_hash, created_at) VALUES (?, 'h', ?)").bind(NEW_ID, RECEIVED_AT),
      env.DB.prepare(
        "INSERT INTO legacy_identity_mapping VALUES ('legacy-00001', ?, 'confirmed', ?, ?)",
      ).bind(NEW_ID, RECEIVED_AT, RECEIVED_AT),
    ])
    await expect(migrate([record('001', 1, 200, ['アリス'])])).rejects.toThrow()
    const play = await env.DB.prepare('SELECT score FROM play').first()
    expect(play).toEqual({ score: 100 })
  })

  it('splits inserts into statements of at most 100 rows', () => {
    const records = Array.from({ length: 250 }, (_, i) => record('001', 1, i, [`架空${i}`]))
    const { plays, playerIds } = assignLegacyPlayers(records, sequentialIds())
    const parts = buildSqlParts(plays, playerIds, RECEIVED_AT)
    expect(parts).toHaveLength(1)
    const lines = parts[0]!.sql.trim().split('\n')
    expect(lines.filter((l) => l.startsWith('INSERT INTO player '))).toHaveLength(3)
    expect(lines.filter((l) => l.startsWith('INSERT INTO play '))).toHaveLength(3)
    expect(lines.filter((l) => l.startsWith('INSERT INTO play_participant '))).toHaveLength(3)
  })

  describe('split into files within the daily write limit', () => {
    // 成績4行＋参加者4行×人数、移行用プレイヤー3行で見積もる
    const MAX_WRITES = 200
    // 10人から作る重複のない2人組40件（移行用プレイヤー10人で30行、成績は1件12行で計510行）
    const records = Array.from({ length: 10 }, (_, a) => Array.from({ length: 10 - a - 1 }, (_, b) => [a, a + b + 1]))
      .flat()
      .slice(0, 40)
      .map(([a, b], i) => record('001', 2, i, [`架空${a}`, `架空${b}`]))
    const build = () => {
      const { plays, playerIds } = assignLegacyPlayers(selectBestRecords(records), sequentialIds())
      return { plays, playerIds, parts: buildSqlParts(plays, playerIds, RECEIVED_AT, MAX_WRITES) }
    }

    it('keeps each play with its participants and every file under the limit', () => {
      const { plays, playerIds, parts } = build()
      expect(parts.length).toBeGreaterThan(1)
      for (const part of parts) expect(part.estimatedWrites).toBeLessThanOrEqual(MAX_WRITES)
      expect(parts.reduce((n, p) => n + p.plays, 0)).toBe(plays.length)
      expect(parts.map((p) => p.players)).toEqual([playerIds.length, ...Array<number>(parts.length - 1).fill(0)])
      for (const play of plays) {
        const containing = parts.filter((part) => part.sql.includes(`('${play.playId}', `))
        expect(containing).toHaveLength(1)
        const inserts = containing[0]!.sql.split('\n').filter((l) => l.startsWith('INSERT INTO play_participant '))
        expect(inserts.filter((l) => l.includes(`('${play.playId}', `))).toHaveLength(1)
      }
    })

    it('deletes all legacy data and inserts players only in the first file', () => {
      const { parts } = build()
      expect(parts[0]!.sql).toContain('DELETE FROM play WHERE host_player_id IS NULL;')
      expect(parts[0]!.sql).toContain('INSERT INTO player ')
      for (const part of parts.slice(1)) {
        expect(part.sql).not.toContain('DELETE FROM play WHERE host_player_id IS NULL;')
        expect(part.sql).not.toContain('INSERT INTO player ')
      }
    })

    it('imports all files in order and lets a later file be applied again', async () => {
      const { plays, playerIds, parts } = build()
      const expected = {
        plays: plays.length,
        participants: plays.reduce((n, p) => n + p.participants.length, 0),
        players: playerIds.length,
      }
      for (const part of parts) await apply(part.sql)
      expect(await countRows()).toEqual(expected)

      await apply(parts.at(-1)!.sql)
      expect(await countRows()).toEqual(expected)
      // 1つ目からやり直すと全削除して入れ直すため、2つ目以降を流すまでは1つ目の成績だけになる
      await apply(parts[0]!.sql)
      expect(await countRows()).toMatchObject({ plays: parts[0]!.plays })
    })
  })

  it('fails when the song is not registered in the database', async () => {
    await expect(migrate([record('999', 1, 100, ['アリス'])])).rejects.toThrow()
  })
})

describe('summarize', () => {
  it('counts plays, participants and players per song and player count without names', () => {
    const { plays, playerIds } = assignLegacyPlayers(
      [record('001', 1, 100, ['アリス']), record('001', 1, 120, ['ボブ']), record('001', 2, 90, ['アリス', 'ボブ'])],
      sequentialIds(),
    )
    expect(summarize(plays, playerIds)).toEqual({
      plays: 3,
      participants: 4,
      players: 2,
      bySongAndPlayers: [
        { gameSongId: '001', players: 1, count: 2, maxScore: 120 },
        { gameSongId: '001', players: 2, count: 1, maxScore: 90 },
      ],
    })
  })
})
