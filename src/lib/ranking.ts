import { PLAYER_COLORS } from '../db/schema'
import { PLAYER_COUNTS, type PlayerCount } from './view-query'

type PlayerColor = (typeof PLAYER_COLORS)[number]

export type Participant = { name: string; color: PlayerColor }

export type RankingEntry = {
  rank: number
  score: number
  // nullは不明（移行分）
  isFullCombo: boolean | null
  // 代表記録がFCでないとき、同じチームのFC記録の最高得点（FC記録がなければnull）。代表記録がFCならnull
  fullComboScore: number | null
  receivedAt: string
  isLegacy: boolean
  participants: Participant[]
}

export type RankingPage = { entries: RankingEntry[]; hasNext: boolean }

// 人数の範囲（minとmaxを含む）。範囲内の人数の記録をまとめて1つのランキングにする
export type PlayerCountRange = { min: PlayerCount; max: PlayerCount }

// receivedは受付日時の範囲（fromを含みtoを含まない）。指定すると移行分も除く（受付日時がインポート時刻のため）
export type RankingFilter = {
  fullComboOnly: boolean
  name: string | null
  received?: { from: string; to: string }
}

// ?1 曲の内部ID、?2・?3 人数の範囲、?4 FC記録だけなら1、?5 名前検索（nullなら検索しない）、
// ?6・?7 受付日時の範囲（nullなら絞り込まない）。
// 1. FC絞り込み → 2. teamKeyごとに代表記録を1件選ぶ（得点 → FC → 受付日時 → playId）→
// 3. 代表記録の得点だけで競技順位を付ける → 4. 代表記録の時点名で検索する。
// 検索は順位付けの後なので順位は変わらず、代表記録以外（次点）の名前では一致しない。
// best_fc_scoreは絞り込み後のチームの記録のうちFC記録の最高得点（受付日時の範囲もかかる）
// 人数が固定なら等価条件を使い、既存インデックスを利用しやすくする。
// ?3は範囲指定で使うため、人数固定でもバインド位置は維持する。
const matchedCte = ({ min, max }: PlayerCountRange) => `
WITH representative AS (
  SELECT play_id, score, is_full_combo, received_at, host_player_id,
    ROW_NUMBER() OVER (
      PARTITION BY team_key
      ORDER BY score DESC, is_full_combo IS 1 DESC, received_at, play_id
    ) AS team_order,
    MAX(CASE WHEN is_full_combo = 1 THEN score END) OVER (PARTITION BY team_key) AS best_fc_score
  FROM play
  WHERE song_ref_id = ?1 AND ${min === max ? 'player_count = ?2' : 'player_count BETWEEN ?2 AND ?3'} AND excluded_at IS NULL AND (?4 = 0 OR is_full_combo = 1)
    AND (?6 IS NULL OR (received_at >= ?6 AND received_at < ?7 AND host_player_id IS NOT NULL))
),
ranked AS (
  SELECT play_id, score, is_full_combo, received_at, host_player_id, best_fc_score,
    RANK() OVER (ORDER BY score DESC) AS rank
  FROM representative
  WHERE team_order = 1
),
matched AS (
  SELECT * FROM ranked
  WHERE ?5 IS NULL OR EXISTS (
    SELECT 1 FROM play_participant AS pp
    WHERE pp.play_id = ranked.play_id AND instr(lower(pp.name_at_play), lower(?5)) > 0
  )
)`

