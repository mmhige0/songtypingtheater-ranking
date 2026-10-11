// 曲マスター登録スクリプト。CSV（gameSongId,title,artist,level）を読み、曲登録APIへ1行ずつPUTする。
// 使い方: ADMIN_API_KEY=... npm run register-songs -- --base-url https://example.workers.dev imports/songs.csv
// 同じCSVを再実行しても結果は変わらない（未変更の曲はunchanged）。
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { parse } from 'csv-parse/sync'

const HEADER = ['gameSongId', 'title', 'artist', 'level']

type Row = Record<(typeof HEADER)[number], string>

const fail = (message: string): never => {
  console.error(message)
  process.exit(1)
}

const { values, positionals } = parseArgs({
  options: { 'base-url': { type: 'string' } },
  allowPositionals: true,
})

const baseUrl = values['base-url'] ?? fail('--base-url を指定してください')
const csvPath = positionals[0] ?? fail('CSVファイルを指定してください')
const adminKey = process.env.ADMIN_API_KEY || fail('環境変数 ADMIN_API_KEY を設定してください')

const url = new URL(baseUrl)
// 管理用キーを平文で送らないよう、HTTPはローカル開発時だけ許可する
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
  fail('--base-url はHTTPSにしてください（HTTPはlocalhostのみ）')
}

const records: string[][] = parse(readFileSync(csvPath), { bom: true, skip_empty_lines: true })
const [header, ...dataRows] = records
if (!header || header.join(',') !== HEADER.join(',')) fail(`CSVの1行目は ${HEADER.join(',')} にしてください`)

const rows = dataRows.map((cells) => Object.fromEntries(HEADER.map((key, i) => [key, cells[i] ?? ''])) as Row)
const counts: Record<string, number> = {}

for (const row of rows) {
  const body = {
    title: row.title,
    artist: row.artist === '' ? null : row.artist,
    level: row.level === '' ? null : row.level,
  }

  let result: string
  try {
    const res = await fetch(new URL(`/api/v1/admin/songs/${encodeURIComponent(row.gameSongId)}`, url), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as {
      status?: string
      error?: { code: string; message: string }
    } | null
    result = res.ok && json?.status ? json.status : `error ${res.status} ${json?.error?.code ?? ''} ${json?.error?.message ?? ''}`
  } catch (error) {
    result = `error ${error instanceof Error ? error.message : String(error)}`
  }

  const kind = result.startsWith('error') ? 'error' : result
  counts[kind] = (counts[kind] ?? 0) + 1
  console.log(`${row.gameSongId}\t${result.trim()}`)
}

console.log(`\n合計 ${rows.length}件: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' / ')}`)
if (counts.error) process.exit(1)
