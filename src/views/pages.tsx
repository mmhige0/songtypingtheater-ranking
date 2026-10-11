import type { BestScore, BestScores, RankingPage, SoloBestScore } from '../lib/ranking'
import type { SongSummary } from '../lib/song-query'
import { PLAYER_COUNTS, type PlayerCount, type SongSort } from '../lib/view-query'
import { formatScore, Pagination, RankingTable, toQuery } from './components'
import { Layout } from './layout'

// 1ページ目はpageを付けない
const pageParam = (page: number) => (page === 1 ? null : page)

const songPath = (gameSongId: string) => `/songs/${encodeURIComponent(gameSongId)}`

const SongMeta = ({ song }: { song: SongSummary }) => (
  <p class="page-meta">
    <span class="num">No.{song.gameSongId}</span>
    {song.artist !== null && <> ・ {song.artist}</>}
    {song.level !== null && <> ・ Lv.{song.level}</>}
  </p>
)

// プレイヤー名検索とFC絞り込みのフォーム。曲別ランキングではタブのラジオボタンもform属性でこのフォームに含める
const RankingFilters = ({
  id,
  action,
  name,
  fullComboOnly,
  clearHref,
}: {
  id?: string
  action: string
  name: string | null
  fullComboOnly: boolean
  clearHref: string
}) => (
  <form id={id} class="box filters" method="get" action={action} role="search">
    <input type="search" name="name" value={name ?? ''} placeholder="プレイヤー名で検索" aria-label="プレイヤー名" />
    <label class="chip">
      <input type="checkbox" name="fc" value="1" checked={fullComboOnly} />
      フルコンボのみ
    </label>
    <button class="button" type="submit">
      検索
    </button>
    {(fullComboOnly || name !== null) && (
      <a class="clear-link" href={clearHref}>
        条件をクリア
      </a>
    )}
  </form>
)

// ---- 曲一覧 ----

export type SongListProps = {
  songs: (SongSummary & { bestScores: BestScores })[]
  levels: string[]
  q: string | null
  level: string | null
  sort: SongSort
  page: number
  limit: number
  total: number
}

const BestCell = ({ song, count, best }: { song: SongSummary; count: PlayerCount; best: BestScore | null }) => {
  const solo = count === 1 ? (best as SoloBestScore | null) : null
  return (
    <div class="best">
      <dt>{count}人</dt>
      <dd>
        {best === null ? (
          <span class="muted">—</span>
        ) : (
          <a class="num" href={`${songPath(song.gameSongId)}${toQuery({ players: count })}`}>
            {formatScore(best.score)}
          </a>
        )}
      </dd>
      {solo && (
        <dd class="small muted">
          {solo.name}
          {solo.tiedOthers > 0 && <span class="nowrap"> ほか{solo.tiedOthers}名</span>}
        </dd>
      )}
    </div>
  )
}

