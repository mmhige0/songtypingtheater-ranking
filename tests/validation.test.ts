import { describe, expect, it } from 'vitest'
import { isValidGameSongId, isValidLevel, toLevelSortValue } from '../src/lib/song'
import { isValidText } from '../src/lib/text'

describe('isValidText', () => {
  it('counts Unicode scalar values, not UTF-16 code units', () => {
    expect(isValidText('😀'.repeat(200), 1, 200)).toBe(true)
    expect(isValidText('😀'.repeat(201), 1, 200)).toBe(false)
  })

  it.each([
    ['empty', ''],
    ['newline', 'a\nb'],
    ['tab', 'a\tb'],
    ['DEL', 'a\u007fb'],
    ['line separator', 'a\u2028b'],
    ['lone surrogate', 'a\ud800b'],
    ['non-string', 1],
  ])('rejects %s', (_, value) => {
    expect(isValidText(value, 1, 200)).toBe(false)
  })

  it('accepts Japanese, quotes and HTML-like text as plain strings', () => {
    expect(isValidText('<b>"架空" & 曲</b>', 1, 200)).toBe(true)
  })
})

describe('isValidGameSongId', () => {
  it.each(['001', '1000', '0123', '12345678'])('accepts %s', (id) => {
    expect(isValidGameSongId(id)).toBe(true)
  })

  it.each(['000', '0000', '12', '123456789', 'abc', '１２３', ' 001'])('rejects %s', (id) => {
    expect(isValidGameSongId(id)).toBe(false)
  })
})

describe('level', () => {
  it.each(['1', '5+', '5-', '10', '99+', '-', '?'])('accepts %s', (level) => {
    expect(isValidLevel(level)).toBe(true)
  })

  it.each(['0', '05', '100', ' 5', '5 ', '5++', '+5', '', '--', '-5', '+', '？', '??', ' -'])('rejects %j', (level) => {
    expect(isValidLevel(level)).toBe(false)
  })

  it('computes the sort value with the LyricDataCreator formula', () => {
    expect(toLevelSortValue('5')).toBe(15)
    expect(toLevelSortValue('5+')).toBe(16)
    expect(toLevelSortValue('5-')).toBe(14)
    expect(toLevelSortValue(null)).toBeNull()
    expect(toLevelSortValue('-')).toBeNull()
    expect(toLevelSortValue('?')).toBeNull()
  })
})
