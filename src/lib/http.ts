import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { parseStrictJson, StrictJsonError } from './strict-json'

export const MAX_BODY_BYTES = 16 * 1024

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_TOKEN'
  | 'REVOKED_TOKEN'
  | 'PLAYER_ID_ALREADY_REGISTERED'
  | 'TOKEN_ALREADY_REGISTERED'
  | 'DUPLICATE_PLAYER_ID'
  | 'DUPLICATE_COLOR'
  | 'HOST_ID_MISMATCH'
  | 'UNKNOWN_SONG'
  | 'UNKNOWN_PLAYER'
  | 'INVALID_TAIPEN_PLAYER_COUNT'
  | 'SCORE_OUT_OF_RANGE'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'

export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message)
  }
}

export const errorResponse = (
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
  headers: Record<string, string> = {},
) =>
  c.json(
    {
      error: { code, message, retryable: status === 429 || status >= 500 },
      requestId: crypto.randomUUID(),
    },
    status,
    headers,
  )

export const invalidRequest = (message: string) => new ApiError(400, 'INVALID_REQUEST', message)

const BEARER = /^Bearer ([\x21-\x7e]+)$/

// `Bearer <値>`の値を返す。複数のAuthorizationヘッダーは", "で連結されるため一致しない
export const readBearerToken = (c: Context): string | undefined =>
  BEARER.exec(c.req.header('Authorization') ?? '')?.[1]

// application/jsonで、charsetを指定する場合はutf-8だけを受理する。
// パラメーター値は引用符付き（charset="utf-8"）も有効（RFC 9110 5.6.6）
export const isJsonContentType = (header: string | undefined) => {
  if (!header) return false
  const [mediaType, ...params] = header.split(';').map((part) => part.trim().toLowerCase())
  if (mediaType !== 'application/json') return false
  return params.every((param) => {
    if (!param.startsWith('charset=')) return true
    const value = param.slice('charset='.length)
    const unquoted = value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
    return unquoted === 'utf-8'
  })
}

const readBodyWithLimit = async (request: Request): Promise<Uint8Array> => {
  const declared = Number(request.headers.get('Content-Length'))
  if (declared > MAX_BODY_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '本文が16 KiBを超えています')
  if (!request.body) return new Uint8Array()

  const chunks: Uint8Array[] = []
  let total = 0
  const reader = request.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '本文が16 KiBを超えています')
    }
    chunks.push(value)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

// Content-Type・本文サイズ・UTF-8・JSON構文（重複キーを含む）を検証して本文を返す
export const readJsonBody = async (c: Context): Promise<unknown> => {
  if (!isJsonContentType(c.req.header('Content-Type'))) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Typeはapplication/jsonにしてください')
  }

  const bytes = await readBodyWithLimit(c.req.raw)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  } catch {
    throw invalidRequest('本文がUTF-8ではありません')
  }

  try {
    return parseStrictJson(text)
  } catch (error) {
    if (error instanceof StrictJsonError) throw invalidRequest(`JSONが不正です: ${error.message}`)
    throw error
  }
}

// 本文がちょうど指定したキーを持つオブジェクトであることを確認する
export const expectExactObject = <K extends string>(value: unknown, keys: readonly K[]): Record<K, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidRequest('本文はJSONオブジェクトにしてください')
  }
  const unknownKeys = Object.keys(value).filter((key) => !keys.includes(key as K))
  if (unknownKeys.length > 0) throw invalidRequest(`不明なフィールドがあります: ${unknownKeys.join(', ')}`)
  const missingKeys = keys.filter((key) => !Object.hasOwn(value, key))
  if (missingKeys.length > 0) throw invalidRequest(`必須フィールドがありません: ${missingKeys.join(', ')}`)
  return value as Record<K, unknown>
}
