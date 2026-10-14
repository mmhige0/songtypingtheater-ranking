import { env } from 'cloudflare:workers'
import { clearDailyCache } from '../src/lib/daily'
import { clearPopularSongsCache } from '../src/lib/popular-songs'
import { clearSongCache } from '../src/lib/song-query'

// テスト間でD1のデータは共有されるため、各テストの前に全テーブルを空にする（曲一覧・トップの集計のキャッシュも消す）
export const resetDb = () => {
  clearSongCache()
  clearPopularSongsCache()
  clearDailyCache()
  return env.DB.batch(
    ['song_best', 'play_participant', 'play', 'legacy_identity_mapping', 'player', 'song'].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  )
}
