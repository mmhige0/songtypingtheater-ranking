// SQLを書き出すだけでDBには接続しない。通常はplayのトリガーで自動更新される。
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { TEAM_BEST_REBUILD_SQL } from '../src/lib/team-best-sql'

const { values } = parseArgs({ options: { out: { type: 'string' } } })
if (!values.out) {
  console.error('--out に出力するSQLファイルを指定してください')
  process.exit(1)
}
// 手動復旧時は送信を止めて適用する。アプリからはDB.batchで2文をまとめて実行できる。
writeFileSync(values.out, TEAM_BEST_REBUILD_SQL.map((sql) => `${sql.trim()};`).join('\n') + '\n')
console.log(`${values.out} に書き出しました`)
