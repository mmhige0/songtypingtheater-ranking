import { env } from 'cloudflare:workers'
import { beforeEach, expect, it } from 'vitest'
import { buildRecoverySql, type RecoveryInput } from '../scripts/recovery-scores'
import { resetDb } from './helpers'
import { insertPlayers, insertSong } from './view-helpers'

const playerId = '00000000-0000-4000-8000-000000000001'
const input = (): RecoveryInput => ({ batchId: 'test', records: [{ recordId: 'row2', gameSongId: '001', score: 123, participants: [{ name: "ア'リス", playerId }] }] })
const apply = async (data: RecoveryInput) => {
  for (const line of buildRecoverySql(data).trim().split('\n')) await env.DB.prepare(line).run()
}
beforeEach(async () => {
  await resetDb()
  await insertSong('001', 'テスト曲')
  await insertPlayers(playerId)
})

it('requires valid IDs for every participant and rejects repeated players', () => {
  const data = input()
  data.records[0]!.participants[0]!.playerId = ''
  expect(() => buildRecoverySql(data)).toThrow('IDが不正')
  data.records[0]!.participants[0]!.playerId = playerId
  data.records[0]!.participants.push({ ...data.records[0]!.participants[0]! })
  expect(() => buildRecoverySql(data)).toThrow('重複')
})

it('imports, refreshes rankings, and preserves timestamps on replay', async () => {
  await apply(input())
  const first = await env.DB.prepare('SELECT * FROM play').first()
  await apply(input())
  expect((await env.DB.prepare('SELECT * FROM play').all()).results).toEqual([first])
  expect(await env.DB.prepare('SELECT name_at_play FROM play_participant').first()).toEqual({ name_at_play: "ア'リス" })
  expect(await env.DB.prepare('SELECT score, participants FROM song_best').first()).toEqual({ score: 123, participants: JSON.stringify([{ name: "ア'リス", color: 'R' }]) })
  const changed = input()
  changed.records[0]!.score++
  await expect(apply(changed)).rejects.toThrow()
  expect(await env.DB.prepare('SELECT * FROM play').first()).toEqual(first)
})

it('rejects missing players and songs before creating a play', async () => {
  const missing = input()
  missing.records[0]!.participants[0]!.playerId = '00000000-0000-4000-8000-000000000002'
  await expect(apply(missing)).rejects.toThrow()
  missing.records[0]!.participants[0]!.playerId = playerId
  missing.records[0]!.gameSongId = '999'
  await expect(apply(missing)).rejects.toThrow()
  expect((await env.DB.prepare('SELECT * FROM play').all()).results).toEqual([])
})
