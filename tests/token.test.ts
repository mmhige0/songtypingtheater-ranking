import { describe, expect, it } from 'vitest'
import { hashInstallationToken, isValidInstallationToken } from '../src/lib/token'
import { normalizeUuidV4 } from '../src/lib/uuid'

// 架空のtoken（32バイト・Base64URL・パディングなし）
const TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'

describe('isValidInstallationToken', () => {
  it('accepts a canonical 43-character Base64URL token', () => {
    expect(isValidInstallationToken(TOKEN)).toBe(true)
    expect(isValidInstallationToken('-_' + 'A'.repeat(41))).toBe(true)
  })

  it.each([
    ['42 characters', TOKEN.slice(0, 42)],
    ['44 characters', TOKEN + 'A'],
    ['padding', TOKEN.slice(0, 42) + '='],
    ['standard Base64 characters', '+/' + TOKEN.slice(2)],
    ['non-canonical last character', TOKEN.slice(0, 42) + '9'],
    ['whitespace', ` ${TOKEN.slice(1)}`],
    ['non-string', 123],
  ])('rejects %s', (_, value) => {
    expect(isValidInstallationToken(value)).toBe(false)
  })
})

describe('hashInstallationToken', () => {
  it('returns the lowercase hex SHA-256 of the token string', async () => {
    const hash = await hashInstallationToken(TOKEN)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashInstallationToken(TOKEN)).toBe(hash)
    expect(await hashInstallationToken('B' + TOKEN.slice(1))).not.toBe(hash)
  })
})

describe('normalizeUuidV4', () => {
  it('lowercases a valid UUIDv4', () => {
    expect(normalizeUuidV4('428D19C3-786C-4650-81C1-06848583D7FA')).toBe('428d19c3-786c-4650-81c1-06848583d7fa')
  })

  it.each([
    ['UUIDv1', 'a978c461-3a06-187d-80c8-552eb969031a'],
    ['bad variant', 'a978c461-3a06-487d-c0c8-552eb969031a'],
    ['legacy id', 'legacy-0001'],
    ['braces', '{a978c461-3a06-487d-80c8-552eb969031a}'],
    ['non-string', 1],
  ])('rejects %s', (_, value) => {
    expect(normalizeUuidV4(value)).toBeNull()
  })
})
