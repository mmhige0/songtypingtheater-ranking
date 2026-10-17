import { expect, it } from 'vitest'
import { recoveryFromDiff } from '../scripts/recovery-diff'
import { buildRecoverySql } from '../scripts/recovery-scores'

const raw = ['区分', '曲番', '人数', 'スコア', '参加者1', '参加者2', '参加者3', '参加者4']
const best = ['区分', '曲番', '人数', '旧スコア', '新スコア', '差', '旧参加者順(JSON)', '新参加者順(JSON)']
it('keeps only new plays, preserving whitespace, repeated names and multiplicity', () => {
  const row = ['新のみ', '001', '2', '200', ' A ', ' A ', '', '']
  const result = recoveryFromDiff([raw, ['旧のみ', '001', '1', '100', 'B', '', '', ''], row, row], 'outage')
  expect(result.records).toHaveLength(2)
  expect(result.records[0]!.participants.map(p => p.name)).toEqual([' A ', ' A '])
  expect(result.records[0]!.recordId).not.toBe(result.records[1]!.recordId)
  expect(result.records[0]!.participants[0]).toEqual({ name: ' A ', playerId: '' })
  expect(() => buildRecoverySql(result)).toThrow('IDが不正')
  expect(recoveryFromDiff([raw, row], 'outage').records[0]!.recordId).toBe(result.records[0]!.recordId)
})
it('adds only new and increased best scores and produces the same identity as the raw diff', () => {
  const result = recoveryFromDiff([best,
    ['追加', '001', '1', '', '200', '', '', '["A"]'],
    ['スコア変更', '002', '1', '100', '200', '100', '["B"]', '["B"]'],
    ['スコア変更', '003', '1', '300', '200', '-100', '["C"]', '["C"]'],
    ['削除', '004', '1', '100', '', '', '["D"]', ''],
    ['参加者順変更', '005', '2', '100', '100', '0', '["A","B"]', '["B","A"]'],
  ], 'outage')
  expect(result.records.map(r => r.gameSongId)).toEqual(['001', '002'])
  expect(result.records[0]!.recordId).toBe(recoveryFromDiff([raw, ['新のみ', '001', '1', '200', 'A', '', '', '']], 'outage').records[0]!.recordId)
})
it('rejects malformed scores, names and headers', () => {
  expect(() => recoveryFromDiff([raw, ['新のみ', '001', '1', '1e2', 'A', '', '', '']], 'outage')).toThrow('2行目')
  expect(() => recoveryFromDiff([best, ['追加', '001', '2', '', '200', '', '', '["A"]']], 'outage')).toThrow('参加者')
  expect(() => recoveryFromDiff([['unknown']], 'outage')).toThrow('見出し')
})
