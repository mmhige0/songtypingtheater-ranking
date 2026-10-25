// 確認済みの旧ID（legacy-）と新IDの対応をCSV（legacyPlayerId,newPlayerId）から読み、記録に反映するSQLを書き出す。
// 使い方: npm run link-legacy-players -- --out imports/legacy-links.sql imports/legacy-links.csv
// DBへは書き込まない。`npx wrangler d1 execute DB --remote --file <SQL>`で適用する（docs/operations.mdの「旧IDと新IDの紐付け」）。
// 名前の一致だけで作った対応は入れない（本人に確認できたものだけ）。画面には件数だけを出す
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { parse } from 'csv-parse/sync'
import { buildLinkSql, parseLinks, summarizeLinks } from './legacy-links'

const fail = (message: string): never => {
  console.error(message)
  process.exit(1)
}

const { values, positionals } = parseArgs({ options: { out: { type: 'string' } }, allowPositionals: true })

const outPath = values.out ?? fail('--out に出力するSQLファイルを指定してください')
const csvPath = positionals[0] ?? fail('対応のCSV（legacyPlayerId,newPlayerId）を指定してください')

const [header, ...rows]: string[][] = parse(readFileSync(csvPath), { bom: true, skip_empty_lines: true, trim: true })
if (header?.[0] !== 'legacyPlayerId' || header[1] !== 'newPlayerId') {
  fail('CSVの見出しは legacyPlayerId,newPlayerId にしてください')
}

const { links, errors } = parseLinks(rows)
if (errors.length > 0) {
  for (const e of errors) console.error(`${e.line}行目: ${e.reason}`)
  fail('誤りがあるためSQLを書き出しませんでした')
}
if (links.length === 0) fail('対応が1件もありません')

writeFileSync(outPath, buildLinkSql(links, new Date().toISOString()))
const summary = summarizeLinks(links)
console.log(`${outPath} に書き出しました`)
console.log(`対応: ${summary.links}件（新ID ${summary.newPlayers}件、うち旧IDが複数の新ID ${summary.newPlayersWithSeveralLegacyIds}件）`)
