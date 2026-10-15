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

// フルコンボの星（単色SVGでテーマに追従）
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
      <path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.19l-5.56 2.93 1.06-6.2L3 9.53l6.22-.9Z" />
    </svg>
  </span>
)

// 代表記録がFCでないとき、同じチームのFC記録の最高得点をスコアの下に小さく出す
const FullComboScore = ({ score }: { score: number | null }) =>
  score === null ? null : (
    <span class="fc-score num" title="このチームのフルコンボの最高スコア">
      <FullComboMark />
      {formatScore(score)}
    </span>
  )

// PCでは一人ずつ2列に並べる（色は表示しない。並びは色のR→B→Y→G順）。長い名前は各列内で省略する
export const Participants = ({ participants }: { participants: Participant[] }) => (
  <ul class="participants" data-count={participants.length}>
    {participants.map((p) => (
      <li title={p.name}>
        <span class="participant-name">{p.name}</span>
      </li>
    ))}
  </ul>
)

// 幅の狭い列に置く順位の一覧。順位とスコアを1行目に、参加者の名前をその下に薄く出す。枠は呼び出し側で付ける
export const RankingList = ({ entries, emptyMessage }: { entries: RankingEntry[]; emptyMessage: string }) =>
  entries.length === 0 ? (
    <p class="panel-empty">{emptyMessage}</p>
  ) : (
    <ol class="ranking-list">
      {entries.map((entry) => (
        <li class={entry.isFullCombo === true ? 'entry full-combo' : 'entry'}>
          <div class="entry-head">
            <span class={entry.rank === 1 ? 'entry-rank rank-1 num' : 'entry-rank num'}>{entry.rank}位</span>
            <span class="entry-scores">
              <span class="entry-score num">
                {entry.isFullCombo === true && <FullComboMark />}
                {formatScore(entry.score)}
              </span>
              <FullComboScore score={entry.fullComboScore} />
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
              <FullComboScore score={entry.fullComboScore} />
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
// 並べ替えの見出しとdata-live-navのページ送りのリンクも結果だけを差し替える。下側のページ送りなら結果の先頭へスクロールする。
// data-defaultと同じ値の項目はURLに付けない。レベルのスライダーは動かしている間は表示だけを変え、離したとき（change）に反映する。
// つまみが交差したら離したときに下限・上限を入れ替える
const LIVE_SEARCH_SCRIPT = `(function(){
var form=document.querySelector('form[data-live]');if(!form)return;
var targetId=form.dataset.live,input=form.querySelector('input[type=search]'),clear=form.querySelector('.search-clear'),
seq=0,timer;
function results(){return document.getElementById(targetId)}
function fetchDoc(url){return fetch(url).then(function(r){if(!r.ok)throw new Error(String(r.status));return r.text()})
.then(function(t){return new DOMParser().parseFromString(t,'text/html')})}
function formUrl(){var p=new URLSearchParams();new FormData(form).forEach(function(v,k){var el=form.elements[k];
if(String(v).trim()&&!(el&&el.dataset&&el.dataset.default===v))p.append(k,v)});
var s=p.toString();return form.getAttribute('action')+(s?'?'+s:'')}
function show(url,top){var id=++seq;
fetchDoc(url).then(function(doc){if(id!==seq)return;var next=doc.getElementById(targetId);if(next)results().replaceWith(next);
document.querySelectorAll('[data-sync]').forEach(function(el){var n=doc.getElementById(el.id);if(n)el.replaceWith(n)});
history.replaceState(null,'',url);if(top)results().scrollIntoView()})
.catch(function(e){if(id!==seq)return;var p=document.createElement('p');p.className='empty-box';
p.textContent='読み込みに失敗しました（'+e.message+'）。時間をおいて再度お試しください';results().replaceChildren(p)})}
form.querySelectorAll('[data-level-filter]').forEach(function(f){var lo=f.querySelector('[name=levelMin]'),
hi=f.querySelector('[name=levelMax]'),labels=f.querySelectorAll('.level-value'),slider=f.querySelector('.level-slider');
function pct(v){return(v-lo.min)/(lo.max-lo.min)*100+'%'}
function sync(){var a=Math.min(+lo.value,+hi.value),b=Math.max(+lo.value,+hi.value);
labels[0].textContent='Lv.'+a;labels[1].textContent='Lv.'+b;slider.style.setProperty('--lo',pct(a));slider.style.setProperty('--hi',pct(b))}
f.addEventListener('input',sync);
f.addEventListener('change',function(){if(+lo.value>+hi.value){var v=lo.value;lo.value=hi.value;hi.value=v}sync()});sync()});
if(input)input.addEventListener('input',function(){if(clear)clear.hidden=!input.value;clearTimeout(timer);
timer=setTimeout(function(){show(formUrl())},250)});
if(clear)clear.addEventListener('click',function(e){e.preventDefault();clearTimeout(timer);input.value='';clear.hidden=true;
input.focus();show(formUrl())});
form.addEventListener('submit',function(e){e.preventDefault();clearTimeout(timer);show(formUrl())});
document.addEventListener('change',function(e){var t=e.target;if(t.form!==form||t.type==='search')return;
if(t.type==='radio'){history.replaceState(null,'',formUrl());return}clearTimeout(timer);show(formUrl())});
document.addEventListener('click',function(e){
var a=e.target.closest&&e.target.closest('#'+targetId+' .sort-link, #'+targetId+' [data-live-nav] a');
if(!a||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();
show(a.href,!!a.closest('[data-live-nav=bottom]'))})})()`

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
      <PageStep label="前へ" href={page > 1 ? href(Math.min(page - 1, lastPage)) : null} />
      <span class="num small muted">
        {page} / {lastPage} ページ（{total}件）
      </span>
      <PageStep label="次へ" href={page < lastPage ? href(page + 1) : null} />
    </nav>
  )
}

// 前へ・次へ。行き先がなければ押せない表示にする
const PageStep = ({ label, href }: { label: string; href: string | null }) =>
  href === null ? (
    <span class="button button-outline" aria-disabled="true">
      {label}
    </span>
  ) : (
    <a class="button button-outline" href={href}>
      {label}
    </a>
  )

// 各ページへ直接飛べるページ番号のボタンを並べたページ送り。表の上下に置き、
// JSが有効なら結果だけを差し替える（下側は結果の先頭へスクロールする）
export const PageNumberPagination = ({
  page,
  limit,
  total,
  href,
  placement,
}: {
  page: number
  limit: number
  total: number
  href: (page: number) => string
  placement: 'top' | 'bottom'
}) => {
  const lastPage = Math.max(1, Math.ceil(total / limit))
  if (lastPage === 1 && page === 1) return null
  return (
    <nav
      class={`pagination page-number-pagination ${placement}`}
      aria-label={placement === 'top' ? 'ページ送り' : 'ページ送り（下）'}
      data-live-nav={placement}
    >
      <PageStep label="前へ" href={page > 1 ? href(Math.min(page - 1, lastPage)) : null} />
      <ul class="page-ranges">
        {Array.from({ length: lastPage }, (_, i) => i + 1).map((p) => (
          <li>
            <a
              class={p === page ? 'chip active num' : 'chip num'}
              href={href(p)}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </a>
          </li>
        ))}
      </ul>
      <PageStep label="次へ" href={page < lastPage ? href(page + 1) : null} />
    </nav>
  )
}
