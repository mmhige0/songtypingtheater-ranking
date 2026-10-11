// 旧スプレッドシートの曲別ランキング表から移行用SQLを作る変換処理（入出力を持たない純粋関数）。
// 規則はdocs/data-design.mdの「移行（確定）」を参照。テストからも使うためNode.js固有のAPIに依存しない
import { toTeamKey } from '../src/lib/team-key'

// セルの値。数式は計算結果、リッチテキストは連結済みの文字列で渡す。#REF!等はerror
export type Cell = string | number | null | { error: string }

export type Sheet = { name: string; rows: Cell[][] }

// 曲タブの列（1始まりの列番号から1を引いた添字）。上から曲名の見出し（【曲番】曲名）、列見出し、1行1順位のデータが並ぶ。
// B列に見出しと順位、C〜P列に1〜4人のブロックが横に並ぶ
const TITLE_COLUMN = 1
const BLOCKS = [
  { players: 1, scoreColumn: 2, label: '1人スコア' },
  { players: 2, scoreColumn: 4, label: '2人スコア' },
  { players: 3, scoreColumn: 7, label: '3人スコア' },
  { players: 4, scoreColumn: 11, label: '4人スコア' },
] as const

const COLORS = ['R', 'B', 'Y', 'G'] as const
const SONG_TAB_NAME = /^[0-9]{3,8}$/
const TITLE_SONG_ID = /^【([0-9]+)】/
// 1文に含める行数。D1の1文あたりのSQL長の上限に収まるよう分割する
const ROWS_PER_INSERT = 100

export type SkipReason = 'blank-name' | 'missing-name' | 'missing-score' | 'invalid-score' | 'error-value'

export type LegacyRecord = {
  gameSongId: string
  players: number
  score: number
  // シート上の並び順
  names: string[]
}

export type ParseResult = {
  records: LegacyRecord[]
  // 曲タブとみなさなかったタブ名（一覧表など）
  ignoredTabs: string[]
  // 曲番・見出しの形式が合わず保留したタブ
  heldTabs: { tab: string; reason: string }[]
  // 採用しなかった行。名前は持たない
  skipped: { gameSongId: string; players: number; rank: string; reason: SkipReason }[]
}

const isError = (cell: Cell): cell is { error: string } => typeof cell === 'object' && cell !== null

const text = (cell: Cell | undefined): string | null => {
  if (cell === undefined || cell === null || isError(cell)) return null
  return String(cell)
}

const isEmpty = (cell: Cell | undefined) => cell === undefined || cell === null || cell === ''

const parseScore = (cell: Cell): number | null => {
  if (typeof cell === 'number') return Number.isSafeInteger(cell) && cell >= 0 && cell <= 2147483647 ? cell : null
  if (typeof cell === 'string' && /^[0-9]+$/.test(cell)) {
    const score = Number(cell)
    return score <= 2147483647 ? score : null
  }
  return null
}

// 曲名の見出し（結合セルで複数行に同じ値が入る）の後にある、1人スコアの列見出しの行
const findLabelRow = (rows: Cell[][], titleIndex: number) =>
  rows.findIndex((row, i) => i > titleIndex && text(row[BLOCKS[0].scoreColumn]) === BLOCKS[0].label)

