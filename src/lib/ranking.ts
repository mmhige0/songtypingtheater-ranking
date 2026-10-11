import { PLAYER_COLORS } from '../db/schema'
import { PLAYER_COUNTS, type PlayerCount } from './view-query'

type PlayerColor = (typeof PLAYER_COLORS)[number]

export type Participant = { name: string; color: PlayerColor }

export type RankingEntry = {
  rank: number
  score: number
  // nullは不明（移行分）
  isFullCombo: boolean | null
  receivedAt: string
  isLegacy: boolean
  participants: Participant[]
}

export type RankingPage = { entries: RankingEntry[]; total: number }

export type RankingFilter = { fullComboOnly: boolean; name: string | null }

// ?1 曲の内部ID、?2 人数、?3 FC記録だけなら1、?4 名前検索（nullなら検索しない）。
// 1. FC絞り込み → 2. teamKeyごとに代表記録を1件選ぶ（得点 → FC → 受付日時 → playId）→
// 3. 代表記録の得点だけで競技順位を付ける → 4. 代表記録の時点名で検索する。
// 検索は順位付けの後なので順位は変わらず、代表記録以外（次点）の名前では一致しない
const MATCHED_CTE = `
WITH representative AS (
  SELECT play_id, score, is_full_combo, received_at, host_player_id,
    ROW_NUMBER() OVER (
      PARTITION BY team_key
      ORDER BY score DESC, is_full_combo IS 1 DESC, received_at, play_id
    ) AS team_order
  FROM play
  WHERE song_ref_id = ?1 AND player_count = ?2 AND excluded_at IS NULL AND (?3 = 0 OR is_full_combo = 1)
),
ranked AS (
  SELECT play_id, score, is_full_combo, received_at, host_player_id, RANK() OVER (ORDER BY score DESC) AS rank
  FROM representative
  WHERE team_order = 1
),
matched AS (
  SELECT * FROM ranked
  WHERE ?4 IS NULL OR EXISTS (
    SELECT 1 FROM play_participant AS pp
    WHERE pp.play_id = ranked.play_id AND instr(lower(pp.name_at_play), lower(?4)) > 0
  )
)`

type EntryRow = {
  play_id: string
  score: number
  is_full_combo: number | null
  received_at: string
  host_player_id: string | null
  rank: number
}

const COLOR_ORDER = new Map<string, number>(PLAYER_COLORS.map((color, i) => [color, i]))

// 参加者を色のR→B→Y→G順で返す。playIdsは1文のパラメーター上限（100）以内で渡す
const fetchParticipants = async (db: D1Database, playIds: string[]) => {
  const byPlay = new Map<string, Participant[]>()
  if (playIds.length === 0) return byPlay
  const { results } = await db
    .prepare(
      `SELECT play_id, name_at_play, color_at_play FROM play_participant WHERE play_id IN (${playIds.map(() => '?').join(', ')})`,
    )
    .bind(...playIds)
    .all<{ play_id: string; name_at_play: string; color_at_play: PlayerColor }>()
  for (const row of results) {
    const list = byPlay.get(row.play_id) ?? []
    list.push({ name: row.name_at_play, color: row.color_at_play })
    byPlay.set(row.play_id, list)
  }
  for (const list of byPlay.values()) list.sort((a, b) => COLOR_ORDER.get(a.color)! - COLOR_ORDER.get(b.color)!)
  return byPlay
}

// SQLiteのTEXTの既定の並び順（バイナリ比較）と同じ順にする
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const toBoolean = (value: number | null) => (value === null ? null : value === 1)

// 指定した人数ごとのランキングを1ページずつ取得する。limit×人数は100以内にする
export const fetchRankings = async (
  db: D1Database,
  songRefId: number,
  playerCounts: readonly PlayerCount[],
  filter: RankingFilter,
  { limit, offset }: { limit: number; offset: number },
): Promise<Map<PlayerCount, RankingPage>> => {
  const params = (count: PlayerCount) => [songRefId, count, filter.fullComboOnly ? 1 : 0, filter.name] as const
  const results = await db.batch<unknown>(
    playerCounts.flatMap((count) => [
      db
        .prepare(`${MATCHED_CTE} SELECT * FROM matched ORDER BY score DESC, received_at, play_id LIMIT ?5 OFFSET ?6`)
        .bind(...params(count), limit, offset),
      db.prepare(`${MATCHED_CTE} SELECT COUNT(*) AS total FROM matched`).bind(...params(count)),
    ]),
  )

  const pages = playerCounts.map((count, i) => ({
    count,
    rows: results[i * 2]!.results as EntryRow[],
    total: (results[i * 2 + 1]!.results[0] as { total: number }).total,
  }))
  const participants = await fetchParticipants(
    db,
    pages.flatMap((page) => page.rows.map((row) => row.play_id)),
  )

  return new Map(
    pages.map(({ count, rows, total }) => [
      count,
      {
        total,
        entries: rows.map((row) => ({
          rank: row.rank,
          score: row.score,
          isFullCombo: toBoolean(row.is_full_combo),
          receivedAt: row.received_at,
          isLegacy: row.host_player_id === null,
          participants: participants.get(row.play_id) ?? [],
        })),
      },
    ]),
  )
}

