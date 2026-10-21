import { URL } from 'node:url'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'

const source = readFileSync(new URL('../src/views/song-navigation.tsx', import.meta.url), 'utf8')
const script = runInNewContext('`' + source.match(/SONG_NAVIGATION_SCRIPT = `([\s\S]*?)`/)[1] + '`')

function setup(path = '/songs/010?name=test&players=2&page=3', selected = '4') {
  let now = 0
  const events = {}, visits = []
  const config = { dataset: { previous: '001', next: '1000' } }
  const document = {
    getElementById: () => config,
    querySelector: () => selected ? { value: selected } : null,
    addEventListener: (event, callback) => { events[event] = callback },
  }
  const window = {
    location: { href: 'https://example.com' + path, assign: url => visits.push(url) },
    addEventListener: (event, callback) => { events[event] = callback },
  }
  runInNewContext(script, { document, window, URL, encodeURIComponent, Date: { now: () => now } })
  return {
    visits, config, events,
    time: value => { now = value },
    key: (overrides = {}) => events.keydown({ key: 'ArrowRight', preventDefault() {}, ...overrides }),
  }
}

test('blocks initial cooldown, repeats, rapid navigation and preserves filters/current tab', () => {
  const s = setup()
  s.key()
  assert.equal(s.visits.length, 0)
  s.time(500)
  s.key({ repeat: true })
  assert.equal(s.visits.length, 0)
  s.key()
  s.key({ key: 'ArrowLeft' })
  assert.deepEqual(s.visits, ['https://example.com/songs/1000?name=test&players=4'])
  s.events.pageshow()
  s.key()
  assert.equal(s.visits.length, 1)
  s.time(1000)
  s.key({ key: 'ArrowLeft' })
  assert.equal(s.visits.length, 2)
})

test('ignores editing, controls, composition, modifiers and handled events', () => {
  const s = setup()
  s.time(500)
  for (const event of [
    { target: { isContentEditable: true } },
    { target: { closest: () => ({}) } },
    { isComposing: true }, { defaultPrevented: true },
    { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true },
    { key: 'ArrowDown' },
  ]) s.key(event)
  assert.equal(s.visits.length, 0)
})

test('keeps the player-specific route and stops at the boundary', () => {
  const s = setup('/songs/010/players/3?name=test&page=2', null)
  s.time(500)
  s.config.dataset.next = ''
  s.key()
  assert.equal(s.visits.length, 0)
  s.key({ key: 'ArrowLeft' })
  assert.deepEqual(s.visits, ['https://example.com/songs/001/players/3?name=test'])
})
