import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decrypt, encrypt, readKey } from './crypto.js'

test('round trip, randomized encryption, wrong key and corruption detection', () => {
  const key = readKey('11'.repeat(32))
  const sql = Buffer.from('CREATE TABLE example (id INTEGER); INSERT INTO example VALUES (1);')
  const first = encrypt(sql, key)
  assert.deepEqual(decrypt(first, key), sql)
  assert.notDeepEqual(first, encrypt(sql, key))
  assert.ok(!first.includes(sql))
  assert.throws(() => decrypt(first, readKey('22'.repeat(32))))
  for (const position of [0, 12, 25, first.length - 1]) {
    const changed = Buffer.from(first)
    changed[position] ^= 1
    assert.throws(() => decrypt(changed, key))
  }
  assert.throws(() => decrypt(first.subarray(0, 20), key))
})

test('reject missing, weak and malformed keys', () => {
  for (const value of [undefined, '', 'password', '11'.repeat(31), 'zz'.repeat(32)]) {
    assert.throws(() => readKey(value))
  }
})
