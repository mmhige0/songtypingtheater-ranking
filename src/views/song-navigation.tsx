// 隣接曲の問い合わせはキー操作時だけ行い、通常のページ表示では追加取得しない。
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
navigating=true;
var request=new AbortController();
controller=request;
var timeout=setTimeout(function(){request.abort()},10000),moving=false;
try{
var response=await fetch('/api/v1/songs/'+encodeURIComponent(config.dataset.songId)+'/neighbors',{signal:request.signal});
if(!response.ok)throw new Error('隣接曲を取得できません');
var adjacent=await response.json();
if(request.signal.aborted||controller!==request)return;
var songId=adjacent[e.key==='ArrowLeft'?'previous':'next'];
if(songId===null)return;
if(typeof songId!=='string'||!/^\\d{3,8}$/.test(songId))throw new Error('曲番号が不正です');
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
