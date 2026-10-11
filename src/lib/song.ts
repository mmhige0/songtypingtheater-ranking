// 数字3〜8桁の文字列。先頭ゼロは保持し、すべてゼロ（000等）は不可
export const isValidGameSongId = (value: string) => /^[0-9]{3,8}$/.test(value) && !/^0+$/.test(value)

const LEVEL_PATTERN = /^([1-9][0-9]?)([+-]?)$/
// 難易度未定（-）・不明（?）。文字列のまま保存し、並べ替え値は持たない
const LEVEL_PLACEHOLDERS = ['-', '?']

export const isValidLevel = (value: string) => LEVEL_PATTERN.test(value) || LEVEL_PLACEHOLDERS.includes(value)

// LyricDataCreatorと同じ算出式: 整数部×3に、+なら+1、-なら-1。-・?はnull
export const toLevelSortValue = (level: string | null): number | null => {
  if (level === null || LEVEL_PLACEHOLDERS.includes(level)) return null
  const match = LEVEL_PATTERN.exec(level)
  if (!match) throw new Error(`invalid level: ${level}`)
  const modifier = match[2] === '+' ? 1 : match[2] === '-' ? -1 : 0
  return Number(match[1]) * 3 + modifier
}
