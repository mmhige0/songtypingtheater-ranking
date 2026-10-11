const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// UUIDv4なら小文字に正規化して返し、それ以外はnull
export const normalizeUuidV4 = (value: unknown): string | null =>
  typeof value === 'string' && UUID_V4.test(value) ? value.toLowerCase() : null
