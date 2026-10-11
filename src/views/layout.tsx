import type { Child } from 'hono/jsx'

export const SITE_NAME = 'Song Typing Theater'
export const SITE_SUBTITLE = 'ランキング'

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
  --header: 215 30% 97%;
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
  --header: 220 15% 11%;
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
.page-title { font-size: 1.875rem; line-height: 1.2; overflow-wrap: anywhere; }
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
.fc {
  display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px;
  background: hsl(var(--success) / .15); color: hsl(var(--success)); font-size: .6875rem; font-weight: 700;
  line-height: 1.4; vertical-align: 2px; letter-spacing: .02em;
}
.dot { display: inline-block; flex: none; width: .625em; height: .625em; margin-top: .45em; border-radius: 50%; }
.dot-R { background: #e5484d; } .dot-B { background: #3e7bfa; } .dot-Y { background: #f0b400; } .dot-G { background: #30a46c; }
.participants { margin: 0; padding: 0; list-style: none; }
.participants li { display: flex; gap: 8px; min-width: 0; overflow-wrap: break-word; word-break: normal; }
.pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 12px; margin: 24px 0 0; }
.back-link { display: inline-block; margin-bottom: 12px; font-size: .875rem; text-decoration: none; }

/* 曲一覧（LyricDataCreatorの曲カード） */
.song-grid { display: grid; gap: 20px; margin: 0; padding: 0; list-style: none; }
@media (min-width: 768px) { .song-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.song-card { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 20px; transition: transform .2s, box-shadow .2s; }
.song-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1);
}
.song-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.song-no { font-size: .75rem; font-weight: 600; letter-spacing: .025em; text-transform: uppercase; color: hsl(var(--muted-foreground)); }
.song-level { font-weight: 600; color: hsl(var(--muted-foreground)); }
.song-title {
  display: block; overflow: hidden; font-size: 1.125rem; font-weight: 600; color: hsl(var(--foreground));
  text-decoration: none; text-overflow: ellipsis; white-space: nowrap;
}
.song-title:hover { color: hsl(var(--primary)); }
.song-artist { margin-top: -8px; font-weight: 500; color: hsl(var(--secondary-foreground)); overflow-wrap: anywhere; }
.bests {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 4px 0 0; padding: 12px 0 0;
  border-top: 1px solid hsl(var(--border-subtle));
}
@media (max-width: 479px) { .bests { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 12px; } }
.best { min-width: 0; overflow-wrap: anywhere; }
.best dt { font-size: .75rem; color: hsl(var(--muted-foreground)); }
.best dd { margin: 0; }
.best a { font-weight: 600; color: hsl(var(--foreground)); text-decoration: none; white-space: nowrap; }
.best a:hover { color: hsl(var(--primary)); }

/* 曲別ランキング: 広い画面は4人数を横に並べ、狭い画面はチップ（JSなし）で切り替える */
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
  .panels { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; align-items: start; }
  .panel { display: block; }
  .panel-title { display: block; }
}
.panel-empty { padding: 32px 16px; color: hsl(var(--muted-foreground)); font-size: .875rem; text-align: center; }
.panel-more { display: block; padding: 12px 16px; border-top: 1px solid hsl(var(--border-subtle)); font-size: .875rem; font-weight: 600; text-decoration: none; }
.panel-more:hover { background: hsl(var(--primary) / .06); }
table.ranking { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ranking th {
  padding: 10px 12px; font-size: .75rem; font-weight: 600; letter-spacing: .025em; text-align: left;
  color: hsl(var(--muted-foreground));
}
.ranking td { padding: 10px 12px; border-top: 1px solid hsl(var(--border-subtle)); vertical-align: top; }
.ranking .rank { width: 3.25rem; font-weight: 700; white-space: nowrap; }
.ranking .rank-1 { color: hsl(var(--primary)); }
.ranking .score { width: 6.5rem; font-weight: 600; text-align: right; white-space: nowrap; }
/* FC印はスコアの下に置き、狭い列でも名前の幅を確保する */
.ranking .score .fc { display: block; width: fit-content; margin: 4px 0 0 auto; }
.panel .ranking { font-size: .875rem; }
.panel .ranking th, .panel .ranking td { padding: 8px 10px; }
.panel .ranking .rank { width: 2.75rem; }
.panel .ranking .score { width: 5.75rem; }
.ranking .received { margin-top: 2px; font-size: .75rem; color: hsl(var(--muted-foreground)); }
`

// 保存したテーマ（light・dark）を描画前に反映する。保存がなければ端末の設定に従う
const THEME_INIT = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

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
