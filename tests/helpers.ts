import { env } from 'cloudflare:workers'
import { clearActivityCache } from '../src/lib/activity'
import { clearSongCache } from '../src/lib/song-query'

// テスト間でD1のデータは共有されるため、各テストの前に全テーブルを空にする（曲一覧・トップの集計のキャッシュも消す）
export const resetDb = () => {
  clearSongCache()
  clearActivityCache()
  return env.DB.batch(
    ['play_participant', 'play', 'legacy_identity_mapping', 'player', 'song'].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  )
}
