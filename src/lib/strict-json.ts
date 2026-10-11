// 重複キーを拒否するJSONパーサー。JSON.parseは重複キーを後勝ちで上書きするため使えない。
// 文字列・数値リテラルの解釈はJSON.parseに任せ、構造の走査と重複検出だけを行う。

export class StrictJsonError extends Error {}

const MAX_DEPTH = 32
const WHITESPACE = /[ \t\n\r]*/y
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y
// JSONの文字列はU+0000〜U+001Fの生の制御文字を含められない
// eslint-disable-next-line no-control-regex
const STRING = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y

export const parseStrictJson = (text: string): unknown => {
  let pos = 0

  const fail = (message: string): never => {
    throw new StrictJsonError(`${message}（位置 ${pos}）`)
  }

  const skipWhitespace = () => {
    WHITESPACE.lastIndex = pos
    WHITESPACE.exec(text)
    pos = WHITESPACE.lastIndex
  }

  const match = (pattern: RegExp): string | null => {
    pattern.lastIndex = pos
    const result = pattern.exec(text)
    if (!result) return null
    pos = pattern.lastIndex
    return result[0]
  }

  const parseString = (): string => {
    const literal = match(STRING)
    if (literal === null) return fail('文字列が不正です')
    return JSON.parse(literal) as string
  }

  const parseValue = (depth: number): unknown => {
    if (depth > MAX_DEPTH) fail('入れ子が深すぎます')
    skipWhitespace()
    const char = text[pos]

    if (char === '{') {
      pos += 1
      const object: Record<string, unknown> = Object.create(null)
      skipWhitespace()
      if (text[pos] === '}') {
        pos += 1
        return object
      }
      for (;;) {
        skipWhitespace()
        if (text[pos] !== '"') fail('キーが必要です')
        const key = parseString()
        if (Object.hasOwn(object, key)) fail(`キー"${key}"が重複しています`)
        skipWhitespace()
        if (text[pos] !== ':') fail('":"が必要です')
        pos += 1
        object[key] = parseValue(depth + 1)
        skipWhitespace()
        if (text[pos] === ',') {
          pos += 1
          continue
        }
        if (text[pos] === '}') {
          pos += 1
          return object
        }
        fail('","または"}"が必要です')
      }
    }

    if (char === '[') {
      pos += 1
      const array: unknown[] = []
      skipWhitespace()
      if (text[pos] === ']') {
        pos += 1
        return array
      }
      for (;;) {
        array.push(parseValue(depth + 1))
        skipWhitespace()
        if (text[pos] === ',') {
          pos += 1
          continue
        }
        if (text[pos] === ']') {
          pos += 1
          return array
        }
        fail('","または"]"が必要です')
      }
    }

    if (char === '"') return parseString()

    for (const [literal, value] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (text.startsWith(literal, pos)) {
        pos += literal.length
        return value
      }
    }

    const number = match(NUMBER)
    if (number !== null) return Number(number)

    return fail('値が不正です')
  }

  const value = parseValue(0)
  skipWhitespace()
  if (pos !== text.length) fail('JSONの後に余分な文字があります')
  return value
}
