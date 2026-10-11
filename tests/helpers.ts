import { env } from 'cloudflare:workers'
import { clearSongCache } from '../src/lib/song-query'

// テスト間でD1のデータは共有されるため、各テストの前に全テーブルを空にする（曲一覧のキャッシュも消す）
export const resetDb = () => {
  clearSongCache()
  return env.DB.batch(
    ['play_participant', 'play', 'legacy_identity_mapping', 'player', 'song'].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  )
}
