import type { Activity } from '../lib/activity'
import type { BestScore, BestScores, RankingPage } from '../lib/ranking'
import type { Child } from 'hono/jsx'
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
import { Icon, Layout } from './layout'
import { LDC_ORIGIN, useSite } from './site'

// 1ページ目はpageを付けない
const pageParam = (page: number) => (page === 1 ? null : page)

export const SONG_LIST_PATH = '/songs'
export const DAILY_PATH = '/daily'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

// 「2026-10-14」を「10/14（水）」にする
const formatDate = (date: string) =>
  `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}）`

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

// ---- トップ（サイト全体の入口。LyricDataCreatorの入口ページを引き継ぐ） ----

const TopCard = ({ href, title, accent = false, children }: { href: string; title: string; accent?: boolean; children: Child }) => (
  <a class="top-card" href={href}>
    <span class={accent ? 'top-card-icon accent' : 'top-card-icon'}>
      <Icon>{children}</Icon>
    </span>
    <h2>{title}</h2>
  </a>
)

// よく遊んだ人・よく遊ばれた曲の一覧。hrefがあれば行全体をリンクにする
const ActivityList = ({
  title,
  rows,
}: {
  title: string
  rows: { rank: number; label: string; plays: number; href?: string }[]
}) => (
  <section class="activity" aria-label={title}>
    <h3 class="activity-title">{title}</h3>
    {rows.length === 0 ? (
      <p class="empty-box">記録はまだありません</p>
    ) : (
      <ol class="box activity-list">
        {rows.map((row) => {
          const content = (
            <>
              <span class={row.rank === 1 ? 'activity-rank rank-1 num' : 'activity-rank num'}>{row.rank}位</span>
              <span class="activity-label" title={row.label}>
                {row.label}
              </span>
              <span class="activity-plays num">{row.plays}回</span>
            </>
          )
          return (
            <li>
              {row.href ? (
                <a class="activity-row" href={row.href}>
                  {content}
                </a>
              ) : (
                <div class="activity-row">{content}</div>
              )}
            </li>
          )
        })}
      </ol>
    )}
  </section>
)

const CREDIT_GROUPS = [
  {
    label: '素材提供サイト',
    links: [
      { name: 'イラストストック', href: 'https://illust-stock.com/' },
      { name: '効果音ラボ', href: 'https://soundeffect-lab.info/' },
    ],
  },
  { label: 'Special Thanks', links: [{ name: 'YTyping', href: 'https://ytyping.net/' }] },
]

const Credits = () => (
  <section class="credits" aria-labelledby="credits-title">
    <h2 id="credits-title">クレジット</h2>
    {CREDIT_GROUPS.map((group) => (
      <div class="credits-group">
        <div class="credits-label">{group.label}</div>
        <ul>
          {group.links.map((link) => (
            <li>
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                {link.name}
              </a>
              &nbsp;様
            </li>
          ))}
        </ul>
      </div>
    ))}
  </section>
)

export type TopPageProps = { today: string; dailySongs: SongSummary[]; activity: Activity }

