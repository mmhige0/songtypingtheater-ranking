// 制御文字（改行・タブを含む）と行区切り・段落区切り
const FORBIDDEN_CHARS = /[\p{Cc}\u2028\u2029]/u
// uフラグ付きでは対になったサロゲートは1文字として扱われるため、これに一致するのは単独のサロゲートだけ
const LONE_SURROGATE = /[\uD800-\uDFFF]/u

export const countScalarValues = (value: string) => [...value].length

// 長さはUnicode scalar valueの数で数える（見た目の文字数・UTF-16コード単位数とは異なる）
export const isValidText = (value: unknown, min: number, max: number): value is string => {
  if (typeof value !== 'string') return false
  if (LONE_SURROGATE.test(value) || FORBIDDEN_CHARS.test(value)) return false
  const length = countScalarValues(value)
  return length >= min && length <= max
}
