import type { Child } from 'hono/jsx'

export const SITE_NAME = 'Song Typing Theater'
export const SITE_SUBTITLE = 'ランキング'
// 検索エンジン向けの指定。全応答のX-Robots-Tagヘッダーと画面のmetaタグで使う
export const ROBOTS = 'noindex, nofollow, noarchive'

// 色・角丸・影はLyricDataCreator（app/globals.css）のテーマ変数に合わせる。値はHSLの3要素で、hsl(var(--x))として使う

const LIGHT = `
  --background: 215 30% 97%; --foreground: 215 30% 15%;
  --card: 0 0% 100%; --primary: 215 85% 50%; --primary-foreground: 0 0% 100%;
  --secondary: 215 25% 94%; --secondary-foreground: 215 30% 25%;
  --muted: 215 20% 92%; --muted-foreground: 215 15% 40%;
  --accent: 195 80% 46%; --accent-foreground: 0 0% 100%;
  --destructive: 0 75% 55%; --success: 150 65% 38%;
  --border: 215 20% 88%; --border-subtle: 215 15% 92%;
  --field: 215 25% 98%; --field-border: 215 20% 88%; --ring: 215 80% 55%;
  --header: 215 30% 97%; --gold: 42 95% 42%; --full-combo-bg: 210 75% 96%;
  --sun: block; --moon: none;
`

const DARK = `
  --background: 220 16% 9%; --foreground: 210 20% 95%;
  --card: 220 15% 13%; --primary: 195 95% 78%; --primary-foreground: 220 20% 7%;
  --secondary: 220 14% 15%; --secondary-foreground: 210 15% 88%;
  --muted: 220 12% 12%; --muted-foreground: 215 12% 65%;
  --accent: 200 65% 52%; --accent-foreground: 0 0% 100%;
  --destructive: 0 65% 55%; --success: 150 55% 42%;
  --border: 220 18% 20%; --border-subtle: 220 15% 16%;
  --field: 220 14% 15%; --field-border: 0 0% 32%; --ring: 200 65% 50%;
  --header: 220 15% 11%; --gold: 45 95% 58%; --full-combo-bg: 210 30% 18%;
  --sun: none; --moon: block;
`

