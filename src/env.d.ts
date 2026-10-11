// `wrangler secret`で設定する値は`wrangler types`の生成対象にならないため、ここで型を補う
interface Env {
  ADMIN_API_KEY?: string
}

declare namespace Cloudflare {
  interface Env {
    ADMIN_API_KEY?: string
  }
}