type EntryRow = {
  play_id: string
  score: number
  is_full_combo: number | null
  received_at: string
  host_player_id: string | null
  best_fc_score: number | null
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

const toBoolean = (value: number | null) => (value === null ? null : value === 1)

// 指定した人数の範囲ごとのランキングを1ページずつ取得する。limit×範囲の数は100以内にする
export const fetchGroupRankings = async (
  db: D1Database,
  songRefId: number,
  ranges: readonly PlayerCountRange[],
  filter: RankingFilter,
  { limit, offset }: { limit: number; offset: number },
): Promise<RankingPage[]> => {
  const params = ({ min, max }: PlayerCountRange) =>
    [
      songRefId,
      min,
      max,
      filter.fullComboOnly ? 1 : 0,
      filter.name,
      filter.received?.from ?? null,
      filter.received?.to ?? null,
    ] as const
  const results = await db.batch<unknown>(
    ranges.map((range) =>
      db
        .prepare(`${matchedCte(range)} SELECT * FROM matched ORDER BY score DESC, received_at, play_id LIMIT ?8 OFFSET ?9`)
        .bind(...params(range), limit + 1, offset),
    ),
  )

  // 1件先読みで次ページの有無を判定し、総件数の再集計を避ける。
  // 先読み分の参加者は取得せず、参加者クエリのパラメーター上限を守る。
  const pages = results.map((result) => ({
    rows: (result.results as EntryRow[]).slice(0, limit),
    hasNext: result.results.length > limit,
  }))
  const participants = await fetchParticipants(
    db,
    pages.flatMap((page) => page.rows.map((row) => row.play_id)),
  )

  return pages.map(({ rows, hasNext }) => ({
    hasNext,
    entries: rows.map((row) => ({
      rank: row.rank,
      score: row.score,
      isFullCombo: toBoolean(row.is_full_combo),
      fullComboScore: row.is_full_combo === 1 ? null : row.best_fc_score,
      receivedAt: row.received_at,
      isLegacy: row.host_player_id === null,
      participants: participants.get(row.play_id) ?? [],
    })),
  }))
}

// 指定した人数ごとのランキングを1ページずつ取得する。limit×人数は100以内にする
export const fetchRankings = async (
  db: D1Database,
  songRefId: number,
  playerCounts: readonly PlayerCount[],
  filter: RankingFilter,
  paging: { limit: number; offset: number },
): Promise<Map<PlayerCount, RankingPage>> => {
  const pages = await fetchGroupRankings(
    db,
    songRefId,
    playerCounts.map((count) => ({ min: count, max: count })),
    filter,
    paging,
  )
  return new Map(playerCounts.map((count, i) => [count, pages[i]!]))
}

// 人数ごとの1位。同点の1位が複数組いる場合は表示順（受付日時 → playId）で先頭の組と、残りの組数。
// hasFullComboは1位に限らず、その人数の記録に1件でもFCがあるか
export type BestScore = {
  score: number
  isFullCombo: boolean | null
  hasFullCombo: boolean
  participants: Participant[]
  tiedOthers: number
}
// ソロの1位は名前も単独で返す（participantsの1人目と同じ）
export type SoloBestScore = BestScore & { name: string }
export type BestScores = { '1': SoloBestScore | null; '2': BestScore | null; '3': BestScore | null; '4': BestScore | null }

type BestRow = {
  song_ref_id: number
  player_count: number
  score: number
  is_full_combo: number | null
  has_full_combo: number
  tied_others: number
  participants: string
}

// 曲ごと・人数ごとのランキング1位。集計済みのsong_best（src/lib/song-best.ts）を読む。songRefIdsは100件以内
export const fetchBestScores = async (db: D1Database, songRefIds: number[]): Promise<Map<number, BestScores>> => {
  const bestBySong = new Map<number, BestScores>(
    songRefIds.map((id) => [id, { '1': null, '2': null, '3': null, '4': null }]),
  )
  if (songRefIds.length === 0) return bestBySong

  const { results } = await db
    .prepare(
      `SELECT song_ref_id, player_count, score, is_full_combo, has_full_combo, tied_others, participants
       FROM song_best WHERE song_ref_id IN (${songRefIds.map(() => '?').join(', ')})`,
    )
    .bind(...songRefIds)
    .all<BestRow>()

  for (const row of results) {
    const best = bestBySong.get(row.song_ref_id)
    if (!best || !PLAYER_COUNTS.includes(row.player_count as PlayerCount)) continue
    const participants = (JSON.parse(row.participants) as Participant[]).sort(
      (a, b) => COLOR_ORDER.get(a.color)! - COLOR_ORDER.get(b.color)!,
    )
    const entry: BestScore = {
      score: row.score,
      isFullCombo: toBoolean(row.is_full_combo),
      hasFullCombo: row.has_full_combo === 1,
      participants,
      tiedOthers: row.tied_others,
    }
    if (row.player_count === 1) best['1'] = { ...entry, name: participants[0]!.name }
    else best[String(row.player_count) as '2' | '3' | '4'] = entry
  }
  return bestBySong
}