const CSS = `
:root { color-scheme: light; --radius: .75rem; ${LIGHT} }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; ${DARK} }
}
:root[data-theme="dark"] { color-scheme: dark; ${DARK} }

* { box-sizing: border-box; border-color: hsl(var(--border)); }
body {
  margin: 0; min-height: 100vh; background: hsl(var(--background)); color: hsl(var(--foreground));
  font-family: "Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;
  font-size: 16px; line-height: 1.5; letter-spacing: -0.01em; -webkit-font-smoothing: antialiased;
  transition: background-color .25s ease, color .2s ease;
}
h1, h2, h3 {
  font-family: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;
  font-weight: 700; letter-spacing: -0.02em; margin: 0;
}
a { color: hsl(var(--primary)); }
::selection { background: hsl(var(--primary) / .25); }
.muted { color: hsl(var(--muted-foreground)); }
.small { font-size: .8125rem; }
.num { font-variant-numeric: tabular-nums; }
.nowrap { white-space: nowrap; }

/* ヘッダー（LyricDataCreatorのAppHeader） */
.site-header { border-bottom: 1px solid hsl(var(--border)); background: hsl(var(--header) / .95); }
.header-inner {
  max-width: 1400px; margin: 0 auto; padding: 16px; display: flex; align-items: center;
  justify-content: space-between; gap: 16px;
}
.brand { display: flex; align-items: center; gap: 16px; min-width: 0; text-decoration: none; }
.brand:hover { opacity: .8; }
.brand-icon {
  display: flex; flex: none; align-items: center; justify-content: center; width: 44px; height: 44px;
  border-radius: 16px; background: hsl(var(--primary) / .1); color: hsl(var(--primary));
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / .1), 0 1px 2px -1px rgb(0 0 0 / .1);
}
.brand-title {
  display: block; font-family: "Space Grotesk", sans-serif; font-size: 1.5rem; font-weight: 700;
  line-height: 1.2; letter-spacing: -0.02em; color: hsl(var(--primary));
}
.brand-sub { display: block; margin-top: 2px; font-size: .875rem; color: hsl(var(--muted-foreground)); }
.theme-toggle {
  display: inline-flex; flex: none; align-items: center; justify-content: center; width: 36px; height: 36px;
  border: 0; border-radius: 999px; background: transparent; color: hsl(var(--foreground)); cursor: pointer;
}
.theme-toggle[hidden] { display: none; }
.theme-toggle:hover { background: hsl(var(--accent) / .5); }
.icon-sun { display: var(--sun); } .icon-moon { display: var(--moon); }
main { max-width: 1400px; margin: 0 auto; padding: 24px 16px 48px; }
@media (min-width: 1024px) {
  .header-inner { padding: 16px 40px; }
  .brand-title { font-size: 1.875rem; }
  main { padding: 32px 32px 64px; }
}

/* 部品（LyricDataCreatorのshadcn/ui部品と同じ寸法） */
.page-title { font-size: 1.875rem; line-height: 1.2; overflow-wrap: anywhere; white-space: pre-wrap; }
.page-meta { margin: 8px 0 0; color: hsl(var(--muted-foreground)); font-size: .9375rem; }
.box {
  border: 1px solid hsl(var(--border)); border-radius: 16px; background: hsl(var(--card));
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / .1), 0 1px 2px -1px rgb(0 0 0 / .1);
}
.filters {
  display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 24px 0; padding: 16px;
  background: hsl(var(--card) / .8);
}
.filters input[type=search] { flex: 1 1 16em; max-width: 440px; min-width: 0; }
input[type=search], select {
  height: 36px; padding: 4px 12px; border: 1px solid hsl(var(--field-border)); border-radius: calc(var(--radius) - 2px);
  background: hsl(var(--field)); color: hsl(var(--foreground)); font: inherit; font-size: .875rem;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / .05); outline: none;
}
input[type=search]::placeholder { color: hsl(var(--muted-foreground)); }
input[type=search]:focus-visible, select:focus-visible {
  border-color: hsl(var(--ring)); box-shadow: 0 0 0 3px hsl(var(--ring) / .5);
}
.button {
  display: inline-flex; align-items: center; justify-content: center; height: 36px; padding: 0 16px;
  border: 1px solid hsl(var(--primary)); border-radius: calc(var(--radius) - 2px);
  background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); font: inherit; font-size: .875rem;
  font-weight: 500; text-decoration: none; cursor: pointer; box-shadow: 0 1px 2px 0 rgb(0 0 0 / .05);
}
.button:hover { background: hsl(var(--primary) / .9); }
.button:active { transform: scale(.98); }
.button-outline { border-color: hsl(var(--border)); background: hsl(var(--background)); color: hsl(var(--foreground)); }
.button-outline:hover { background: hsl(var(--accent)); color: hsl(var(--accent-foreground)); }
.button[aria-disabled=true] { opacity: .5; pointer-events: none; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 16px; border: 1px solid hsl(var(--border));
  border-radius: 999px; background: hsl(var(--card)); color: hsl(var(--foreground)); font-size: .875rem;
  font-weight: 600; line-height: 1.4; text-decoration: none; cursor: pointer; transition: background-color .15s, border-color .15s;
}
.chip:hover { border-color: hsl(var(--primary) / .3); background: hsl(var(--primary) / .1); }
.chip.active, .chip:has(input:checked) {
  border-color: hsl(var(--primary)); background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
}
.chip input { margin: 0; accent-color: hsl(var(--primary-foreground)); }
.clear-link { font-size: .875rem; color: hsl(var(--muted-foreground)); }
.empty-box {
  padding: 48px 16px; border: 1px dashed hsl(var(--border)); border-radius: 16px; background: hsl(var(--card) / .8);
  color: hsl(var(--muted-foreground)); font-size: .875rem; text-align: center;
}
/* フルコンボの星 */
.fc { display: inline-flex; flex: none; vertical-align: -0.125em; color: hsl(var(--primary)); }
/* 狭い画面では従来どおり名前を「・」でつなぐ。PCでは下記の2列配置を使う */
.participants { overflow: hidden; margin: 0; padding: 0; list-style: none; text-overflow: ellipsis; white-space: nowrap; }
.participants li { display: inline; }
.participants li:not(:last-child)::after { content: "・"; }
/* 達成が確認できた記録だけ背景を変える。不明・未達成の記録には適用しない */
.full-combo { background: hsl(var(--full-combo-bg)); }
.pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 12px; margin: 24px 0 0; }
.back-link { display: inline-block; margin-bottom: 12px; font-size: .875rem; text-decoration: none; }

/* 検索欄（入力で自動検索、×で消す） */
.search-field { position: relative; flex: 1 1 16em; max-width: 440px; min-width: 0; }
.search-field input[type=search] { width: 100%; padding-right: 40px; }
.search-field input[type=search]::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }
.search-clear {
  position: absolute; top: 50%; right: 4px; display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 999px; transform: translateY(-50%);
  color: hsl(var(--muted-foreground)); text-decoration: none;
}
.search-clear[hidden] { display: none; }
.search-clear:hover { background: hsl(var(--muted)); color: hsl(var(--foreground)); }

/* ランキング（曲一覧）: 列幅固定の表。狭い画面は枠の中で横スクロールする */
#sort-state { display: contents; }
.result-count { margin: 0 0 8px; }
.table-wrap { overflow-x: auto; }
table.songs { width: 100%; min-width: 1080px; border-collapse: collapse; table-layout: fixed; font-size: .9375rem; }
.songs .col-no { width: 4.5rem; }
/* 名前を2列に収めるため、1〜4人の列を同じ幅にする。曲名には残りの幅を使う */
.songs .col-best-1, .songs .col-best-2, .songs .col-best-3, .songs .col-best-4 { width: 17%; }
.songs .col-level { width: 4rem; }
.songs th {
  padding: 12px; font-size: .75rem; font-weight: 600; letter-spacing: .025em; text-align: left;
  color: hsl(var(--muted-foreground)); white-space: nowrap;
}
.songs td { padding: 10px 12px; border-top: 1px solid hsl(var(--border-subtle)); vertical-align: top; }
/* No.・曲名・Lv.の3列はセル全体が曲別ランキングへのリンク */
.songs .song-cell { position: relative; }
.cell-link { color: inherit; text-decoration: none; }
.cell-link::after { content: ""; position: absolute; inset: 0; }
.songs tr:has(.song-cell:hover) .song-cell { background: hsl(var(--primary) / .07); }
.songs tr:has(.song-cell:hover) .song-title { color: hsl(var(--primary)); }
.songs .no { font-weight: 600; color: hsl(var(--muted-foreground)); white-space: nowrap; }
.songs .level { font-weight: 600; white-space: nowrap; }
.songs .no, .songs .level, .songs th:first-child, .songs th:nth-child(3) { text-align: right; }
.sort-link { display: inline-flex; align-items: center; color: inherit; text-decoration: none; }
.sort-link:hover, th[aria-sort] .sort-link { color: hsl(var(--primary)); }
.sort-arrow { display: inline-block; width: 1em; text-align: center; }
.song-title {
  display: block; overflow: hidden; font-weight: 600; color: hsl(var(--foreground));
  text-decoration: none; text-overflow: ellipsis; white-space: pre;
}
.song-artist { overflow: hidden; margin-top: 2px; font-size: .8125rem; color: hsl(var(--secondary-foreground)); text-overflow: ellipsis; white-space: nowrap; }
/* 1位はプレイヤー名を主に、スコアとFCを下に添える */
/* 人数のセルは全体がその人数のランキングへのリンク。押せるのはそのセルだけなので、ハイライトもセル単位 */
.songs .best { position: relative; }
.songs .best:hover { background: hsl(var(--primary) / .07); }
.songs .best.full-combo:hover { background: hsl(var(--full-combo-bg)); }
.best-link { display: block; min-width: 0; color: hsl(var(--foreground)); }
.best-empty { color: hsl(var(--muted-foreground)); }
.best-link .participants { font-weight: 700; }
.best-score { display: flex; justify-content: flex-end; align-items: center; gap: 4px; margin-top: 2px; font-size: 1rem; font-weight: 600; }
.best-link:hover .participants, .best-link:hover .best-score { color: hsl(var(--primary)); }
/* JSが有効なら無限スクロール、無効なら前へ・次へのリンク */
.load-more { display: none; }
.js .load-more { display: block; min-height: 40px; padding: 16px 0; color: hsl(var(--muted-foreground)); font-size: .875rem; text-align: center; }
.js .pagination-fallback { display: none; }

/* 曲別ランキング: 広い画面は4人数を横に並べ、狭い画面はチップのタブ（JSなし）で切り替える */
.tab-input { position: absolute; opacity: 0; pointer-events: none; }
.tabs { margin-bottom: 16px; }
.panel { display: none; min-width: 0; overflow: hidden; }
#tab-1:checked ~ .tabs label[for=tab-1], #tab-2:checked ~ .tabs label[for=tab-2],
#tab-3:checked ~ .tabs label[for=tab-3], #tab-4:checked ~ .tabs label[for=tab-4] {
  border-color: hsl(var(--primary)); background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
}
.tab-input:focus-visible ~ .tabs { outline: 2px solid hsl(var(--ring)); outline-offset: 4px; border-radius: 999px; }
#tab-1:checked ~ .panels .panel-1, #tab-2:checked ~ .panels .panel-2,
#tab-3:checked ~ .panels .panel-3, #tab-4:checked ~ .panels .panel-4 { display: block; }
.panel-title { display: none; padding: 16px 16px 4px; font-size: 1.125rem; }
@media (min-width: 1024px) {
  .tabs { display: none; }
  .panels { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; align-items: start; }
  .panel { display: block; }
  .panel-title { display: block; }
}
/* 順位とスコアを1行目に、名前をその下に大きく出す */
.ranking-list { margin: 0; padding: 0; list-style: none; }
.entry { padding: 12px 16px; }
.entry + .entry { border-top: 1px solid hsl(var(--border-subtle)); }
.entry-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 2px; }
.entry-rank { font-size: 1.125rem; font-weight: 700; white-space: nowrap; }
.entry-rank.rank-1 { color: hsl(var(--primary)); }
.entry-score { display: inline-flex; align-items: center; gap: 6px; font-size: 1.375rem; font-weight: 700; white-space: nowrap; }
.entry-score .fc { font-size: 1.0625rem; }
.entry .participants { font-size: 1.0625rem; font-weight: 600; line-height: 1.4; }
.panel-empty { padding: 32px 16px; color: hsl(var(--muted-foreground)); font-size: .875rem; text-align: center; }
.panel-more { display: block; padding: 12px 16px; border-top: 1px solid hsl(var(--border-subtle)); font-size: .875rem; font-weight: 600; text-decoration: none; }
.panel-more:hover { background: hsl(var(--primary) / .06); }
table.ranking { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ranking th {
  padding: 10px 16px; font-size: .75rem; font-weight: 600; letter-spacing: .025em; text-align: left;
  color: hsl(var(--muted-foreground));
}
.ranking td { padding: 14px 16px; border-top: 1px solid hsl(var(--border-subtle)); vertical-align: middle; }
.ranking .rank { text-align: right; width: 5rem; font-size: 1.25rem; font-weight: 700; white-space: nowrap; }
.ranking .rank-1 { color: hsl(var(--primary)); }
.ranking .participants { font-size: 1.125rem; font-weight: 600; line-height: 1.4; }
.ranking .score { width: 12rem; font-size: 1.5rem; font-weight: 700; text-align: right; white-space: nowrap; }
.ranking .score .fc { margin-right: 6px; font-size: 1.125rem; }
.ranking th.rank, .ranking th.score { font-size: .75rem; font-weight: 600; }
@media (max-width: 639px) {
  .ranking th, .ranking td { padding-left: 10px; padding-right: 10px; }
  .ranking td.rank { font-size: 1.0625rem; } .ranking .rank { width: 3.5rem; }
  .ranking .participants { font-size: 1rem; }
  .ranking td.score { font-size: 1.1875rem; } .ranking .score { width: 8.5rem; }
  .ranking .score .fc { margin-right: 4px; font-size: 1rem; }
}

/* PC: 枠を使わず列間の余白で名前を区切る。常に2行分確保して人数による縦ずれを防ぐ */
@media (min-width: 1024px) {
  .participants {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, 1.5em); gap: 4px 12px;
    overflow: visible; white-space: normal; line-height: 1.5;
  }
  .participants li { display: block; min-width: 0; }
  .participants[data-count="1"] li { grid-column: 1 / -1; }
  .participants li:not(:last-child)::after { content: none; }
  .participant-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .entry-head { flex-wrap: nowrap; min-height: 2rem; margin-bottom: 6px; }
  .entry .participants, .best-link .participants { font-size: .875rem; }
  .best-link .participants { font-weight: 600; }
  .entry-score { font-size: clamp(1rem, 1.45vw, 1.375rem); }
  .songs td { vertical-align: top; }
  .best-link { display: flex; flex-direction: column; align-items: stretch; }
  .best-score { margin-top: 6px; }
}

`

