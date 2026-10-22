import { PLAYER_COUNTS } from '../lib/view-query'

// フォーム・検索結果の外に置き、検索やページ送りで人数の選択を失わない。
export const SongListControls = () => (
  <fieldset class="song-count-control">
    <legend>表示するランキング</legend>
    <div class="song-count-tabs">
      {PLAYER_COUNTS.map((count) => (
        <label class="song-count-option">
          <input type="radio" name="song-count" value={String(count)} checked={count === 1} />
          <span>{count}人</span>
        </label>
      ))}
    </div>
  </fieldset>
)

// 人数切り替えはCSSのみ。JSは選択人数と、戻る操作のスクロール位置を保存する。
// storageを使えない環境でも切り替え・検索は動作する。
const SCRIPT = `(function(){
var root=document.querySelector('.song-browser');if(!root)return;
var options=root.querySelector('.song-filter-options'),mobile=matchMedia('(max-width: 767px)');
if(mobile.matches&&options.dataset.filtered!=='true')options.open=false;
mobile.addEventListener('change',function(e){if(!e.matches)options.open=true});
var radios=root.querySelectorAll('[name=song-count]'),key='song-list-view';
function read(){try{return JSON.parse(sessionStorage.getItem(key)||'null')}catch(e){return null}}
function save(){var checked=root.querySelector('[name=song-count]:checked');
try{sessionStorage.setItem(key,JSON.stringify({count:checked.value,url:location.pathname+location.search,y:scrollY}))}catch(e){}}
var state=read();if(state&&/^[1-4]$/.test(state.count)){
radios.forEach(function(r){r.checked=r.value===state.count})}
radios.forEach(function(r){r.addEventListener('change',save)});
window.addEventListener('pagehide',save);
window.addEventListener('pageshow',function(e){
if(e.persisted)return;var nav=performance.getEntriesByType('navigation')[0];
if(nav&&nav.type==='back_forward'&&state&&state.url===location.pathname+location.search&&Number.isFinite(state.y)){
requestAnimationFrame(function(){scrollTo(0,state.y)})}
});
})()`

export const SongListScript = () => <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
