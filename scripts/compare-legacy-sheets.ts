import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import ExcelJS from 'exceljs'
import { parse } from 'csv-parse/sync'
import { parseWorkbook, type Cell, type LegacyRecord, type Sheet } from './legacy-scores'

const { values, positionals } = parseArgs({
  options: { songs: { type: 'string' }, 'out-dir': { type: 'string', default: 'imports' } },
  allowPositionals: true,
})
if (positionals.length !== 2) {
  console.error('使い方: npm run compare-legacy-sheets -- [--songs imports/songs.csv] [--out-dir imports] <旧.xlsx> <新.xlsx>')
  process.exit(1)
}
const files = positionals
const outDir = values['out-dir']!
const songPath = values.songs
const toCell = (v: ExcelJS.CellValue): Cell => {
  if (v == null) return null
  if (typeof v === 'string' || typeof v === 'number') return v
  if (typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString()
  if ('error' in v) return { error: String(v.error) }
  if ('richText' in v) return v.richText.map(t => t.text).join('')
  if ('formula' in v || 'sharedFormula' in v) return toCell(v.result as ExcelJS.CellValue)
  if ('text' in v) return String(v.text)
  return { error: 'unsupported' }
}
const loaded = await Promise.all(files.map(async file => {
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(file, { worksheets: 'emit', sharedStrings: 'cache', styles: 'ignore', hyperlinks: 'ignore' })
  const sheets: Sheet[] = []
  for await (const ws of wb) {
    // ExcelJSの実装にはnameがあるが、ストリーミングリーダーの型定義には含まれない。
    const name = (ws as typeof ws & { name: string }).name
    if (!/^[0-9]{3,8}$/.test(name.trim())) {
      sheets.push({ name, rows: [] })
      for await (const row of ws) { void row }
      continue
    }
    const rows: Cell[][] = []
    for await (const row of ws) {
      const cells = Array.from({ length: 16 }, (_, i) => toCell(row.getCell(i + 1).value))
      if (cells.some(c => c !== null)) rows.push(cells)
    }
    sheets.push({ name, rows })
  }
  return parseWorkbook(sheets)
}))
const teamKey = (r: LegacyRecord) => JSON.stringify([r.gameSongId, r.players, [...r.names].sort()])
const key = (r: LegacyRecord) => JSON.stringify([teamKey(r), r.score])
const csvCell = (v: unknown) => '"' + String(v ?? '').replaceAll('"', '""') + '"'
const writeCsv = (file: string, rows: unknown[][]) => {
  writeFileSync(file, '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n')
  const back = parse(readFileSync(file), { bom: true })
  if (back.length !== rows.length) throw new Error('CSV verification failed')
}
const rawRows: unknown[][] = [['区分', '曲番', '人数', 'スコア', '参加者1', '参加者2', '参加者3', '参加者4']]
// Compare as multisets so identical duplicate rows are counted correctly.
for (const [side, other, label] of [[0, 1, '旧のみ'], [1, 0, '新のみ']] as const) {
  const counts = new Map<string, number>()
  for (const r of loaded[other]!.records) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1)
  for (const r of loaded[side]!.records) {
    const count = counts.get(key(r)) ?? 0
    if (count) counts.set(key(r), count - 1)
    else rawRows.push([label, r.gameSongId, r.players, r.score, ...r.names, ...Array(4 - r.names.length).fill('')])
  }
}
mkdirSync(outDir, { recursive: true })
const songs: string[][] | undefined = songPath ? parse(readFileSync(songPath), { bom: true, skip_empty_lines: true }) : undefined
if (songs && songs[0]?.[0] !== 'gameSongId') throw new Error('曲マスターのCSVの1列目は gameSongId にしてください')
writeCsv(path.join(outDir, 'legacy-play-diff.csv'), rawRows)
const known = songs ? new Set(songs.slice(1).map(r => r[0])) : undefined
const summary = {
  files, comparison: '名前は空白も含め完全一致。チーム内の順序を無視し重複名を保持。同一記録の重複件数も比較。',
  sources: loaded.map((p, i) => ({ file: files[i], records: p.records.length, ignoredTabs: p.ignoredTabs, heldTabs: p.heldTabs, skipped: p.skipped, ...(known ? { unknownSongs: [...new Set(p.records.filter(r => !known.has(r.gameSongId)).map(r => r.gameSongId))] } : {}) })),
  raw: { oldOnly: rawRows.filter(r => r[0] === '旧のみ').length, newOnly: rawRows.filter(r => r[0] === '新のみ').length },
}
writeFileSync(path.join(outDir, 'legacy-play-diff-summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ sources: summary.sources.map(s => ({ records: s.records, heldTabs: s.heldTabs.length, skipped: s.skipped.length, ...(s.unknownSongs ? { unknownSongs: s.unknownSongs.length } : {}) })), raw: summary.raw }))
