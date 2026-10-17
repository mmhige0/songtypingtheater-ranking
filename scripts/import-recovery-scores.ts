import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { buildRecoverySql } from './recovery-scores'

const { values, positionals } = parseArgs({ options: { out: { type: 'string' } }, allowPositionals: true })
try {
  if (!values.out || positionals.length !== 1) throw new Error('使い方: npm run import-recovery-scores -- --out imports/recovery.sql imports/recovery.json')
  const input: unknown = JSON.parse(readFileSync(positionals[0]!, 'utf8'))
  const sql = buildRecoverySql(input)
  writeFileSync(values.out, sql, { flag: 'wx' })
  console.log(`${values.out} に確認済み記録のSQLを生成しました。DBへの書き込みは行っていません。`)
} catch (error) {
  console.error(error instanceof Error ? error.message : '取り込みSQLの生成に失敗しました')
  process.exitCode = 1
}
