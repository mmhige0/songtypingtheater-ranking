import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { normalizeUuidV4 } from '../src/lib/uuid'
import type { RecoveryInput } from './recovery-scores'

try {
  const { values, positionals } = parseArgs({ options: { out: { type: 'string' } }, allowPositionals: true })
  if (!values.out || positionals.length !== 2) {
    throw new Error('使い方: npm run fill-recovery-player-ids -- --out imports/recovery-filled.json imports/recovery.json imports/legacy-link-candidates.json')
  }
  const input: RecoveryInput = JSON.parse(readFileSync(positionals[0]!, 'utf8'))
  const candidates: unknown = JSON.parse(readFileSync(positionals[1]!, 'utf8'))
  if (!Array.isArray(candidates)) throw new Error('候補JSONはresultsを持つ配列にしてください')
  const ids = new Map<string, Set<string>>()
  for (const block of candidates) {
    if (!block || block.success === false || !Array.isArray(block.results)) throw new Error('候補JSONの形式または取得結果が不正です')
    for (const row of block.results) {
      const id = normalizeUuidV4(row?.new_id)
      if (typeof row?.name !== 'string' || !id) throw new Error('候補のnameまたはnew_idが不正です')
      if (!ids.has(row.name)) ids.set(row.name, new Set())
      ids.get(row.name)!.add(id)
    }
  }
  if (!input || !Array.isArray(input.records)) throw new Error('補完JSONのrecordsが不正です')
  let filled = 0
  const unresolved = new Set<string>()
  for (const record of input.records) {
    if (!Array.isArray(record.participants)) throw new Error('participantsが不正です')
    for (const p of record.participants) {
      if (!p || typeof p.name !== 'string' || typeof p.playerId !== 'string') throw new Error('参加者が不正です')
      if (p.playerId !== '') continue
      const matches = ids.get(p.name)
      if (matches?.size === 1) {
        p.playerId = [...matches][0]!
        filled++
      } else unresolved.add(p.name)
    }
    const assigned = record.participants.filter(p => p.playerId !== '').map(p => normalizeUuidV4(p.playerId))
    if (assigned.includes(null)) throw new Error(`${record.recordId}: 入力済みIDの形式が不正です`)
    if (new Set(assigned).size !== assigned.length) throw new Error(`${record.recordId}: プレイ内でIDが重複するため出力しません`)
  }
  writeFileSync(values.out, JSON.stringify(input, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ output: values.out, filled, unresolvedNames: [...unresolved] }))
} catch (error) {
  console.error(error instanceof Error ? error.message : 'ユーザーIDの入力に失敗しました')
  process.exitCode = 1
}
