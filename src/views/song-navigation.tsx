// 曲番号を±1して通常のページ遷移を行う。事前確認や全曲一覧の取得はしない。
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
e.preventDefault();
if(navigating||Date.now()<readyAt)return;
var current=config.dataset.songId;
if(!/^\\d{3,8}$/.test(current))return;
var number=Number(current)+(e.key==='ArrowLeft'?-1:1);
if(number<1||number>99999999)return;
var songId=String(number).padStart(3,'0');
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

export const SongNavigation = ({ gameSongId }: { gameSongId: string }) => (
  <>
    <span id="song-navigation" hidden data-song-id={gameSongId} />
    <script dangerouslySetInnerHTML={{ __html: SONG_NAVIGATION_SCRIPT }} />
  </>
)
