import { describe, expect, it } from 'vitest'
import { toTeamKey } from '../src/lib/team-key'

const A = '428d19c3-786c-4650-81c1-06848583d7fa'
const B = 'f3e1a5de-d740-43d2-bce1-cd513c9b6790'
const C = '0b5c7a4e-1f2d-4e8a-9c3b-6d7e8f9a0b1c'

describe('toTeamKey', () => {
  it('is the same for A+B and B+A', () => {
    expect(toTeamKey([A, B])).toBe(toTeamKey([B, A]))
  })

  it('differs between A+B and A+C', () => {
    expect(toTeamKey([A, B])).not.toBe(toTeamKey([A, C]))
  })

  it('is a JSON array without whitespace', () => {
    expect(toTeamKey([B, A])).toBe(`["${A}","${B}"]`)
  })

  it('does not mutate the input', () => {
    const ids = [B, A]
    toTeamKey(ids)
    expect(ids).toEqual([B, A])
  })
})
