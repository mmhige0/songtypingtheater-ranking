import { describe, expect, it } from 'vitest'
import { addDays, jstDate, jstDayRange, pickDailySongs } from '../src/lib/daily'

const songs = (count: number, createdAt = '2026-01-01T00:00:00.000Z') =>
  Array.from({ length: count }, (_, i) => ({ gameSongId: String(i + 1), createdAt }))

describe('JST days', () => {
  it('switches the date at midnight in Japan', () => {
    expect(jstDate(Date.parse('2026-10-13T14:59:59.999Z'))).toBe('2026-10-13')
    expect(jstDate(Date.parse('2026-10-13T15:00:00.000Z'))).toBe('2026-10-14')
  })

  it('returns the received range of a day', () => {
    expect(jstDayRange('2026-10-14')).toEqual({ from: '2026-10-13T15:00:00.000Z', to: '2026-10-14T15:00:00.000Z' })
  })

  it('adds days across months', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('pickDailySongs', () => {
  it('picks the same distinct songs for the same day', () => {
    const first = pickDailySongs(songs(50), '2026-10-14', 4)
    expect(first).toHaveLength(4)
    expect(new Set(first.map((s) => s.gameSongId)).size).toBe(4)
    expect(pickDailySongs(songs(50), '2026-10-14', 4)).toEqual(first)
  })

  it('changes the songs by day', () => {
    const days = ['2026-10-14', '2026-10-15', '2026-10-16'].map((date) =>
      pickDailySongs(songs(50), date, 4)
        .map((s) => s.gameSongId)
        .join(','),
    )
    expect(new Set(days).size).toBe(3)
  })

  it('does not pick songs registered on the day, and keeps the picks when they are added', () => {
    const before = pickDailySongs(songs(50), '2026-10-14', 4)
    const added = [...songs(50), { gameSongId: '51', createdAt: '2026-10-13T15:00:00.000Z' }]
    expect(pickDailySongs(added, '2026-10-14', 4)).toEqual(before)
    expect(pickDailySongs([{ gameSongId: '1', createdAt: '2026-10-13T15:00:00.000Z' }], '2026-10-14', 4)).toEqual([])
  })

  it('picks every song when there are fewer than the count', () => {
    expect(pickDailySongs(songs(3), '2026-10-14', 4).map((s) => s.gameSongId).sort()).toEqual(['1', '2', '3'])
  })
})
