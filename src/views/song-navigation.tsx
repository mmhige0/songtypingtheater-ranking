// キー操作時に曲番号を±1し、その1曲の公開状態だけを確認する。全曲一覧は取得しない。
export const SONG_NAVIGATION_SCRIPT = `(function(){
var config=document.getElementById('song-navigation');
if(!config)return;
var navigating=false,readyAt=Date.now()+500,controller=null;
window.addEventListener('pageshow',function(){
if(controller)controller.abort();
controller=null;navigating=false;readyAt=Date.now()+500;
});
document.addEventListener('keydown',async function(e){
if(e.defaultPrevented||e.repeat||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
var target=e.target;
if(target&&(target.isContentEditable||(target.closest&&target.closest('input,textarea,select,button,[role="tab"],[role="slider"],[role="textbox"]'))))return;
e.preventDefault();
if(navigating||Date.now()<readyAt)return;
var current=config.dataset.songId;
if(!/^\\d{3,8}$/.test(current))return;
var number=Number(current)+(e.key==='ArrowLeft'?-1:1);
if(number<0||number>99999999)return;
var songId=String(number).padStart(3,'0');
navigating=true;
var request=new AbortController();
controller=request;
var timeout=setTimeout(function(){request.abort()},10000),moving=false;
try{
var response=await fetch('/api/v1/songs/'+encodeURIComponent(songId)+'/exists',{method:'HEAD',signal:request.signal});
if(!response.ok||request.signal.aborted||controller!==request)return;
var url=new URL(window.location.href);
url.pathname=url.pathname.replace(/^\\/songs\\/[^/]+/, '/songs/'+encodeURIComponent(songId));
url.searchParams.delete('page');
var selected=document.querySelector('input[name="players"]:checked');
if(selected)url.searchParams.set('players',selected.value);
url.hash='';
window.location.assign(url.href);
moving=true;
}catch{
// 通信失敗・タイムアウト時も、次のキー操作で再試行できるようにする。
}finally{
clearTimeout(timeout);
if(controller===request){controller=null;if(!moving){navigating=false;readyAt=Date.now()+500}}
}
});
})()`

export const SongNavigation = ({ gameSongId }: { gameSongId: string }) => (
  <>
    <span id="song-navigation" hidden data-song-id={gameSongId} />
    <script dangerouslySetInnerHTML={{ __html: SONG_NAVIGATION_SCRIPT }} />
  </>
)
