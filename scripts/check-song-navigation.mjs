import { URL } from 'node:url'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'

const source = readFileSync(new URL('../src/views/song-navigation.tsx', import.meta.url), 'utf8')
const script = runInNewContext('`' + source.match(/SONG_NAVIGATION_SCRIPT = `([\s\S]*?)`/)[1] + '`')

function setup(path = '/songs/010?name=test&players=2&page=3', selected = '4') {
  let now = 0
  const events = {}, visits = [], requests = [], timers = new Map()
  let timerId = 0
  const document = {
    getElementById: () => ({ dataset: { songId: '010' } }),
    querySelector: () => selected ? { value: selected } : null,
    addEventListener: (event, callback) => { events[event] = callback },
  }
  const window = {
    location: { href: 'https://example.com' + path, assign: url => visits.push(url) },
    addEventListener: (event, callback) => { events[event] = callback },
  }
  const fetch = (url, { signal }) => new Promise((resolve, reject) => {
    requests.push({ url, signal, resolve, reject })
    signal.addEventListener('abort', () => reject(new Error('aborted')))
  })
  runInNewContext(script, {
    document, window, URL, encodeURIComponent, fetch,
    AbortController: globalThis.AbortController,
    Date: { now: () => now },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId },
    clearTimeout: id => timers.delete(id),
  })
  return {
    visits, events, requests, timers,
    time: value => { now = value },
    key: (overrides = {}) => events.keydown({ key: 'ArrowRight', preventDefault() {}, ...overrides }),
    respond: (data = { previous: '001', next: '1000' }, ok = true) => requests.at(-1).resolve({ ok, json: async () => data }),
  }
}

test('fetches only on a valid key, blocks repeats/in-flight input, and preserves filters/current tab', async () => {
  const s = setup()
  assert.equal(s.requests.length, 0)
  await s.key()
  s.time(500)
  await s.key({ repeat: true })
  assert.equal(s.requests.length, 0)
  const pending = s.key()
  await s.key({ key: 'ArrowLeft' })
  assert.equal(s.requests.length, 1)
  assert.equal(s.requests[0].url, '/api/v1/songs/010/neighbors')
  s.respond()
  await pending
  assert.deepEqual(s.visits, ['https://example.com/songs/1000?name=test&players=4'])
  await s.key()
  assert.equal(s.requests.length, 1)
  s.events.pageshow()
  await s.key()
  assert.equal(s.requests.length, 1)
  s.time(1000)
  const back = s.key({ key: 'ArrowLeft' })
  s.respond()
  await back
  assert.equal(s.visits.length, 2)
})

test('ignores editing, controls, composition, modifiers and handled events without fetching', async () => {
  const s = setup()
  s.time(500)
  for (const event of [
    { target: { isContentEditable: true } },
    { target: { closest: () => ({}) } },
    { isComposing: true }, { defaultPrevented: true },
    { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true },
    { key: 'ArrowDown' },
  ]) await s.key(event)
  assert.equal(s.requests.length, 0)
})

test('keeps the player-specific route and stops at the boundary', async () => {
  const s = setup('/songs/010/players/3?name=test&page=2', null)
  s.time(500)
  const boundary = s.key()
  s.respond({ previous: '001', next: null })
  await boundary
  assert.equal(s.visits.length, 0)
  s.time(1000)
  const previous = s.key({ key: 'ArrowLeft' })
  s.respond()
  await previous
  assert.deepEqual(s.visits, ['https://example.com/songs/001/players/3?name=test'])
})

test('unlocks after network/HTTP errors, timeout or invalid response so the next key can retry', async () => {
  for (const failure of ['network', 'http', 'timeout', 'invalid']) {
    const s = setup()
    s.time(500)
    const pending = s.key()
    if (failure === 'network') s.requests[0].reject(new Error('offline'))
    if (failure === 'http') s.respond(null, false)
    if (failure === 'timeout') s.timers.values().next().value()
    if (failure === 'invalid') s.respond({ next: '../bad' })
    await pending
    assert.equal(s.visits.length, 0)
    assert.equal(s.timers.size, 0)
    s.time(1000)
    const retry = s.key()
    assert.equal(s.requests.length, 2)
    s.respond()
    await retry
    assert.equal(s.visits.length, 1)
  }
})

test('ignores stale responses after history restoration', async () => {
  const s = setup()
  s.time(500)
  const pending = s.key()
  s.events.pageshow()
  await pending
  assert.equal(s.requests[0].signal.aborted, true)
  assert.equal(s.visits.length, 0)
  s.time(1000)
  const retry = s.key()
  s.respond()
  await retry
  assert.equal(s.visits.length, 1)
})
