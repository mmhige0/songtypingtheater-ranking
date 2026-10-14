import { SONG_BEST_REBUILD_SQL, songBestRefreshSql } from './song-best-sql'

// song_best（曲・人数ごとのランキング1位）を作り直すD1の文。SQLと作り直しが必要な場面はsong-best-sql.ts

export const songBestRefreshStatements = (
  db: D1Database,
  songRefId: number,
  playerCount: number,
  updatedAt: string,
) => [
  db.prepare(songBestRefreshSql[0]).bind(songRefId, playerCount),
  db.prepare(songBestRefreshSql[1]).bind(songRefId, playerCount, updatedAt),
]

export const songBestRebuildStatements = (db: D1Database) => SONG_BEST_REBUILD_SQL.map((sql) => db.prepare(sql))
