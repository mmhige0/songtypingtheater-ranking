import { applyD1Migrations, type D1Migration } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

declare global {
  // Cloudflare.Envへのテスト用バインディング追加には名前空間の拡張が必要
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
