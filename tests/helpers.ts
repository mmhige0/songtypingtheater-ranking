import { env } from 'cloudflare:workers'

// テスト間でD1のデータは共有されるため、各テストの前に全テーブルを空にする
export const resetDb = () =>
  env.DB.batch(
    ['play_participant', 'play', 'legacy_identity_mapping', 'player', 'song'].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  )
