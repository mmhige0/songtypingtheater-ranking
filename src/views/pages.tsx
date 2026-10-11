import type { BestScore, BestScores, RankingPage, SoloBestScore } from '../lib/ranking'
import type { SongSummary } from '../lib/song-query'
import { PLAYER_COUNTS, type PlayerCount, type SongSort, type SortDir } from '../lib/view-query'
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

const BestCell = ({ song, count, best }: { song: SongSummary; count: PlayerCount; best: BestScore | null }) => {
  const solo = count === 1 ? (best as SoloBestScore | null) : null
  return (
    <td class="best num">
      {best === null ? (
        <span class="muted">—</span>
      ) : (
        <a href={`${songPath(song.gameSongId)}${toQuery({ players: count })}`}>{formatScore(best.score)}</a>
      )}
      {solo && (
        <div class="best-name small muted" title={solo.name}>
          {solo.name}
          {solo.tiedOthers > 0 && <span class="nowrap"> ほか{solo.tiedOthers}名</span>}
        </div>
      )}
    </td>
  )
}

// 入力が止まって250ms後に検索し、結果（#song-results）だけを差し替える。表の末尾が近づいたら次のページの行を足す。
// JSが無効ならフォーム送信（Enter）とページ送りで動く
const SONG_LIST_SCRIPT = `(function(){
var form=document.getElementById('song-search');if(!form)return;
var input=form.elements.q,clear=form.querySelector('.search-clear'),seq=0,timer,observer,loading=false;
function results(){return document.getElementById('song-results')}
function fetchDoc(url){return fetch(url).then(function(r){if(!r.ok)throw new Error(String(r.status));return r.text()})
.then(function(t){return new DOMParser().parseFromString(t,'text/html')})}
function formUrl(){var p=new URLSearchParams(new FormData(form));if(!(p.get('q')||'').trim())p.delete('q');
var s=p.toString();return '/'+(s?'?'+s:'')}
function show(url){var id=++seq;loading=false;if(observer)observer.disconnect();
fetchDoc(url).then(function(doc){if(id!==seq)return;
results().replaceWith(doc.getElementById('song-results'));
document.getElementById('sort-state').replaceWith(doc.getElementById('sort-state'));
history.replaceState(null,'',url);watch()})
.catch(function(e){if(id!==seq)return;var p=document.createElement('p');p.className='empty-box';
p.textContent='読み込みに失敗しました（'+e.message+'）。時間をおいて再度お試しください';results().replaceChildren(p)})}
function watch(){var more=results().querySelector('.load-more');if(!more)return;
observer=new IntersectionObserver(function(es){if(es[0].isIntersecting)loadMore(more)},{rootMargin:'200px 0px'});
observer.observe(more)}
function loadMore(more){if(loading)return;loading=true;var id=seq,status=more.querySelector('.load-more-status');
status.textContent='さらに読み込み中...';
fetchDoc(more.dataset.next).then(function(doc){if(id!==seq)return;loading=false;observer.disconnect();
var rows=doc.getElementById('song-rows'),body=document.getElementById('song-rows');
if(rows&&body)body.append.apply(body,Array.prototype.slice.call(rows.children));
var next=doc.querySelector('#song-results .load-more');if(next){more.replaceWith(next);watch()}else more.remove()})
.catch(function(){if(id!==seq)return;loading=false;var b=document.createElement('button');
b.type='button';b.className='button button-outline';b.textContent='読み込みに失敗しました（再試行）';
b.addEventListener('click',function(){loadMore(more)});status.replaceChildren(b)})}
input.addEventListener('input',function(){clear.hidden=!input.value;clearTimeout(timer);
timer=setTimeout(function(){show(formUrl())},250)});
form.addEventListener('submit',function(e){e.preventDefault();clearTimeout(timer);show(formUrl())});
clear.addEventListener('click',function(e){e.preventDefault();clearTimeout(timer);input.value='';clear.hidden=true;
input.focus();show(formUrl())});
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('#song-results .sort-link');
if(!a||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();show(a.href)});
watch()})()`

export const SongListPage = ({ songs, q, sort, dir, page, limit, total }: SongListProps) => (
  <Layout title="">
    <h1 class="page-title">曲一覧</h1>
    <form id="song-search" class="box filters" method="get" action="/" role="search">
      <span id="sort-state">
        {sort !== 'id' && <input type="hidden" name="sort" value={sort} />}
        {dir !== 'asc' && <input type="hidden" name="dir" value={dir} />}
      </span>
      <div class="search-field">
        <input
          type="search"
          name="q"
          value={q ?? ''}
          maxlength={100}
          autocomplete="off"
          placeholder="曲番・曲名・アーティスト名で検索"
          aria-label="曲番・曲名・アーティスト名"
        />
        <a class="search-clear" href={songListPath({ sort, dir })} aria-label="検索をクリア" hidden={q === null}>
          ×
        </a>
      </div>
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
                <col />
                <col class="col-level" />
                {PLAYER_COUNTS.map(() => (
                  <col class="col-best" />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <SortHeader label="No." value="id" q={q} sort={sort} dir={dir} />
                  <th>曲名 / アーティスト</th>
                  <SortHeader label="Lv." value="level" q={q} sort={sort} dir={dir} />
                  {PLAYER_COUNTS.map((count) => (
                    <th class="best">{count}人</th>
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
    <script dangerouslySetInnerHTML={{ __html: SONG_LIST_SCRIPT }} />
  </Layout>
)

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
