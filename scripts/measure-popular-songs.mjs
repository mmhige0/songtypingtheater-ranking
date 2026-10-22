import process from 'node:process'
import console from 'node:console'
import { URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// 表示で使うSQLそのものを計測する。SQLの形式が変わった場合は黙って別のSQLを測らず停止する。
if (process.argv.length !== 3 || process.argv[2] !== '--remote') {
  throw new Error('Usage: node scripts/measure-popular-songs.mjs --remote')
}
const source = readFileSync(new URL('../src/lib/popular-songs.ts', import.meta.url), 'utf8')
const counted = source.match(/const COUNTED = '([^']+)'/)?.[1]
const query = source.match(/\.prepare\(\s*`([\s\S]*?)`/)?.[1]
const days = Number(source.match(/POPULAR_SONG_DAYS = (\d+)/)?.[1])
const limit = Number(source.match(/POPULAR_SONG_LIMIT = (\d+)/)?.[1])
if (!counted || !query || !days || !limit) throw new Error('Popular songs SQL format changed')
const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
const to = new Date(Date.parse(today + 'T00:00:00Z') - 9 * 60 * 60 * 1000).toISOString()
const from = new Date(Date.parse(to) - days * 86400000).toISOString()
const sql = query.replace('${COUNTED}', counted)
  .replaceAll('?1', "'" + from + "'").replaceAll('?2', "'" + to + "'").replaceAll('?3', String(limit))
if (sql.includes('${') || !sql.startsWith('WITH counted AS')) throw new Error('Unexpected SQL')
const child = spawnSync(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--remote', '--json', '--command', sql,
], { encoding: 'utf8' })
if (child.error || child.status !== 0) {
  console.error(child.stderr)
  console.error(child.stdout)
  throw new Error('D1 measurement failed')
}
const [result] = JSON.parse(child.stdout)
if (!result?.success || typeof result.meta?.rows_read !== 'number') throw new Error('Missing D1 rows_read')
console.log(JSON.stringify({
  from, to, rows_read: result.meta.rows_read, duration_ms: result.meta.duration,
  returned: result.results.length,
}, null, 2))
