import type { BestScore, BestScores, RankingPage } from '../lib/ranking'
import type { SongSummary } from '../lib/song-query'
import { PLAYER_COUNTS, type PlayerCount, type SongSort, type SortDir } from '../lib/view-query'
import {
  formatScore,
  FullComboMark,
  LiveSearchScript,
  Pagination,
  Participants,
  RankingTable,
  SearchField,
  toQuery,
} from './components'
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

// JSが無効な場合だけ出す送信ボタン（JSが有効なら入力・チェックで自動的に反映する）
const NoScriptSubmit = () => (
  <noscript>
    <button class="button" type="submit">
      検索
    </button>
  </noscript>
)

// プレイヤー名検索とFC絞り込みのフォーム。曲別ランキングではタブのラジオボタンもform属性でこのフォームに含める
const RankingFilters = ({
  id,
  action,
  name,
  fullComboOnly,
  clearHref,
  resultsId,
}: {
  id?: string
  action: string
  name: string | null
  fullComboOnly: boolean
  clearHref: string
  resultsId: string
}) => (
  <form id={id} class="box filters" method="get" action={action} role="search" data-live={resultsId}>
    <SearchField name="name" value={name} placeholder="プレイヤー名で検索" clearHref={clearHref} />
    <label class="chip">
      <input type="checkbox" name="fc" value="1" checked={fullComboOnly} />
      フルコンボのみ
    </label>
    <NoScriptSubmit />
  </form>
)

// ---- ランキング（曲一覧） ----

export type SongListProps = {
  songs: (SongSummary & { bestScores: BestScores })[]
  q: string | null
  sort: SongSort
  dir: SortDir
  page: number
  limit: number
  total: number
}

// 既定値（No.の昇順・1ページ目）はクエリに付けない
const songListPath = ({
  q = null,
  sort,
  dir,
  page = 1,
}: {
  q?: string | null
  sort: SongSort
  dir: SortDir
  page?: number
}) => `/${toQuery({ q, sort: sort === 'id' ? null : sort, dir: dir === 'asc' ? null : dir, page: pageParam(page) })}`

// 並べ替えの列見出し。選択中の列をもう一度押すと昇順・降順を切り替える
const SortHeader = ({
  label,
  value,
  q,
  sort,
  dir,
}: {
  label: string
  value: SongSort
  q: string | null
  sort: SongSort
  dir: SortDir
}) => {
  const active = sort === value
  const nextDir = active && dir === 'asc' ? 'desc' : 'asc'
  return (
    <th aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <a class="sort-link" href={songListPath({ q, sort: value, dir: nextDir })}>
        {label}
        <span class="sort-arrow" aria-hidden="true">
          {active ? (dir === 'asc' ? '↑' : '↓') : ''}
        </span>
      </a>
    </th>
  )
}

// 人数ごとの1位。名前を主に、スコアとFCを添える。同点の1位が他にもいれば人数（ソロ）・組数を出す
const BestCell = ({ song, count, best }: { song: SongSummary; count: PlayerCount; best: BestScore | null }) => (
  <td class="best">
    {best === null ? (
      <span class="muted">—</span>
    ) : (
      <a class="best-link" href={`${songPath(song.gameSongId)}${toQuery({ players: count })}`}>
        <Participants participants={best.participants} />
        {best.tiedOthers > 0 && (
          <span class="best-tied small muted">
            ほか{best.tiedOthers}
            {count === 1 ? '名' : '組'}
          </span>
        )}
        <span class="best-score num">
          {formatScore(best.score)}
          {best.isFullCombo === true && <FullComboMark />}
        </span>
      </a>
    )}
  </td>
)

export const SongListPage = ({ songs, q, sort, dir, page, limit, total }: SongListProps) => (
  <Layout title="">
    <h1 class="page-title">ランキング</h1>
    <form id="song-search" class="box filters" method="get" action="/" role="search" data-live="song-results">
      <span id="sort-state" data-sync>
        {sort !== 'id' && <input type="hidden" name="sort" value={sort} />}
        {dir !== 'asc' && <input type="hidden" name="dir" value={dir} />}
      </span>
      <SearchField name="q" value={q} placeholder="曲番・曲名・アーティスト名で検索" clearHref={songListPath({ sort, dir })} />
    </form>

    <div id="song-results">
      {songs.length === 0 ? (
        <p class="empty-box">{q !== null ? '条件に一致する曲がありません' : '曲はまだ登録されていません'}</p>
      ) : (
        <>
          <p class="result-count small muted">全{total}曲</p>
          <div class="box table-wrap">
            <table class="songs">
              <colgroup>
                <col class="col-no" />
                <col class="col-title" />
                <col class="col-level" />
                {PLAYER_COUNTS.map(() => (
                  <col />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <SortHeader label="No." value="id" q={q} sort={sort} dir={dir} />
                  <th>曲名 / アーティスト</th>
                  <SortHeader label="Lv." value="level" q={q} sort={sort} dir={dir} />
                  {PLAYER_COUNTS.map((count) => (
                    <th>{count}人</th>
                  ))}
                </tr>
              </thead>
              <tbody id="song-rows">
                {songs.map((song) => (
                  <tr>
                    <td class="no num">{song.gameSongId}</td>
                    <td>
                      <a class="song-title" href={songPath(song.gameSongId)} title={song.title}>
                        {song.title}
                      </a>
                      <div class="song-artist" title={song.artist ?? undefined}>
                        {song.artist ?? '—'}
                      </div>
                    </td>
                    <td class="level">{song.level ?? '—'}</td>
                    {PLAYER_COUNTS.map((count) => (
                      <BestCell song={song} count={count} best={song.bestScores[String(count) as keyof BestScores]} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page * limit < total && (
            <div class="load-more" data-next={songListPath({ q, sort, dir, page: page + 1 })}>
              <span class="load-more-status" />
            </div>
          )}
        </>
      )}
      <div class="pagination-fallback">
        <Pagination page={page} limit={limit} total={total} href={(p) => songListPath({ q, sort, dir, page: p })} />
      </div>
    </div>
    <LiveSearchScript />
  </Layout>
)

// ---- 曲別ランキング（1〜4人をタブで切り替え） ----

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
      clearHref={`${songPath(song.gameSongId)}${toQuery({ players: selected === 1 ? null : selected, fc: fullComboOnly })}`}
      resultsId="ranking-results"
    />

    <div id="ranking-results" class="rankings">
      {/* 人数のタブ（JSなしで切り替わる）。フォームと一緒に送信し、選択中の人数を保つ */}
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
      {PLAYER_COUNTS.map((count) => {
        const ranking = rankings.get(count)!
        return (
          <section class={`box panel panel-${count}`} aria-label={`${count}人ランキング`}>
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
    <LiveSearchScript />
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
      <RankingFilters
        action={path}
        name={name}
        fullComboOnly={fullComboOnly}
        clearHref={`${path}${toQuery({ fc: fullComboOnly })}`}
        resultsId="ranking-results"
      />
      <div id="ranking-results">
        <section class="box">
          <RankingTable entries={ranking.entries} emptyMessage={emptyMessage(fullComboOnly || name !== null)} />
        </section>
        <Pagination
          page={page}
          limit={limit}
          total={ranking.total}
          href={(p) => `${path}${toQuery({ fc: fullComboOnly, name, page: pageParam(p) })}`}
        />
      </div>
      <LiveSearchScript />
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
          ランキングへ戻る
        </a>
      </div>
    </div>
  </Layout>
)
