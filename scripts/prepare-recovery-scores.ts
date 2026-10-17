import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { parse } from 'csv-parse/sync'
import { recoveryFromDiff } from './recovery-diff'

try {
  const { values, positionals } = parseArgs({ options: { out: { type: 'string' }, batch: { type: 'string' } }, allowPositionals: true })
  if (!values.out || !values.batch || positionals.length !== 1) throw new Error('使い方: npm run prepare-recovery-scores -- --batch outage-20261017 --out imports/recovery.json imports/legacy-play-diff.csv')
  const rows: string[][] = parse(readFileSync(positionals[0]!), { bom: true, skip_empty_lines: true })
  const input = recoveryFromDiff(rows, values.batch)
  writeFileSync(values.out, JSON.stringify(input, null, 2) + '\n', { flag: 'wx' })
  console.log(`${input.records.length}件の確認用JSONを生成しました。全参加者のplayerIdを入力してください。`)
} catch (error) {
  console.error(error instanceof Error ? error.message : '差分の変換に失敗しました')
  process.exitCode = 1
}