// 保存したテーマ（light・dark）を描画前に反映する。保存がなければ端末の設定に従う。
// JSの有無でCSSを切り替えるため、html要素にjsクラスを付ける
const THEME_INIT = `document.documentElement.classList.add('js');try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

// テーマ切り替えボタン。JSが無効なら表示しない
const THEME_TOGGLE = `(function(){var b=document.getElementById('theme-toggle');if(!b)return;b.hidden=false;
b.addEventListener('click',function(){var r=document.documentElement;
var dark=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
var next=dark?'light':'dark';r.dataset.theme=next;try{localStorage.setItem('theme',next)}catch(e){}})})()`

// lucideのアイコン（ISCライセンス）。LyricDataCreatorのヘッダーと同じMusic2・Sun・Moon
const Icon = ({ children, class: className }: { children: Child; class?: string }) => (
  <svg
    class={className}
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const Layout = ({ title, children }: { title: string; children: Child }) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content={ROBOTS} />
      <title>{title ? `${title} - ${SITE_NAME} ${SITE_SUBTITLE}` : `${SITE_NAME} ${SITE_SUBTITLE}`}</title>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap"
      />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </head>
    <body>
      <header class="site-header">
        <div class="header-inner">
          <a class="brand" href="/">
            <span class="brand-icon">
              <Icon>
                <circle cx="8" cy="18" r="4" />
                <path d="M12 18V2l7 4" />
              </Icon>
            </span>
            <span>
              <span class="brand-title">{SITE_NAME}</span>
              <span class="brand-sub">{SITE_SUBTITLE}</span>
            </span>
          </a>
          <button id="theme-toggle" class="theme-toggle" type="button" aria-label="テーマを切り替える" hidden>
            <Icon class="icon-sun">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </Icon>
            <Icon class="icon-moon">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </Icon>
          </button>
        </div>
      </header>
      <main>{children}</main>
      <script dangerouslySetInnerHTML={{ __html: THEME_TOGGLE }} />
    </body>
  </html>
)