export type BestScore = { score: number }
// ソロの1位。同点の1位が複数いる場合は表示順（受付日時 → playId）で先頭の名前と、残りの人数
export type SoloBestScore = BestScore & { name: string; tiedOthers: number }
export type BestScores = { '1': SoloBestScore | null; '2': BestScore | null; '3': BestScore | null; '4': BestScore | null }

type SoloTopRow = {
  song_ref_id: number
  team_key: string
  play_id: string
  is_full_combo: number | null
  received_at: string
  name_at_play: string
}

// 曲ごと・人数ごとの最高スコア（＝ランキング1位の得点）。songRefIdsは100件以内
export const fetchBestScores = async (db: D1Database, songRefIds: number[]): Promise<Map<number, BestScores>> => {
  const bestBySong = new Map<number, BestScores>(
    songRefIds.map((id) => [id, { '1': null, '2': null, '3': null, '4': null }]),
  )
  if (songRefIds.length === 0) return bestBySong

  const placeholders = songRefIds.map(() => '?').join(', ')
  const [maxResult, soloResult] = await db.batch<unknown>([
    db
      .prepare(
        `SELECT song_ref_id, player_count, MAX(score) AS score FROM play
         WHERE song_ref_id IN (${placeholders}) AND excluded_at IS NULL
         GROUP BY song_ref_id, player_count`,
      )
      .bind(...songRefIds),
    db
      .prepare(
        `SELECT p.song_ref_id, p.team_key, p.play_id, p.is_full_combo, p.received_at, pp.name_at_play
         FROM play AS p JOIN play_participant AS pp ON pp.play_id = p.play_id
         WHERE p.song_ref_id IN (${placeholders}) AND p.player_count = 1 AND p.excluded_at IS NULL
           AND p.score = (
             SELECT MAX(score) FROM play AS q
             WHERE q.song_ref_id = p.song_ref_id AND q.player_count = 1 AND q.excluded_at IS NULL
           )`,
      )
      .bind(...songRefIds),
  ])

  const maxRows = maxResult!.results as { song_ref_id: number; player_count: number; score: number }[]
  for (const row of maxRows) {
    const best = bestBySong.get(row.song_ref_id)
    if (!best || row.player_count === 1 || !PLAYER_COUNTS.includes(row.player_count as PlayerCount)) continue
    best[String(row.player_count) as '2' | '3' | '4'] = { score: row.score }
  }

  // 1位の得点の記録から、ランキングと同じ規則でプレイヤーごとの代表記録を選ぶ（得点は同じなのでFC → 受付日時 → playId）
  const soloRows = [...(soloResult!.results as SoloTopRow[])].sort(
    (a, b) =>
      Number(b.is_full_combo === 1) - Number(a.is_full_combo === 1) ||
      compareText(a.received_at, b.received_at) ||
      compareText(a.play_id, b.play_id),
  )
  const soloRepresentatives = new Map<number, Map<string, SoloTopRow>>()
  for (const row of soloRows) {
    const teams = soloRepresentatives.get(row.song_ref_id) ?? new Map<string, SoloTopRow>()
    if (!teams.has(row.team_key)) teams.set(row.team_key, row)
    soloRepresentatives.set(row.song_ref_id, teams)
  }
  const soloScores = new Map(maxRows.filter((row) => row.player_count === 1).map((row) => [row.song_ref_id, row.score]))
  for (const [songRefId, teams] of soloRepresentatives) {
    // ランキングの表示順（受付日時 → playId）で先頭の代表記録
    const [first] = [...teams.values()].sort(
      (a, b) => compareText(a.received_at, b.received_at) || compareText(a.play_id, b.play_id),
    )
    const best = bestBySong.get(songRefId)
    const score = soloScores.get(songRefId)
    if (!first || !best || score === undefined) continue
    best['1'] = { score, name: first.name_at_play, tiedOthers: teams.size - 1 }
  }
  return bestBySong
}
