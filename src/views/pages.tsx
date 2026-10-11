import type { BestScore, BestScores, RankingPage, SoloBestScore } from '../lib/ranking'
import type { SongSummary } from '../lib/song-query'
import { PLAYER_COUNTS, type PlayerCount, type SongSort } from '../lib/view-query'
import { formatScore, Pagination, RankingTable, toQuery } from './components'
import { Layout, SITE_NAME } from './layout'

// 1ページ目はpageを付けない
const pageParam = (page: number) => (page === 1 ? null : page)

const songPath = (gameSongId: string) => `/songs/${encodeURIComponent(gameSongId)}`

const SongMeta = ({ song }: { song: SongSummary }) => (
  <p class="song-meta">
    曲番 <span class="num">{song.gameSongId}</span>
    {song.artist !== null && <> ・ {song.artist}</>}
    {song.level !== null && <> ・ 難易度 {song.level}</>}
  </p>
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
    <div class={`best best-${count}`}>
      <span class="best-label">{count}人</span>
      {best === null ? (
        <span class="muted">—</span>
      ) : (
        <a class="num" href={`${songPath(song.gameSongId)}${toQuery({ players: count })}`}>
          {formatScore(best.score)}
        </a>
      )}
      {solo && (
        <div class="small">
          {solo.name}
          {solo.tiedOthers > 0 && <span class="muted received"> ほか{solo.tiedOthers}名</span>}
        </div>
      )}
    </div>
  )
}

export const SongListPage = ({ songs, levels, q, level, sort, page, limit, total }: SongListProps) => {
  const hasFilter = q !== null || level !== null
  return (
    <Layout title={SITE_NAME}>
      <h1>曲一覧</h1>
      <form class="filters" method="get" action="/" role="search">
        <input type="search" name="q" value={q ?? ''} placeholder="曲名・アーティストで検索" aria-label="曲名・アーティスト" />
        <select name="level" aria-label="難易度">
          <option value="">すべての難易度</option>
          {levels.map((value) => (
            <option value={value} selected={value === level}>
              難易度 {value}
            </option>
          ))}
        </select>
        <select name="sort" aria-label="並べ替え">
          <option value="id" selected={sort === 'id'}>
            曲番順
          </option>
          <option value="level" selected={sort === 'level'}>
            難易度順
          </option>
        </select>
        <button type="submit">検索</button>
        {hasFilter && <a href="/">条件をクリア</a>}
      </form>

      {songs.length === 0 ? (
        <p class="empty">{hasFilter ? '条件に一致する曲はありません' : '曲はまだ登録されていません'}</p>
      ) : (
        <ul class="song-list">
          <li class="song-row song-head" aria-hidden="true">
            <span class="song-id">曲番</span>
            <span class="song-title">曲名</span>
            <span class="song-level">難易度</span>
            {PLAYER_COUNTS.map((count) => (
              <span class={`best-${count}`}>{count}人 最高</span>
            ))}
          </li>
          {songs.map((song) => (
            <li class="song-row">
              <span class="song-id num muted">{song.gameSongId}</span>
              <div class="song-title">
                <a href={songPath(song.gameSongId)}>{song.title}</a>
                {song.artist !== null && <div class="muted small">{song.artist}</div>}
              </div>
              <span class="song-level">{song.level ?? '—'}</span>
              {PLAYER_COUNTS.map((count) => (
                <BestCell song={song} count={count} best={song.bestScores[String(count) as keyof BestScores]} />
              ))}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} limit={limit} total={total} href={(p) => `/${toQuery({ q, level, sort: sort === 'id' ? null : sort, page: pageParam(p) })}`} />
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

export const SongRankingPage = ({ song, rankings, selected, fullComboOnly, name, limit }: SongRankingProps) => {
  const filtered = fullComboOnly || name !== null
  return (
    <Layout title={song.title}>
      <h1>{song.title}</h1>
      <SongMeta song={song} />
      <form id="filters" class="filters" method="get" action={songPath(song.gameSongId)} role="search">
        <input type="search" name="name" value={name ?? ''} placeholder="プレイヤー名で検索" aria-label="プレイヤー名" />
        <label class="check">
          <input type="checkbox" name="fc" value="1" checked={fullComboOnly} />
          フルコンボのみ
        </label>
        <button type="submit">検索</button>
        {filtered && <a href={`${songPath(song.gameSongId)}${toQuery({ players: selected === 1 ? null : selected })}`}>条件をクリア</a>}
      </form>

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
        <div class="tabs" role="presentation">
          {PLAYER_COUNTS.map((count) => (
            <label for={`tab-${count}`}>{count}人</label>
          ))}
        </div>
        <div class="panels">
          {PLAYER_COUNTS.map((count) => {
            const ranking = rankings.get(count)!
            return (
              <section class={`panel panel-${count}`} aria-label={`${count}人ランキング`}>
                <h2>{count}人</h2>
                <RankingTable entries={ranking.entries} emptyMessage={emptyMessage(filtered)} />
                {ranking.total > limit && (
                  <p class="more">
                    <a href={`${songPath(song.gameSongId)}/players/${count}${toQuery({ fc: fullComboOnly, name })}`}>
                      すべて見る（{ranking.total}件）
                    </a>
                  </p>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </Layout>
  )
}

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
  const filtered = fullComboOnly || name !== null
  return (
    <Layout title={`${song.title}（${players}人）`}>
      <p class="small">
        <a href={`${songPath(song.gameSongId)}${toQuery({ players, fc: fullComboOnly, name })}`}>← 1〜4人のランキングへ</a>
      </p>
      <h1>
        {song.title}（{players}人）
      </h1>
      <SongMeta song={song} />
      <form class="filters" method="get" action={path} role="search">
        <input type="search" name="name" value={name ?? ''} placeholder="プレイヤー名で検索" aria-label="プレイヤー名" />
        <label class="check">
          <input type="checkbox" name="fc" value="1" checked={fullComboOnly} />
          フルコンボのみ
        </label>
        <button type="submit">検索</button>
        {filtered && <a href={path}>条件をクリア</a>}
      </form>
      <RankingTable entries={ranking.entries} emptyMessage={emptyMessage(filtered)} />
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
    <h1>{title}</h1>
    <p>{message}</p>
    <p>
      <a href="/">曲一覧へ戻る</a>
    </p>
  </Layout>
)
