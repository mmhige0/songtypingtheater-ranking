import { describe, expect, it } from 'vitest'
import { isJsonContentType } from '../src/lib/http'

describe('isJsonContentType', () => {
  it.each([
    'application/json',
    'application/json; charset=utf-8',
    'application/json; charset=UTF-8',
    'application/json; charset="utf-8"',
    'Application/JSON;charset="UTF-8"',
  ])('accepts %s', (header) => {
    expect(isJsonContentType(header)).toBe(true)
  })

  it.each([
    undefined,
    '',
    'text/json',
    'text/plain',
    'application/json; charset=iso-8859-1',
    'application/json; charset="iso-8859-1"',
    'application/json; charset=""',
    'application/json; charset="utf-8',
  ])('rejects %s', (header) => {
    expect(isJsonContentType(header)).toBe(false)
  })
})
