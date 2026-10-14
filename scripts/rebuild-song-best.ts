// song_best（曲・人数ごとのランキング1位）を全曲分作り直すSQLを書き出す。DBへは書き込まない。
// 使い方: npm run rebuild-song-best -- --out imports/rebuild-song-best.sql
// その後 `npx wrangler d1 execute DB --remote --file imports/rebuild-song-best.sql` で適用する（READMEの「曲一覧の1位の作り直し」）
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { SONG_BEST_REBUILD_SQL } from '../src/lib/song-best-sql'

const { values } = parseArgs({ options: { out: { type: 'string' } } })
if (!values.out) {
  console.error('--out に出力するSQLファイルを指定してください')
  process.exit(1)
}
writeFileSync(values.out, SONG_BEST_REBUILD_SQL.map((sql) => `${sql.trim()};`).join('\n') + '\n')
console.log(`${values.out} に書き出しました`)