export const TopPage = ({ today, dailySongs, activity }: TopPageProps) => {
  const site = useSite()
  return (
    <Layout title="" subtitle={false}>
      <div class="top">
        <nav class="top-cards" aria-label="メニュー">
          {/* lucideのEdit3・Keyboard・Trophy */}
          <TopCard href={`${LDC_ORIGIN}/editor`} title="歌詞データ作成">
            <path d="M12 20h9" />
            <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
          </TopCard>
          <TopCard href={`${LDC_ORIGIN}/songs`} title="練習" accent>
            <path d="M10 8h.01M12 12h.01M14 8h.01M16 12h.01M18 8h.01M6 8h.01M7 16h10M8 12h.01" />
            <rect width="20" height="16" x="2" y="4" rx="2" />
          </TopCard>
          <TopCard href={`${site.ranking}${SONG_LIST_PATH}`} title="ランキング">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </TopCard>
        </nav>

        <section class="top-section" aria-labelledby="daily-title">
          <div class="top-section-head">
            <h2 id="daily-title">今日の曲</h2>
            <span class="top-section-note num">{formatDate(today)}</span>
          </div>
          {dailySongs.length === 0 ? (
            <p class="empty-box">曲はまだ登録されていません</p>
          ) : (
            <ul class="daily-titles">
              {dailySongs.map((song) => (
                <li>
                  <a class="box daily-title" href={`${site.ranking}${songPath(song.gameSongId)}`}>
                    <span class="daily-title-no num">No.{song.gameSongId}</span>
                    <span class="daily-title-name">{song.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <a class="top-more" href={`${site.ranking}${DAILY_PATH}`}>
            今日の曲のランキングへ →
          </a>
        </section>

        <section class="top-section" aria-labelledby="activity-title">
          <div class="top-section-head">
            <h2 id="activity-title">この1週間</h2>
            <span class="top-section-note num">
              {formatDate(activity.firstDate)}〜{formatDate(activity.lastDate)}
            </span>
          </div>
          <div class="activities">
            <ActivityList
              title="よく遊んだ人"
              rows={activity.players.map((player) => ({ rank: player.rank, label: player.name, plays: player.plays }))}
            />
            <ActivityList
              title="よく遊ばれた曲"
              rows={activity.songs.map((song) => ({
                rank: song.rank,
                label: song.title,
                plays: song.plays,
                href: `${site.ranking}${songPath(song.gameSongId)}`,
              }))}
            />
          </div>
        </section>

        <Credits />
      </div>
    </Layout>
  )
}

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
  `${SONG_LIST_PATH}${toQuery({
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
    <div class="page-head">
      <h1 class="page-title">ランキング</h1>
      <a class="button button-outline" href={DAILY_PATH}>
        今日の曲
      </a>
    </div>
    <form id="song-search" class="box filters" method="get" action={SONG_LIST_PATH} role="search" data-live="song-results">
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

// ---- 今日の曲（日ごとの課題曲と、その日の記録だけのランキング） ----

export type DailyDay = 'today' | 'yesterday'

export type DailyPageProps = {
  day: DailyDay
  date: string
  songs: { song: SongSummary; rankings: Map<PlayerCount, RankingPage> }[]
  limit: number
}

export const DailyPage = ({ day, date, songs, limit }: DailyPageProps) => (
  <Layout title="今日の曲">
    <h1 class="page-title">今日の曲</h1>
    <div class="daily-head">
      <nav class="chips" aria-label="日付">
        <a class={day === 'today' ? 'chip active' : 'chip'} href={DAILY_PATH} aria-current={day === 'today' ? 'page' : undefined}>
          今日
        </a>
        <a
          class={day === 'yesterday' ? 'chip active' : 'chip'}
          href={`${DAILY_PATH}${toQuery({ day: 'yesterday' })}`}
          aria-current={day === 'yesterday' ? 'page' : undefined}
        >
          昨日
        </a>
      </nav>
      <p class="daily-date num">{formatDate(date)}</p>
    </div>
    <p class="small muted">その日（日本時間の0時〜24時）に受け付けた記録だけで、人数ごとの上位{limit}件を表示します</p>

    {songs.length === 0 ? (
      <p class="empty-box">曲はまだ登録されていません</p>
    ) : (
      <div class="daily-songs">
        {songs.map(({ song, rankings }) => (
          <section class="box daily-song" aria-label={song.title}>
            <div class="daily-song-head">
              <a class="daily-song-title" href={songPath(song.gameSongId)}>
                {song.title}
              </a>
              <SongMeta song={song} />
            </div>
            <div class="daily-panels">
              {PLAYER_COUNTS.map((count) => (
                <div class="daily-panel">
                  <h3 class="daily-panel-title">{count}人</h3>
                  <RankingList entries={rankings.get(count)!.entries} emptyMessage="記録なし" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    )}
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
        <a class="button button-outline" href={SONG_LIST_PATH}>
          ランキングへ戻る
        </a>
      </div>
    </div>
  </Layout>
)
