// 旧記録の移行スクリプト。旧スプレッドシートを.xlsxでダウンロードしたファイルを読み、移行用SQLを書き出す。
// 使い方: npm run migrate-legacy-scores -- --songs imports/songs.csv --out imports/legacy-scores.sql imports/legacy-sheet.xlsx
// DBへは書き込まない。SQLはD1の1日の書き込み上限に収まるよう--outの名前に-1, -2…を付けたファイルに分けて書き出し、
// `npx wrangler d1 execute DB --remote --file <SQL>`で1日1ファイルずつ番号順に適用する（READMEの「旧記録の移行」）。
// 実際の名前は画面に出さず、SQLファイルにだけ書く
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { parse } from 'csv-parse/sync'
import ExcelJS from 'exceljs'
import { assignLegacyPlayers, buildSqlParts, parseWorkbook, selectBestRecords, summarize, type Cell, type Sheet } from './legacy-scores'

const fail = (message: string): never => {
  console.error(message)
  process.exit(1)
}

const { values, positionals } = parseArgs({
  options: { songs: { type: 'string' }, out: { type: 'string' } },
  allowPositionals: true,
})

const songsPath = values.songs ?? fail('--songs に曲マスターのCSV（gameSongId,title,artist,level）を指定してください')
const outPath = values.out ?? fail('--out に出力するSQLファイルを指定してください')
const xlsxPath = positionals[0] ?? fail('旧スプレッドシートの.xlsxファイルを指定してください')

const [songHeader, ...songRows]: string[][] = parse(readFileSync(songsPath), { bom: true, skip_empty_lines: true })
if (songHeader?.[0] !== 'gameSongId') fail('曲マスターのCSVの1列目は gameSongId にしてください')
const knownSongs = new Set(songRows.map((cells) => cells[0]))

// exceljsのセル値を変換処理の形にする。数式は計算結果を使う
const toCell = (value: ExcelJS.CellValue): Cell => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if ('error' in value) return { error: String(value.error) }
  if ('richText' in value) return value.richText.map((t) => t.text).join('')
  if ('formula' in value || 'sharedFormula' in value) return toCell(value.result as ExcelJS.CellValue)
  if ('text' in value) return String(value.text)
  return { error: 'unsupported' }
}

const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile(xlsxPath)
const sheets: Sheet[] = workbook.worksheets.map((ws) => {
  const rows: Cell[][] = []
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: Cell[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = toCell(cell.value)
    })
    rows[rowNumber - 1] = Array.from(cells, (c) => c ?? null)
  })
  return { name: ws.name, rows: Array.from(rows, (r) => r ?? []) }
})

const parsed = parseWorkbook(sheets)
const unknownSongs = [...new Set(parsed.records.map((r) => r.gameSongId))].filter((id) => !knownSongs.has(id))
const records = parsed.records.filter((r) => knownSongs.has(r.gameSongId))
const { plays, playerIds } = assignLegacyPlayers(selectBestRecords(records), randomUUID)
const parts = buildSqlParts(plays, playerIds, new Date().toISOString())
const { dir, name, ext } = path.parse(outPath)
const partPaths = parts.map((part, i) => {
  const partPath = path.join(dir, `${name}-${i + 1}${ext}`)
  writeFileSync(partPath, part.sql)
  return partPath
})

const summary = summarize(plays, playerIds)
console.log('曲番\t人数\t件数\t最高スコア')
for (const s of summary.bySongAndPlayers) console.log(`${s.gameSongId}\t${s.players}\t${s.count}\t${s.maxScore}`)

console.log(`\n対象外のタブ: ${parsed.ignoredTabs.join(', ') || 'なし'}`)
for (const h of parsed.heldTabs) console.log(`保留したタブ ${h.tab}: ${h.reason}`)
if (unknownSongs.length) console.log(`曲マスターにないため保留した曲番: ${unknownSongs.join(', ')}`)

const reasons = new Map<string, typeof parsed.skipped>()
for (const s of parsed.skipped) reasons.set(s.reason, [...(reasons.get(s.reason) ?? []), s])
for (const [reason, items] of reasons) {
  console.log(`\n取り込まなかった行（${reason}）: ${items.length}件`)
  for (const s of items) console.log(`  ${s.gameSongId}\t${s.players}人\t順位${s.rank}`)
}

console.log(
  `\n展開した成績 ${records.length}件 → 移行する成績 ${summary.plays}件（参加者 ${summary.participants}件、移行用プレイヤー ${summary.players}人）`,
)
console.log(`\nSQLを${parts.length}ファイルに分けて書き出しました。1日（UTC）に1ファイルずつ番号順に適用してください`)
parts.forEach((part, i) =>
  console.log(
    `  ${partPaths[i]}: 成績 ${part.plays}件、参加者 ${part.participants}件、移行用プレイヤー ${part.players}人、書き込み見込み ${part.estimatedWrites}行`,
  ),
)
