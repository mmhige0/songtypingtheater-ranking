import type { Participant, RankingEntry } from '../lib/ranking'

export const formatScore = (score: number) => score.toLocaleString('en-US')

// 値がnull・空文字・falseの項目を除いてクエリ文字列を作る
export const toQuery = (params: Record<string, string | number | boolean | null | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '' || value === false) continue
    search.set(key, value === true ? '1' : String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

// フルコンボの王冠（lucideのCrown、ISCライセンス）
export const FullComboMark = () => (
  <span class="fc" title="フルコンボ" role="img" aria-label="フルコンボ">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
      <path d="M5 21h14" />
    </svg>
  </span>
)

// PCでは一人ずつ枠で区切る（色は表示しない。並びは色のR→B→Y→G順）。長い名前は各枠内で省略する
export const Participants = ({ participants }: { participants: Participant[] }) => (
  <ul class="participants" data-count={participants.length}>
    {participants.map((p) => (
      <li title={p.name}>
        <span class="participant-name">{p.name}</span>
      </li>
    ))}
  </ul>
)

// 幅の狭い列に置く順位の一覧。順位とスコアを1行目に、参加者の名前をその下に大きく出す。枠は呼び出し側で付ける
export const RankingList = ({ entries, emptyMessage }: { entries: RankingEntry[]; emptyMessage: string }) =>
  entries.length === 0 ? (
    <p class="panel-empty">{emptyMessage}</p>
  ) : (
    <ol class="ranking-list">
      {entries.map((entry) => (
        <li class={entry.isFullCombo === true ? 'entry full-combo' : 'entry'}>
          <div class="entry-head">
            <span class={entry.rank === 1 ? 'entry-rank rank-1 num' : 'entry-rank num'}>{entry.rank}位</span>
            <span class="entry-score num">
              {entry.isFullCombo === true && <FullComboMark />}
              {formatScore(entry.score)}
            </span>
          </div>
          <Participants participants={entry.participants} />
        </li>
      ))}
    </ol>
  )

// 画面幅いっぱいに置く順位表。枠は呼び出し側で付ける
export const RankingTable = ({ entries, emptyMessage }: { entries: RankingEntry[]; emptyMessage: string }) =>
  entries.length === 0 ? (
    <p class="panel-empty">{emptyMessage}</p>
  ) : (
    <table class="ranking">
      <thead>
        <tr>
          <th class="rank">順位</th>
          <th>プレイヤー</th>
          <th class="score">スコア</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr class={entry.isFullCombo === true ? 'full-combo' : undefined}>
            <td class={entry.rank === 1 ? 'rank rank-1 num' : 'rank num'}>{entry.rank}位</td>
            <td>
              <Participants participants={entry.participants} />
            </td>
            <td class="score num">
              {entry.isFullCombo === true && <FullComboMark />}
              {formatScore(entry.score)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

// 入力が止まって250ms後に自動で検索する欄。×で検索語を消す（JSが無効なら×はリンク、検索はEnter）
export const SearchField = ({
  name,
  value,
  placeholder,
  clearHref,
}: {
  name: string
  value: string | null
  placeholder: string
  clearHref: string
}) => (
  <div class="search-field">
    <input
      type="search"
      name={name}
      value={value ?? ''}
      maxlength={100}
      autocomplete="off"
      placeholder={placeholder}
      aria-label={placeholder}
    />
    <a class="search-clear" href={clearHref} aria-label="検索をクリア" hidden={value === null}>
      ×
    </a>
  </div>
)

// form[data-live]の入力・チェックで結果（data-liveのidの要素）だけを差し替え、URLを書き換える。
// 検索語は入力が止まって250ms後、チェックボックスはすぐ反映する。ラジオ（人数タブ）はURLだけ書き換える。
// data-syncの要素（並べ替えの状態）も取得したページの同じidの要素に置き換える。
// 結果の中に.load-moreがあれば、近づいたときにdata-nextのページの#song-rowsの行を末尾に足す
const LIVE_SEARCH_SCRIPT = `(function(){
var form=document.querySelector('form[data-live]');if(!form)return;
var targetId=form.dataset.live,input=form.querySelector('input[type=search]'),clear=form.querySelector('.search-clear'),
seq=0,timer,observer,loading=false;
function results(){return document.getElementById(targetId)}
function fetchDoc(url){return fetch(url).then(function(r){if(!r.ok)throw new Error(String(r.status));return r.text()})
.then(function(t){return new DOMParser().parseFromString(t,'text/html')})}
function formUrl(){var p=new URLSearchParams();new FormData(form).forEach(function(v,k){if(String(v).trim())p.append(k,v)});
var s=p.toString();return form.getAttribute('action')+(s?'?'+s:'')}
function show(url){var id=++seq;loading=false;if(observer)observer.disconnect();
fetchDoc(url).then(function(doc){if(id!==seq)return;var next=doc.getElementById(targetId);if(next)results().replaceWith(next);
document.querySelectorAll('[data-sync]').forEach(function(el){var n=doc.getElementById(el.id);if(n)el.replaceWith(n)});
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
var next=doc.querySelector('#'+targetId+' .load-more');if(next){more.replaceWith(next);watch()}else more.remove()})
.catch(function(){if(id!==seq)return;loading=false;var b=document.createElement('button');
b.type='button';b.className='button button-outline';b.textContent='読み込みに失敗しました（再試行）';
b.addEventListener('click',function(){loadMore(more)});status.replaceChildren(b)})}
if(input)input.addEventListener('input',function(){if(clear)clear.hidden=!input.value;clearTimeout(timer);
timer=setTimeout(function(){show(formUrl())},250)});
if(clear)clear.addEventListener('click',function(e){e.preventDefault();clearTimeout(timer);input.value='';clear.hidden=true;
input.focus();show(formUrl())});
form.addEventListener('submit',function(e){e.preventDefault();clearTimeout(timer);show(formUrl())});
document.addEventListener('change',function(e){var t=e.target;if(t.form!==form||t.type==='search')return;
if(t.type==='radio'){history.replaceState(null,'',formUrl());return}clearTimeout(timer);show(formUrl())});
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('#'+targetId+' .sort-link');
if(!a||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();show(a.href)});
watch()})()`

export const LiveSearchScript = () => <script dangerouslySetInnerHTML={{ __html: LIVE_SEARCH_SCRIPT }} />

export const Pagination = ({
  page,
  limit,
  total,
  href,
}: {
  page: number
  limit: number
  total: number
  href: (page: number) => string
}) => {
  const lastPage = Math.max(1, Math.ceil(total / limit))
  if (lastPage === 1 && page === 1) return null
  return (
    <nav class="pagination" aria-label="ページ送り">
      {page > 1 ? (
        <a class="button button-outline" href={href(Math.min(page - 1, lastPage))}>
          前へ
        </a>
      ) : (
        <span class="button button-outline" aria-disabled="true">
          前へ
        </span>
      )}
      <span class="num small muted">
        {page} / {lastPage} ページ（{total}件）
      </span>
      {page < lastPage ? (
        <a class="button button-outline" href={href(page + 1)}>
          次へ
        </a>
      ) : (
        <span class="button button-outline" aria-disabled="true">
          次へ
        </span>
      )}
    </nav>
  )
}
