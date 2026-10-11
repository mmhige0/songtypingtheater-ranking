// installationToken: 32バイトの乱数をBase64URL（パディングなし43文字）にしたもの
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

// 文字種・長さに加え、復号後32バイトで再エンコードが元と一致する正規形式だけを受理する
// （末尾文字の未使用ビットが0でない別表記を拒否する）
export const isValidInstallationToken = (value: unknown): value is string => {
  if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) return false
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '=')
  if (binary.length !== 32) return false
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return toBase64Url(bytes) === value
}

// 正規形式tokenのUTF-8バイト列に対するSHA-256（16進小文字）。登録とBearer認証で共通
export const hashInstallationToken = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