export const SongListPage = ({ songs, levels, q, level, sort, page, limit, total }: SongListProps) => {
  const hasFilter = q !== null || level !== null
  const sortHref = (value: SongSort) => `/${toQuery({ q, level, sort: value === 'id' ? null : value })}`
  return (
    <Layout title="">
      <h1 class="page-title">曲一覧</h1>
      <form class="box filters" method="get" action="/" role="search">
        {sort !== 'id' && <input type="hidden" name="sort" value={sort} />}
        <input type="search" name="q" value={q ?? ''} placeholder="曲名・アーティスト名で検索" aria-label="曲名・アーティスト" />
        <select name="level" aria-label="難易度">
          <option value="">すべてのLv.</option>
          {levels.map((value) => (
            <option value={value} selected={value === level}>
              Lv.{value}
            </option>
          ))}
        </select>
        <button class="button" type="submit">
          検索
        </button>
        <nav class="chips" aria-label="並べ替え">
          <a class={sort === 'id' ? 'chip active' : 'chip'} href={sortHref('id')}>
            No.
          </a>
          <a class={sort === 'level' ? 'chip active' : 'chip'} href={sortHref('level')}>
            Lv.
          </a>
        </nav>
        {hasFilter && (
          <a class="clear-link" href={`/${toQuery({ sort: sort === 'id' ? null : sort })}`}>
            条件をクリア
          </a>
        )}
      </form>

      {songs.length === 0 ? (
        <p class="empty-box">{hasFilter ? '条件に一致する曲がありません' : '曲はまだ登録されていません'}</p>
      ) : (
        <ul class="song-grid">
          {songs.map((song) => (
            <li class="box song-card">
              <div class="song-head">
                <span class="song-no num">No.{song.gameSongId}</span>
                <span class="song-level">Lv.{song.level ?? '—'}</span>
              </div>
              <a class="song-title" href={songPath(song.gameSongId)} title={song.title}>
                {song.title}
              </a>
              <div class="song-artist">{song.artist ?? '—'}</div>
              <dl class="bests" aria-label="人数別の最高スコア">
                {PLAYER_COUNTS.map((count) => (
                  <BestCell song={song} count={count} best={song.bestScores[String(count) as keyof BestScores]} />
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        limit={limit}
        total={total}
        href={(p) => `/${toQuery({ q, level, sort: sort === 'id' ? null : sort, page: pageParam(p) })}`}
      />
    </Layout>
  )
}

// ---- 曲別ランキング（1〜4人） ----

export type SongRankingProps = {
  song: SongSummary
  rankings: Map<PlayerCount, RankingPage>
  selected: PlayerCount
  fullComboOnly: boolean
  name: string | null
  limit: number
}

const emptyMessage = (filtered: boolean) => (filtered ? '条件に一致する記録はありません' : '記録はまだありません')

export const SongRankingPage = ({ song, rankings, selected, fullComboOnly, name, limit }: SongRankingProps) => (
  <Layout title={song.title}>
    <h1 class="page-title">{song.title}</h1>
    <SongMeta song={song} />
    <RankingFilters
      id="filters"
      action={songPath(song.gameSongId)}
      name={name}
      fullComboOnly={fullComboOnly}
      clearHref={`${songPath(song.gameSongId)}${toQuery({ players: selected === 1 ? null : selected })}`}
    />

    <div class="rankings">
      {/* 狭い画面のタブ。検索フォームと一緒に送信し、選択中の人数を保つ */}
      {PLAYER_COUNTS.map((count) => (
        <input
          class="tab-input"
          type="radio"
          id={`tab-${count}`}
          name="players"
          value={String(count)}
          form="filters"
          checked={count === selected}
        />
      ))}
      <div class="tabs chips" role="presentation">
        {PLAYER_COUNTS.map((count) => (
          <label class="chip" for={`tab-${count}`}>
            {count}人
          </label>
        ))}
      </div>
      <div class="panels">
        {PLAYER_COUNTS.map((count) => {
          const ranking = rankings.get(count)!
          return (
            <section class={`box panel panel-${count}`} aria-label={`${count}人ランキング`}>
              <h2 class="panel-title">{count}人</h2>
              <RankingTable entries={ranking.entries} emptyMessage={emptyMessage(fullComboOnly || name !== null)} />
              {ranking.total > limit && (
                <a
                  class="panel-more"
                  href={`${songPath(song.gameSongId)}/players/${count}${toQuery({ fc: fullComboOnly, name })}`}
                >
                  すべて見る（{ranking.total}件）
                </a>
              )}
            </section>
          )
        })}
      </div>
    </div>
  </Layout>
)

// ---- 人数別ランキング（ページ送り） ----

export type PlayerRankingProps = {
  song: SongSummary
  players: PlayerCount
  ranking: RankingPage
  fullComboOnly: boolean
  name: string | null
  page: number
  limit: number
}

export const PlayerRankingPage = ({ song, players, ranking, fullComboOnly, name, page, limit }: PlayerRankingProps) => {
  const path = `${songPath(song.gameSongId)}/players/${players}`
  return (
    <Layout title={`${song.title}（${players}人）`}>
      <a class="back-link" href={`${songPath(song.gameSongId)}${toQuery({ players, fc: fullComboOnly, name })}`}>
        ← 1〜4人のランキングへ
      </a>
      <h1 class="page-title">
        {song.title}（{players}人）
      </h1>
      <SongMeta song={song} />
      <RankingFilters action={path} name={name} fullComboOnly={fullComboOnly} clearHref={path} />
      <section class="box">
        <RankingTable entries={ranking.entries} emptyMessage={emptyMessage(fullComboOnly || name !== null)} />
      </section>
      <Pagination
        page={page}
        limit={limit}
        total={ranking.total}
        href={(p) => `${path}${toQuery({ fc: fullComboOnly, name, page: pageParam(p) })}`}
      />
    </Layout>
  )
}

// ---- エラー ----

export const ErrorPage = ({ title, message }: { title: string; message: string }) => (
  <Layout title={title}>
    <div class="box filters">
      <div>
        <h1 class="page-title">{title}</h1>
        <p>{message}</p>
        <a class="button button-outline" href="/">
          曲一覧へ戻る
        </a>
      </div>
    </div>
  </Layout>
)
