import type { AdjacentSongs } from '../lib/song-query'

// 通常のページ遷移だけを行う。ランキングの先読みや独自の履歴キャッシュは作らない。
export const SONG_NAVIGATION_SCRIPT = `(function(){
var config=document.getElementById('song-navigation');
if(!config)return;
var navigating=false,readyAt=Date.now()+500;
window.addEventListener('pageshow',function(){navigating=false;readyAt=Date.now()+500});
document.addEventListener('keydown',function(e){
if(e.defaultPrevented||e.repeat||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
var target=e.target;
if(target&&(target.isContentEditable||(target.closest&&target.closest('input,textarea,select,button,[role="tab"],[role="slider"],[role="textbox"]'))))return;
var songId=config.dataset[e.key==='ArrowLeft'?'previous':'next'];
if(!songId)return;
e.preventDefault();
if(navigating||Date.now()<readyAt)return;
var url=new URL(window.location.href);
url.pathname=url.pathname.replace(/^\\/songs\\/[^/]+/, '/songs/'+encodeURIComponent(songId));
url.searchParams.delete('page');
var selected=document.querySelector('input[name="players"]:checked');
if(selected)url.searchParams.set('players',selected.value);
url.hash='';
navigating=true;
try{window.location.assign(url.href)}catch(error){navigating=false;throw error}
});
})()`

export const SongNavigation = ({ adjacent }: { adjacent: AdjacentSongs }) => (
  <>
    <span id="song-navigation" hidden data-previous={adjacent.previous ?? ''} data-next={adjacent.next ?? ''} />
    <script dangerouslySetInnerHTML={{ __html: SONG_NAVIGATION_SCRIPT }} />
  </>
)
