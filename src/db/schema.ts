import { sql } from 'drizzle-orm'
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// 日時はミリ秒付きUTCのISO 8601文字列（例: 2026-10-10T13:00:02.120Z）。真偽値は0/1、不明はnull。

export const SONG_STATUSES = ['approved', 'pending', 'rejected', 'withdrawn'] as const
export const PLAYER_COLORS = ['R', 'B', 'Y', 'G'] as const
export const LEGACY_MAPPING_STATUSES = ['pending', 'confirmed'] as const

export const songs = sqliteTable(
  'song',
  {
    id: integer('id').primaryKey(),
    // 将来の未承認曲はnull。null以外は一意
    gameSongId: text('game_song_id'),
    title: text('title').notNull(),
    artist: text('artist'),
    level: text('level'),
    levelSortValue: integer('level_sort_value'),
    status: text('status', { enum: SONG_STATUSES }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('song_game_song_id_unique').on(t.gameSongId),
    // 曲番号順の一覧（4桁以上・先頭ゼロ混在でも数値順）を全件走査せずに取得する
    index('song_status_game_song_number_idx').on(t.status, sql`CAST(${t.gameSongId} AS INTEGER)`, t.gameSongId),
    index('song_status_level_sort_value_idx').on(t.status, t.levelSortValue),
    check('song_status_check', sql`${t.status} IN ('approved', 'pending', 'rejected', 'withdrawn')`),
    check('song_approved_has_game_song_id', sql`${t.status} <> 'approved' OR ${t.gameSongId} IS NOT NULL`),
  ],
)

// 新規はUUIDv4、移行用は`legacy-`で始まるID。playerId自体は認証情報ではない
export const players = sqliteTable(
  'player',
  {
    playerId: text('player_id').primaryKey(),
    // 正規形式tokenのUTF-8に対するSHA-256（16進小文字）。nullは初回登録なし（移行用）
    tokenHash: text('token_hash'),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('player_token_hash_unique').on(t.tokenHash)],
)

export const plays = sqliteTable(
  'play',
  {
    playId: text('play_id').primaryKey(),
    songRefId: integer('song_ref_id')
      .notNull()
      .references(() => songs.id),
    score: integer('score').notNull(),
    isFullCombo: integer('is_full_combo', { mode: 'boolean' }),
    isTaipen: integer('is_taipen', { mode: 'boolean' }),
    receivedAt: text('received_at').notNull(),
    gameVersion: text('game_version'),
    // nullの記録を移行分とみなす（APIは必須）
    hostPlayerId: text('host_player_id').references(() => players.playerId),
    playerCount: integer('player_count').notNull(),
    // ソートした参加者ID配列の空白なしJSON
    teamKey: text('team_key').notNull(),
    excludedAt: text('excluded_at'),
  },
  (t) => [
    index('play_team_best_idx').on(t.songRefId, t.playerCount, t.teamKey, t.score),
    index('play_ranking_idx').on(t.songRefId, t.playerCount, t.score),
    // トップの新着記録を新しい順に読み、件数がそろった時点で止める
    index('play_received_at_idx').on(t.receivedAt),
    check('play_score_range', sql`${t.score} BETWEEN 0 AND 2147483647`),
    check('play_player_count_range', sql`${t.playerCount} BETWEEN 1 AND 4`),
    check('play_is_full_combo_bool', sql`${t.isFullCombo} IN (0, 1)`),
    check('play_is_taipen_bool', sql`${t.isTaipen} IN (0, 1)`),
    check('play_taipen_four_players', sql`${t.isTaipen} IS NOT 1 OR ${t.playerCount} = 4`),
  ],
)

export const playParticipants = sqliteTable(
  'play_participant',
  {
    playId: text('play_id')
      .notNull()
      .references(() => plays.playId, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => players.playerId),
    nameAtPlay: text('name_at_play').notNull(),
    // 表示順はR→B→Y→G。移行分はシート上の並び順に割り当てた仮の色
    colorAtPlay: text('color_at_play', { enum: PLAYER_COLORS }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.playId, t.playerId] }),
    uniqueIndex('play_participant_play_color_unique').on(t.playId, t.colorAtPlay),
    index('play_participant_player_idx').on(t.playerId),
    check('play_participant_color_check', sql`${t.colorAtPlay} IN ('R', 'B', 'Y', 'G')`),
  ],
)

// 曲・人数ごとのランキング1位（記録の集計結果）。曲一覧・閲覧APIはこれを読む。
// 作り直しはsrc/lib/song-best.ts。記録のない曲・人数の行は持たない
export const songBests = sqliteTable(
  'song_best',
  {
    songRefId: integer('song_ref_id')
      .notNull()
      .references(() => songs.id),
    playerCount: integer('player_count').notNull(),
    score: integer('score').notNull(),
    // 1位の記録のFC。nullは不明（移行分）
    isFullCombo: integer('is_full_combo', { mode: 'boolean' }),
    // その曲・人数の記録に1件でもFCがあるか
    hasFullCombo: integer('has_full_combo', { mode: 'boolean' }).notNull(),
    // 同点1位のほかの組数
    tiedOthers: integer('tied_others').notNull(),
    // 1位の組の参加者の[{name, color}]（記録時点の名前。色の順は問わない）
    participants: text('participants').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.songRefId, t.playerCount] })],
)

// 曲・人数・チームごとの最高記録とFC最高点。playのトリガーで同一トランザクション内に更新する。
// 参加者の名前・色も保持し、全員の保存後に参加者表のトリガーで反映する。期間指定・FC限定は履歴を使う。
export const teamBests = sqliteTable(
  'team_best',
  {
    songRefId: integer('song_ref_id').notNull().references(() => songs.id),
    playerCount: integer('player_count').notNull(),
    teamKey: text('team_key').notNull(),
    // playへの外部キーは付けない。代表削除時はAFTER DELETEトリガーで次点に置き換える。
    playId: text('play_id').notNull(),
    score: integer('score').notNull(),
    isFullCombo: integer('is_full_combo', { mode: 'boolean' }),
    receivedAt: text('received_at').notNull(),
    hostPlayerId: text('host_player_id'),
    bestFcScore: integer('best_fc_score'),
    participants: text('participants').notNull().default('[]'),
  },
  (t) => [primaryKey({ columns: [t.songRefId, t.playerCount, t.teamKey] })],
)

export const legacyIdentityMappings = sqliteTable(
  'legacy_identity_mapping',
  {
    legacyPlayerId: text('legacy_player_id')
      .primaryKey()
      .references(() => players.playerId),
    newPlayerId: text('new_player_id')
      .notNull()
      .references(() => players.playerId),
    status: text('status', { enum: LEGACY_MAPPING_STATUSES }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('legacy_identity_mapping_new_player_idx').on(t.newPlayerId),
    check('legacy_identity_mapping_status_check', sql`${t.status} IN ('pending', 'confirmed')`),
  ],
)
