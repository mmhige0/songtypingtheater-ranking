// 確認済みの旧ID（legacy-）と新IDの対応を記録に反映するSQLを作る変換処理（入出力を持たない純粋関数）。
// 規則はdocs/data-design.mdの「移行（確定）」の手順6・8を参照。テストからも使うためNode.js固有のAPIに依存しない
import { SONG_BEST_REBUILD_SQL } from '../src/lib/song-best-sql'
import { normalizeUuidV4 } from '../src/lib/uuid'
import { chunk, sqlString } from './legacy-scores'

export type LegacyLink = { legacyPlayerId: string; newPlayerId: string }

export type LinkError = { line: number; reason: 'invalid-legacy-id' | 'invalid-new-id' | 'duplicate-legacy-id' | 'missing-column' }

const LEGACY_ID = /^legacy-[0-9]+$/
// 1文に含める対応の数
const LINKS_PER_STATEMENT = 100

// CSVの行（見出しを除く）を対応にする。行番号は見出しを1行目とした番号。1件でも誤りがあればSQLを作らない
export const parseLinks = (rows: readonly string[][]) => {
  const links: LegacyLink[] = []
  const errors: LinkError[] = []
  const seen = new Set<string>()
  rows.forEach((cells, i) => {
    const line = i + 2
    const [legacyPlayerId, newId] = cells
    if (legacyPlayerId === undefined || newId === undefined) return errors.push({ line, reason: 'missing-column' })
    if (!LEGACY_ID.test(legacyPlayerId)) return errors.push({ line, reason: 'invalid-legacy-id' })
    const newPlayerId = normalizeUuidV4(newId)
    if (newPlayerId === null) return errors.push({ line, reason: 'invalid-new-id' })
    if (seen.has(legacyPlayerId)) return errors.push({ line, reason: 'duplicate-legacy-id' })
    seen.add(legacyPlayerId)
    links.push({ legacyPlayerId, newPlayerId })
  })
  return { links, errors }
}

// 反映用SQL（1行1文）。どの文で失敗しても、原因を直して同じ手順で作ったSQLを流し直せば同じ結果になる順に並べる。
// - 既に別の新IDへ対応済みの旧IDがあれば、確認状態に許されない値を書いてCHECK制約違反で止める
// - 参加者の置き換えは旧記録（hostPlayerIdがnull）だけが対象。新IDが存在しなければ外部キー違反、
//   同じプレイの複数の旧IDが同じ新IDになる場合は主キー違反で失敗する（手順6の保留）
// - teamKey・playerCountは置き換え後の参加者から作り直す。playerIdは英小文字・数字・ハイフンだけなので、
//   SQLiteのバイト順の並べ替えはtoTeamKeyの並べ替えと同じになる
// - 対応の登録は置き換えの後に行う。旧IDが存在しなければ外部キー違反で失敗する
export const buildLinkSql = (links: readonly LegacyLink[], now: string) => {
  const at = sqlString(now)
  const lines: string[] = []
  for (const group of chunk(links, LINKS_PER_STATEMENT)) {
    const pairs = group.map((l) => `(${sqlString(l.legacyPlayerId)}, ${sqlString(l.newPlayerId)})`).join(', ')
    const legacyIds = group.map((l) => sqlString(l.legacyPlayerId)).join(', ')
    const newIds = [...new Set(group.map((l) => l.newPlayerId))].map(sqlString).join(', ')
    const cases = group.map((l) => `WHEN ${sqlString(l.legacyPlayerId)} THEN ${sqlString(l.newPlayerId)}`).join(' ')
    lines.push(
      `WITH link (legacy_id, new_id) AS (VALUES ${pairs}) UPDATE legacy_identity_mapping SET status = 'conflict' WHERE EXISTS (SELECT 1 FROM link WHERE link.legacy_id = legacy_identity_mapping.legacy_player_id AND link.new_id <> legacy_identity_mapping.new_player_id);`,
      `UPDATE play_participant SET player_id = CASE player_id ${cases} END WHERE player_id IN (${legacyIds}) AND play_id IN (SELECT play_id FROM play WHERE host_player_id IS NULL);`,
      `UPDATE play SET team_key = (SELECT json_group_array(pp.player_id ORDER BY pp.player_id) FROM play_participant AS pp WHERE pp.play_id = play.play_id), player_count = (SELECT COUNT(*) FROM play_participant AS pp WHERE pp.play_id = play.play_id) WHERE host_player_id IS NULL AND play_id IN (SELECT play_id FROM play_participant WHERE player_id IN (${newIds}));`,
      `INSERT INTO legacy_identity_mapping (legacy_player_id, new_player_id, status, created_at, updated_at) VALUES ${group.map((l) => `(${sqlString(l.legacyPlayerId)}, ${sqlString(l.newPlayerId)}, 'confirmed', ${at}, ${at})`).join(', ')} ON CONFLICT (legacy_player_id) DO UPDATE SET status = 'confirmed', updated_at = excluded.updated_at WHERE status <> 'confirmed';`,
    )
  }
  // 記録を直接変えたので、曲一覧が読む1位を作り直す（1行1文にする）
  lines.push(...SONG_BEST_REBUILD_SQL.map((sql) => `${sql.replace(/\s+/g, ' ').trim()};`))
  return `${lines.join('\n')}\n`
}

// 画面に出す件数。IDは出さない
export const summarizeLinks = (links: readonly LegacyLink[]) => {
  const perNewId = new Map<string, number>()
  for (const l of links) perNewId.set(l.newPlayerId, (perNewId.get(l.newPlayerId) ?? 0) + 1)
  return {
    links: links.length,
    newPlayers: perNewId.size,
    newPlayersWithSeveralLegacyIds: [...perNewId.values()].filter((n) => n > 1).length,
  }
}