// ワークブックの全タブから成績を展開する（設計書の手順1）。タブ順・行順・人数ブロック順を保つ
export const parseWorkbook = (sheets: readonly Sheet[]): ParseResult => {
  const result: ParseResult = { records: [], ignoredTabs: [], heldTabs: [], skipped: [] }

  for (const sheet of sheets) {
    const tab = sheet.name.trim()
    if (!SONG_TAB_NAME.test(tab)) {
      result.ignoredTabs.push(sheet.name)
      continue
    }
    const titleIndex = sheet.rows.findIndex((row) => TITLE_SONG_ID.test(text(row[TITLE_COLUMN]) ?? ''))
    if (titleIndex < 0) {
      result.heldTabs.push({ tab, reason: '曲名の見出し（【曲番】）が見つからない' })
      continue
    }
    const titleSongId = TITLE_SONG_ID.exec(text(sheet.rows[titleIndex]![TITLE_COLUMN]) ?? '')?.[1]
    if (titleSongId !== tab) {
      result.heldTabs.push({ tab, reason: `見出しの曲番（${titleSongId}）がタブ名と異なる` })
      continue
    }
    const labelIndex = findLabelRow(sheet.rows, titleIndex)
    const labels = sheet.rows[labelIndex]
    if (!labels) {
      result.heldTabs.push({ tab, reason: '「1人スコア」の列見出しが見つからない' })
      continue
    }
    const wrongLabel = BLOCKS.find((b) => text(labels[b.scoreColumn]) !== b.label)
    if (wrongLabel) {
      result.heldTabs.push({ tab, reason: `「${wrongLabel.label}」の列の位置が異なる` })
      continue
    }

    for (const row of sheet.rows.slice(labelIndex + 1)) {
      const rank = text(row[TITLE_COLUMN]) ?? ''
      for (const block of BLOCKS) {
        const scoreCell = row[block.scoreColumn] ?? null
        const nameCells = Array.from({ length: block.players }, (_, i) => row[block.scoreColumn + 1 + i] ?? null)
        const cells = [scoreCell, ...nameCells]
        if (cells.every(isEmpty)) continue

        const skip = (reason: SkipReason) =>
          result.skipped.push({ gameSongId: tab, players: block.players, rank, reason })
        if (cells.some(isError)) {
          skip('error-value')
          continue
        }
        if (isEmpty(scoreCell)) {
          skip('missing-score')
          continue
        }
        const score = parseScore(scoreCell)
        if (score === null) {
          skip('invalid-score')
          continue
        }
        if (nameCells.some(isEmpty)) {
          skip('missing-name')
          continue
        }
        // 名前は空白を除去せず完全一致で扱う。空白だけの名前は名前とみなさない
        const names = nameCells.map((cell) => text(cell)!)
        if (names.some((name) => name.trim() === '')) {
          skip('blank-name')
          continue
        }
        result.records.push({ gameSongId: tab, players: block.players, score, names })
      }
    }
  }
  return result
}

// 曲×人数×名前の組み合わせ（順不同・多重集合）ごとに最高スコアの1件を選ぶ（手順3・4）。
// 同点は先に現れた記録を残す。結果は組み合わせが最初に現れた順
export const selectBestRecords = (records: readonly LegacyRecord[]): LegacyRecord[] => {
  const best = new Map<string, LegacyRecord>()
  for (const record of records) {
    const key = JSON.stringify([record.gameSongId, record.players, [...record.names].sort()])
    const current = best.get(key)
    if (!current || record.score > current.score) best.set(key, record)
  }
  return [...best.values()]
}

export type LegacyParticipant = { playerId: string; name: string; color: (typeof COLORS)[number] }
export type LegacyPlay = { playId: string; gameSongId: string; score: number; participants: LegacyParticipant[] }

// 完全一致の名前ごとに移行用playerIdを割り当てる（手順5・7）。同じチームに同じ名前が複数あれば
// 2人目以降は別のIDにする。IDは記録の順に連番で振るため、同じ入力なら同じIDになる
export const assignLegacyPlayers = (records: readonly LegacyRecord[], newPlayId: () => string) => {
  const ids = new Map<string, string>()
  const plays: LegacyPlay[] = records.map((record) => {
    const seen = new Map<string, number>()
    const participants = record.names.map((name, i) => {
      const occurrence = seen.get(name) ?? 0
      seen.set(name, occurrence + 1)
      const key = JSON.stringify([name, occurrence])
      let playerId = ids.get(key)
      if (!playerId) {
        playerId = `legacy-${String(ids.size + 1).padStart(5, '0')}`
        ids.set(key, playerId)
      }
      return { playerId, name, color: COLORS[i]! }
    })
    return { playId: newPlayId(), gameSongId: record.gameSongId, score: record.score, participants }
  })
  return { plays, playerIds: [...ids.values()] }
}

