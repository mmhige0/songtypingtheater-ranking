import { invalidRequest } from './http'
import { isValidLevel } from './song'
import { isValidText } from './text'

// 閲覧API・画面のクエリパラメーター。空文字（フォームの未入力）は指定なしとして扱う

const MAX_PAGE = 10_000
const MAX_SEARCH_LENGTH = 100

const optional = (value: string | undefined) => (value === undefined || value === '' ? undefined : value)

export const parsePage = (value: string | undefined) => {
  const raw = optional(value)
  if (raw === undefined) return 1
  if (!/^[1-9][0-9]*$/.test(raw) || Number(raw) > MAX_PAGE) {
    throw invalidRequest(`pageは1〜${MAX_PAGE}の整数にしてください`)
  }
  return Number(raw)
}

export const parseLimit = (value: string | undefined, defaultLimit: number, maxLimit: number) => {
  const raw = optional(value)
  if (raw === undefined) return defaultLimit
  if (!/^[1-9][0-9]*$/.test(raw) || Number(raw) > maxLimit) {
    throw invalidRequest(`limitは1〜${maxLimit}の整数にしてください`)
  }
  return Number(raw)
}

export const PLAYER_COUNTS = [1, 2, 3, 4] as const
export type PlayerCount = (typeof PLAYER_COUNTS)[number]

export const parsePlayerCount = (value: string | undefined): PlayerCount | undefined => {
  const raw = optional(value)
  if (raw === undefined) return undefined
  if (!/^[1-4]$/.test(raw)) throw invalidRequest('playersは1〜4にしてください')
  return Number(raw) as PlayerCount
}

export const parseFlag = (value: string | undefined, field: string) => {
  const raw = optional(value)
  if (raw === undefined || raw === '0') return false
  if (raw === '1') return true
  throw invalidRequest(`${field}は0または1にしてください`)
}

// 前後の空白を除いた部分一致検索の文字列。空ならnull
export const parseSearchText = (value: string | undefined, field: string) => {
  const raw = optional(value?.trim())
  if (raw === undefined) return null
  if (!isValidText(raw, 1, MAX_SEARCH_LENGTH)) {
    throw invalidRequest(`${field}は制御文字を含まない${MAX_SEARCH_LENGTH}文字以内にしてください`)
  }
  return raw
}

export const parseLevel = (value: string | undefined) => {
  const raw = optional(value)
  if (raw === undefined) return null
  if (!isValidLevel(raw)) throw invalidRequest('levelは「5」「5+」「5-」の形式、または「-」「?」にしてください')
  return raw
}

export const SONG_SORTS = ['id', 'level'] as const
export type SongSort = (typeof SONG_SORTS)[number]

export const parseSongSort = (value: string | undefined): SongSort => {
  const raw = optional(value)
  if (raw === undefined) return 'id'
  if (!SONG_SORTS.includes(raw as SongSort)) throw invalidRequest('sortはidまたはlevelにしてください')
  return raw as SongSort
}
