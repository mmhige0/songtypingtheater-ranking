import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'))

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // .dev.varsの値に左右されないよう、トップとランキングのオリジンは本番の値に固定する
          bindings: {
            TEST_MIGRATIONS: migrations,
            ADMIN_API_KEY: 'test-admin-key',
            TOP_ORIGIN: 'https://kayomodoki.com',
            RANKING_ORIGIN: 'https://ranking.kayomodoki.com',
          },
          // 機能テストが同じIP・プレイヤーで多数送信するため上限を緩める。429の動作はtests/rate-limit.test.tsで確認
          ratelimits: Object.fromEntries(
            ['PLAYS_IP_LIMITER', 'PLAYS_PLAYER_LIMITER', 'INSTALLATIONS_IP_LIMITER', 'VIEW_IP_LIMITER'].map((name, i) => [
              name,
              { namespace_id: String(1001 + i), simple: { limit: 100_000, period: 60 as const } },
            ]),
          ),
        },
      }),
    ],
    test: {
      setupFiles: ['./tests/apply-migrations.ts'],
    },
  }
})
