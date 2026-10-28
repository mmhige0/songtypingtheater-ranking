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
  const document = {
    getElementById: () => ({ dataset: { songId: path.split('/')[2].split('?')[0] } }),
    querySelector: () => selected ? { value: selected } : null,
    addEventListener: (event, callback) => { events[event] = callback },
  }
  const window = {
    location: { href: 'https://example.com' + path, assign: url => visits.push(url) },
    addEventListener: (event, callback) => { events[event] = callback },
  }
  // fetchを与えない。存在確認・隣接曲問い合わせを追加するとテストが失敗する。
  runInNewContext(script, { document, window, URL, encodeURIComponent, Date: { now: () => now } })
  return {
    visits, events,
    time: value => { now = value },
    key: (overrides = {}) => events.keydown({ key: 'ArrowRight', preventDefault() {}, ...overrides }),
  }
}

test('navigates directly without fetching, blocks repeats/rapid input, and preserves filters/current tab', () => {
  const s = setup()
  assert.equal(s.visits.length, 0)
  s.key()
  s.time(500)
  s.key({ repeat: true })
  assert.equal(s.visits.length, 0)
  s.key()
  s.key({ key: 'ArrowLeft' })
  assert.deepEqual(s.visits, ['https://example.com/songs/011?name=test&players=4'])
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

test('keeps the player-specific route and resets the ranking page number', () => {
  const s = setup('/songs/010/players/3?name=test&page=2', null)
  s.time(500)
  s.key({ key: 'ArrowLeft' })
  assert.deepEqual(s.visits, ['https://example.com/songs/009/players/3?name=test'])
})

test('increments/decrements across digit boundaries with at least three digits', () => {
  for (const [current, key, expected] of [
    ['009', 'ArrowRight', '010'], ['010', 'ArrowLeft', '009'],
    ['999', 'ArrowRight', '1000'], ['1000', 'ArrowLeft', '999'],
  ]) {
    const s = setup('/songs/' + current)
    s.time(500)
    s.key({ key })
    assert.equal(new URL(s.visits[0]).pathname, '/songs/' + expected)
  }
})

test('stops at 001 and at the eight-digit format limit', () => {
  for (const [current, key] of [['001', 'ArrowLeft'], ['99999999', 'ArrowRight']]) {
    const s = setup('/songs/' + current)
    s.time(500)
    s.key({ key })
    assert.equal(s.visits.length, 0)
  }
})


test('can move forward from 001 and return to 001', () => {
  for (const [current, key, expected] of [['001', 'ArrowRight', '002'], ['002', 'ArrowLeft', '001']]) {
    const s = setup('/songs/' + current)
    s.time(500)
    s.key({ key })
    assert.equal(new URL(s.visits[0]).pathname, '/songs/' + expected)
  }
})