// SQLの文字列リテラル。1文を1行に収めるため改行等の制御文字はchar()で連結する
const sqlString = (value: string) =>
  value
    // eslint-disable-next-line no-control-regex -- 制御文字を検出するための意図的な指定
    .split(/([\u0000-\u001f])/u)
    .map((part, i) => (i % 2 === 1 ? `char(${part.charCodeAt(0)})` : `'${part.replaceAll("'", "''")}'`))
    .join(' || ')

const chunk = <T>(items: readonly T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))

// 移行用SQL（1行1文）。先に移行分を全削除するため、公開前なら何度でも取り込み直せる（手順9）。
// 新IDとの対応（legacy_identity_mapping）がある場合は外部キー違反で移行用Playerの削除が失敗し、取り込み直しが止まる
export const buildSql = (plays: readonly LegacyPlay[], playerIds: readonly string[], receivedAt: string) => {
  const lines = [
    'DELETE FROM play_participant WHERE play_id IN (SELECT play_id FROM play WHERE host_player_id IS NULL);',
    'DELETE FROM play WHERE host_player_id IS NULL;',
    "DELETE FROM player WHERE player_id LIKE 'legacy-%';",
  ]
  const at = sqlString(receivedAt)

  for (const ids of chunk(playerIds, ROWS_PER_INSERT)) {
    const values = ids.map((id) => `(${sqlString(id)}, NULL, NULL, ${at})`)
    lines.push(`INSERT INTO player (player_id, token_hash, revoked_at, created_at) VALUES ${values.join(', ')};`)
  }
  // 曲の内部IDは取り込み先のDBで曲番から引く。未登録の曲ならNOT NULL制約違反で失敗する
  for (const group of chunk(plays, ROWS_PER_INSERT)) {
    const values = group.map((p) => {
      const songRef = `(SELECT id FROM song WHERE game_song_id = ${sqlString(p.gameSongId)} AND status = 'approved')`
      const teamKey = toTeamKey(p.participants.map((x) => x.playerId))
      return `(${sqlString(p.playId)}, ${songRef}, ${p.score}, NULL, NULL, ${at}, NULL, NULL, ${p.participants.length}, ${sqlString(teamKey)}, NULL)`
    })
    lines.push(
      'INSERT INTO play (play_id, song_ref_id, score, is_full_combo, is_taipen, received_at, game_version, ' +
        `host_player_id, player_count, team_key, excluded_at) VALUES ${values.join(', ')};`,
    )
  }
  const participants = plays.flatMap((p) => p.participants.map((x) => ({ playId: p.playId, ...x })))
  for (const group of chunk(participants, ROWS_PER_INSERT)) {
    const values = group.map(
      (x) => `(${sqlString(x.playId)}, ${sqlString(x.playerId)}, ${sqlString(x.name)}, ${sqlString(x.color)})`,
    )
    lines.push(
      `INSERT INTO play_participant (play_id, player_id, name_at_play, color_at_play) VALUES ${values.join(', ')};`,
    )
  }
  return `${lines.join('\n')}\n`
}

// 照合用の集計（手順10）。名前は含めない
export const summarize = (plays: readonly LegacyPlay[], playerIds: readonly string[]) => {
  const bySongAndPlayers = new Map<string, { gameSongId: string; players: number; count: number; maxScore: number }>()
  for (const p of plays) {
    const key = `${p.gameSongId}\t${p.participants.length}`
    const entry = bySongAndPlayers.get(key) ?? { gameSongId: p.gameSongId, players: p.participants.length, count: 0, maxScore: 0 }
    entry.count += 1
    entry.maxScore = Math.max(entry.maxScore, p.score)
    bySongAndPlayers.set(key, entry)
  }
  return {
    plays: plays.length,
    participants: plays.reduce((n, p) => n + p.participants.length, 0),
    players: playerIds.length,
    bySongAndPlayers: [...bySongAndPlayers.values()],
  }
}
