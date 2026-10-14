import type { BestScore, BestScores, RankingPage } from '../lib/ranking'
import type { SongSummary } from '../lib/song-query'
import {
  LEVEL_FILTER_MAX,
  LEVEL_FILTER_MIN,
  PLAYER_COUNTS,
  type LevelRange,
  type PlayerCount,
  type SongSort,
  type SortDir,
} from '../lib/view-query'
import {
  formatScore,
  FullComboMark,
  LiveSearchScript,
  Pagination,
  Participants,
  PageNumberPagination,
  RankingList,
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

// プレイヤー名検索のフォーム。曲別ランキングではタブのラジオボタンもform属性でこのフォームに含める
const RankingFilters = ({
  id,
  action,
  name,
  clearHref,
  resultsId,
}: {
  id?: string
  action: string
  name: string | null
  clearHref: string
  resultsId: string
}) => (
  <form id={id} class="box filters" method="get" action={action} role="search" data-live={resultsId}>
    <SearchField name="name" value={name} placeholder="プレイヤー名で検索" clearHref={clearHref} />
    <NoScriptSubmit />
  </form>
)

// ---- ランキング（曲一覧） ----

export type SongListProps = {
  songs: (SongSummary & { bestScores: BestScores })[]
  q: string | null
  levelRange: LevelRange | null
  sort: SongSort
  dir: SortDir
  page: number
  limit: number
  total: number
}

// 既定値（Lv.の全範囲・No.の降順・1ページ目）はクエリに付けない
const songListPath = ({
  q = null,
  levelRange,
  sort,
  dir,
  page = 1,
}: {
  q?: string | null
  levelRange: LevelRange | null
  sort: SongSort
  dir: SortDir
  page?: number
}) =>
  `/${toQuery({
    q,
    levelMin: levelRange === null || levelRange.min === LEVEL_FILTER_MIN ? null : levelRange.min,
    levelMax: levelRange === null || levelRange.max === LEVEL_FILTER_MAX ? null : levelRange.max,
    sort: sort === 'id' ? null : sort,
    dir: dir === 'desc' ? null : dir,
    page: pageParam(page),
  })}`

// レベルの範囲のスライダー。JSが有効なら2つのつまみを1本に重ね、離したときに反映する。
// 無効ならふつうの範囲入力を2つ並べ、検索ボタンで反映する
const levelPercent = (level: number) => ((level - LEVEL_FILTER_MIN) / (LEVEL_FILTER_MAX - LEVEL_FILTER_MIN)) * 100

const LevelFilter = ({ levelRange }: { levelRange: LevelRange | null }) => {
  const { min, max } = levelRange ?? { min: LEVEL_FILTER_MIN, max: LEVEL_FILTER_MAX }
  const range = (name: string, value: number, defaultValue: number, label: string) => (
    <input
      type="range"
      name={name}
      min={LEVEL_FILTER_MIN}
      max={LEVEL_FILTER_MAX}
      step={1}
      value={value}
      data-default={String(defaultValue)}
      aria-label={label}
    />
  )
  return (
    <div class="level-filter" data-level-filter>
      <span class="level-value num">Lv.{min}</span>
      <div class="level-slider" style={`--lo: ${levelPercent(min)}%; --hi: ${levelPercent(max)}%`}>
        {range('levelMin', min, LEVEL_FILTER_MIN, 'Lv.下限')}
        {range('levelMax', max, LEVEL_FILTER_MAX, 'Lv.上限')}
      </div>
      <span class="level-value num">Lv.{max}</span>
    </div>
  )
}

// 並べ替えの列見出し。選択中の列をもう一度押すと昇順・降順を切り替える
const SortHeader = ({
  label,
  value,
  q,
  levelRange,
  sort,
  dir,
}: {
  label: string
  value: SongSort
  q: string | null
  levelRange: LevelRange | null
  sort: SongSort
  dir: SortDir
}) => {
  const active = sort === value
  const nextDir = active && dir === 'desc' ? 'asc' : 'desc'
  return (
    <th aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <a class="sort-link" href={songListPath({ q, levelRange, sort: value, dir: nextDir })}>
        {label}
        <span class="sort-arrow" aria-hidden="true">
          {active ? (dir === 'asc' ? '↑' : '↓') : ''}
        </span>
      </a>
    </th>
  )
}

// 人数ごとの1位。スコアとFCを上に、名前をその下に小さく出す。同点の補足は表示しない。
// FCのマークは1位がFCのとき、背景色はその人数の記録に1件でもFCがあるときに付ける。
// セル全体（記録なしも含む）がその人数のランキングへのリンク
const BestCell = ({ song, count, best }: { song: SongSummary; count: PlayerCount; best: BestScore | null }) => (
  <td class={best?.hasFullCombo === true ? 'best full-combo' : 'best'}>
    {best === null ? (
      <a
        class="cell-link best-empty muted"
        href={`${songPath(song.gameSongId)}${toQuery({ players: count })}`}
        aria-label={`${count}人ランキング（記録なし）`}
      >
        —
      </a>
    ) : (
      <a class="cell-link best-link" href={`${songPath(song.gameSongId)}${toQuery({ players: count })}`}>
        <span class="best-score num">
          {best.isFullCombo === true && <FullComboMark />}
          {formatScore(best.score)}
        </span>
        <Participants participants={best.participants} />
      </a>
    )}
  </td>
)

export const SongListPage = ({ songs, q, levelRange, sort, dir, page, limit, total }: SongListProps) => (
  <Layout title="">
    <h1 class="page-title">ランキング</h1>
    <form id="song-search" class="box filters" method="get" action="/" role="search" data-live="song-results">
      <span id="sort-state" data-sync>
        {sort !== 'id' && <input type="hidden" name="sort" value={sort} />}
        {dir !== 'desc' && <input type="hidden" name="dir" value={dir} />}
      </span>
      <SearchField
        name="q"
        value={q}
        placeholder="曲番・曲名・アーティスト名で検索"
        clearHref={songListPath({ levelRange, sort, dir })}
      />
      <LevelFilter levelRange={levelRange} />
      <NoScriptSubmit />
    </form>

    <div id="song-results">
      {songs.length === 0 ? (
        <p class="empty-box">{q !== null || levelRange !== null ? '条件に一致する曲がありません' : '曲はまだ登録されていません'}</p>
      ) : (
        <>
          <p class="result-count small muted">全{total}曲</p>
          <PageNumberPagination
            page={page}
            limit={limit}
            total={total}
            href={(p) => songListPath({ q, levelRange, sort, dir, page: p })}
            placement="top"
          />
          <div class="box table-wrap">
            <table class="songs">
              <colgroup>
                <col class="col-no" />
                <col class="col-title" />
                <col class="col-level" />
                {PLAYER_COUNTS.map((count) => (
                  <col class={`col-best-${count}`} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <SortHeader label="No." value="id" q={q} levelRange={levelRange} sort={sort} dir={dir} />
                  <th>曲名 / アーティスト</th>
                  <SortHeader label="Lv." value="level" q={q} levelRange={levelRange} sort={sort} dir={dir} />
                  {PLAYER_COUNTS.map((count) => (
                    <th class="best-head">{count}人</th>
                  ))}
                </tr>
              </thead>
              <tbody id="song-rows">
                {songs.map((song) => (
                  <tr>
                    {/* No.・曲名・Lv.のどこを押しても曲別ランキングへ。読み上げ・Tab移動は曲名のリンクだけにする */}
                    <td class="song-cell no num">
                      <a class="cell-link" href={songPath(song.gameSongId)} tabindex={-1} aria-hidden="true">
                        {song.gameSongId}
                      </a>
                    </td>
                    <td class="song-cell">
                      <a class="cell-link song-title" href={songPath(song.gameSongId)} title={song.title}>
                        {song.title}
                      </a>
                      <div class="song-artist" title={song.artist ?? undefined}>
                        {song.artist}
                      </div>
                    </td>
                    <td class="song-cell level">
                      <a class="cell-link" href={songPath(song.gameSongId)} tabindex={-1} aria-hidden="true">
                        {song.level ?? '—'}
                      </a>
                    </td>
                    {PLAYER_COUNTS.map((count) => (
                      <BestCell song={song} count={count} best={song.bestScores[String(count) as keyof BestScores]} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <PageNumberPagination
        page={page}
        limit={limit}
        total={total}
        href={(p) => songListPath({ q, levelRange, sort, dir, page: p })}
        placement="bottom"
      />
    </div>
    <LiveSearchScript />
  </Layout>
)

// ---- 曲別ランキング（広い画面は1〜4人を横に並べ、狭い画面はタブで切り替え） ----

export type SongRankingProps = {
  song: SongSummary
  rankings: Map<PlayerCount, RankingPage>
  selected: PlayerCount
  name: string | null
  limit: number
}

const emptyMessage = (filtered: boolean) => (filtered ? '条件に一致する記録はありません' : '記録はまだありません')

export const SongRankingPage = ({ song, rankings, selected, name, limit }: SongRankingProps) => (
  <Layout title={song.title}>
    <h1 class="page-title">{song.title}</h1>
    <SongMeta song={song} />
    <RankingFilters
      id="filters"
      action={songPath(song.gameSongId)}
      name={name}
      clearHref={`${songPath(song.gameSongId)}${toQuery({ players: selected === 1 ? null : selected })}`}
      resultsId="ranking-results"
    />

    <div id="ranking-results" class="rankings">
      {/* 狭い画面の人数のタブ（JSなしで切り替わる）。フォームと一緒に送信し、選択中の人数を保つ */}
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
              <RankingList entries={ranking.entries} emptyMessage={emptyMessage(name !== null)} />
              {ranking.total > limit && (
                <a
                  class="panel-more"
                  href={`${songPath(song.gameSongId)}/players/${count}${toQuery({ name })}`}
                >
                  すべて見る（{ranking.total}件）
                </a>
              )}
            </section>
          )
        })}
      </div>
    </div>
    <LiveSearchScript />
  </Layout>
)

// ---- 人数別ランキング（ページ送り） ----

export type PlayerRankingProps = {
  song: SongSummary
  players: PlayerCount
  ranking: RankingPage
  name: string | null
  page: number
  limit: number
}

export const PlayerRankingPage = ({ song, players, ranking, name, page, limit }: PlayerRankingProps) => {
  const path = `${songPath(song.gameSongId)}/players/${players}`
  return (
    <Layout title={`${song.title}（${players}人）`}>
      <a class="back-link" href={`${songPath(song.gameSongId)}${toQuery({ players, name })}`}>
        ← 1〜4人のランキングへ
      </a>
      <h1 class="page-title">
        {song.title}（{players}人）
      </h1>
      <SongMeta song={song} />
      <RankingFilters
        action={path}
        name={name}
        clearHref={path}
        resultsId="ranking-results"
      />
      <div id="ranking-results">
        <section class="box">
          <RankingTable entries={ranking.entries} emptyMessage={emptyMessage(name !== null)} />
        </section>
        <Pagination
          page={page}
          limit={limit}
          total={ranking.total}
          href={(p) => `${path}${toQuery({ name, page: pageParam(p) })}`}
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
