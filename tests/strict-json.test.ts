import { describe, expect, it } from 'vitest'
import { parseStrictJson, StrictJsonError } from '../src/lib/strict-json'

describe('parseStrictJson', () => {
  it('parses the same values as JSON.parse', () => {
    const text = '{"a":[1,-2.5e3,true,false,null],"b":{"c":"\\u3042\\n\\"x\\""},"d":[]}'
    expect(parseStrictJson(text)).toEqual(JSON.parse(text))
  })

  it('allows surrounding whitespace', () => {
    expect(parseStrictJson(' \n{ "a" : 1 }\t')).toEqual({ a: 1 })
  })

  it.each([
    ['top level', '{"a":1,"a":2}'],
    ['nested', '{"a":{"b":1,"b":1}}'],
    ['inside array', '[{"x":1,"x":2}]'],
    ['escaped spelling', '{"a":1,"\\u0061":2}'],
  ])('rejects duplicate keys (%s)', (_, text) => {
    expect(() => parseStrictJson(text)).toThrow(/重複/)
  })

  it.each([
    ['trailing comma', '{"a":1,}'],
    ['single quotes', "{'a':1}"],
    ['leading zero', '01'],
    ['raw control character in string', '"a\u0001b"'],
    ['invalid escape', '"\\x41"'],
    ['trailing garbage', '{"a":1} x'],
    ['empty input', ''],
    ['NaN', 'NaN'],
  ])('rejects invalid JSON (%s)', (_, text) => {
    expect(() => parseStrictJson(text)).toThrow(StrictJsonError)
  })

  it('rejects deeply nested input', () => {
    expect(() => parseStrictJson('['.repeat(100) + ']'.repeat(100))).toThrow(/深すぎ/)
  })

  it('keeps "__proto__" as an ordinary key', () => {
    const value = parseStrictJson('{"__proto__":{"polluted":true}}') as Record<string, unknown>
    expect(Object.keys(value)).toEqual(['__proto__'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
