import { createHash } from 'node:crypto'
import type { RecoveryInput } from './recovery-scores'

const RAW_HEADER = ['区分', '曲番', '人数', 'スコア', '参加者1', '参加者2', '参加者3', '参加者4']
const BEST_HEADER = ['区分', '曲番', '人数', '旧スコア', '新スコア', '差', '旧参加者順(JSON)', '新参加者順(JSON)']

// 差分生成側のCSVをそのまま使う。名前の空白・重複名・参加者順を保持する。
export function recoveryFromDiff(rows: string[][], batchId: string): RecoveryInput {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(batchId)) throw new Error('batchIdが不正です')
  const [header, ...data] = rows
  const raw = JSON.stringify(header) === JSON.stringify(RAW_HEADER)
  if (!raw && JSON.stringify(header) !== JSON.stringify(BEST_HEADER)) throw new Error('対応していない差分CSVの見出しです')
  const records: RecoveryInput['records'] = []
  const occurrences = new Map<string, number>()
  const scoreValue = (value: string | undefined) => {
    if (!value || !/^[0-9]+$/.test(value) || Number(value) > 2147483647) throw new Error('スコアが不正です')
    return Number(value)
  }
  data.forEach((row, i) => {
    try {
      if (row.length !== 8) throw new Error('列数が不正です')
      const label = row[0]
      if (raw ? !['旧のみ', '新のみ'].includes(label!) : !['追加', '削除', 'スコア変更', '参加者順変更'].includes(label!)) throw new Error('区分が不正です')
      if (raw ? label === '旧のみ' : label === '削除' || label === '参加者順変更') return
      const gameSongId = row[1]!
      const players = Number(row[2])
      if (!/^[0-9]{3,8}$/.test(gameSongId) || !/^[1-4]$/.test(row[2]!)) throw new Error('曲番または人数が不正です')
      const score = scoreValue(row[raw ? 3 : 4])
      if (!raw && label === 'スコア変更' && score <= scoreValue(row[3])) return
      const names: unknown = raw ? row.slice(4, 4 + players) : JSON.parse(row[7]!)
      if (!Array.isArray(names) || names.length !== players || names.some(n => typeof n !== 'string' || n.trim() === '')) throw new Error('参加者が不正です')
      if (raw && row.slice(4 + players).some(n => n !== '')) throw new Error('人数を超える参加者があります')
      const key = JSON.stringify([gameSongId, players, score, [...names].sort()])
      const occurrence = (occurrences.get(key) ?? 0) + 1
      occurrences.set(key, occurrence)
      const recordId = `${createHash('sha256').update(key).digest('hex').slice(0, 48)}-${occurrence}`
      records.push({ recordId, gameSongId, score, participants: names.map((name: string) => ({ name, playerId: '' })) })
    } catch (error) {
      throw new Error(`${i + 2}行目: ${error instanceof Error ? error.message : '不正な差分です'}`, { cause: error })
    }
  })
  return { batchId, records }
}
