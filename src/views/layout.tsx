import type { Child } from 'hono/jsx'

export const SITE_NAME = '協力タイピングゲーム ランキング'

const CSS = `
:root {
  color-scheme: light dark;
  --bg: #f7f7f8; --surface: #ffffff; --fg: #1d1d1f; --muted: #6b6b73; --line: #e1e1e6;
  --accent: #2f62c8; --accent-fg: #ffffff; --fc: #a86a00;
  --R: #d93a3a; --B: #2f6fdb; --Y: #d9a400; --G: #2e9a4e;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141416; --surface: #1c1c1f; --fg: #ececf0; --muted: #a0a0aa; --line: #2f2f35;
    --accent: #7ea6ff; --accent-fg: #10131a; --fc: #f2b84b;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg); line-height: 1.5;
  font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", sans-serif;
}
a { color: var(--accent); }
.site-header { border-bottom: 1px solid var(--line); background: var(--surface); padding: 12px 16px; }
.site-header a { color: var(--fg); text-decoration: none; font-weight: 700; }
main { max-width: 1280px; margin: 0 auto; padding: 16px; }
h1 { font-size: 1.4rem; margin: 0; overflow-wrap: anywhere; }
h2 { font-size: 1.05rem; margin: 0 0 8px; }
.muted { color: var(--muted); }
.small { font-size: .8rem; }
.num { font-variant-numeric: tabular-nums; }
.song-meta { margin: 4px 0 0; color: var(--muted); }

.filters { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin: 16px 0; }
.filters input[type=search] { flex: 1 1 14em; min-width: 0; }
input, select, button {
  font: inherit; padding: 6px 10px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--surface); color: var(--fg);
}
button { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); cursor: pointer; }
.check { display: inline-flex; align-items: center; gap: 4px; }

.fc {
  display: inline-block; margin-left: 6px; padding: 0 4px; border: 1px solid currentColor; border-radius: 4px;
  color: var(--fc); font-size: .7rem; font-weight: 700; line-height: 1.4; vertical-align: 1px;
}
.dot { display: inline-block; flex: none; width: .65em; height: .65em; border-radius: 50%; margin-top: .45em; }
.dot-R { background: var(--R); } .dot-B { background: var(--B); }
.dot-Y { background: var(--Y); } .dot-G { background: var(--G); }
.participants { list-style: none; margin: 0; padding: 0; }
.participants li { display: flex; gap: 6px; overflow-wrap: anywhere; }

table.ranking { width: 100%; border-collapse: collapse; background: var(--surface); }
.ranking th, .ranking td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.ranking th { font-size: .8rem; font-weight: 600; color: var(--muted); }
.ranking .rank { width: 3em; white-space: nowrap; }
.ranking .score { text-align: right; white-space: nowrap; }
.empty { padding: 16px 8px; color: var(--muted); background: var(--surface); border-bottom: 1px solid var(--line); }
.more { margin: 8px 0 0; }
.received { white-space: nowrap; }

.pagination { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 16px 0; }

/* 曲一覧: 広い画面は1行、狭い画面は曲名と人数別の最高記録を段に分ける */
.song-list { list-style: none; margin: 0; padding: 0; background: var(--surface); }
.song-row {
  display: grid; gap: 2px 12px; padding: 10px 8px; border-bottom: 1px solid var(--line); align-items: start;
  grid-template-columns: 4.5rem minmax(0, 1fr) 3rem repeat(4, minmax(0, 8rem));
  grid-template-areas: "id title level b1 b2 b3 b4";
}
.song-head { font-size: .8rem; font-weight: 600; color: var(--muted); padding-top: 6px; padding-bottom: 6px; }
.song-id { grid-area: id; } .song-title { grid-area: title; overflow-wrap: anywhere; } .song-level { grid-area: level; }
.best-1 { grid-area: b1; } .best-2 { grid-area: b2; } .best-3 { grid-area: b3; } .best-4 { grid-area: b4; }
.best { overflow-wrap: anywhere; }
.best a { text-decoration: none; }
.best-label { display: none; }
@media (max-width: 767px) {
  .song-head { display: none; }
  .song-row {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-areas: "id level level level" "title title title title" "b1 b2 b3 b4";
  }
  .song-level { text-align: right; }
  .song-title { margin-bottom: 4px; }
  .best-label { display: block; font-size: .7rem; color: var(--muted); }
}

/* 曲別ランキング: 広い画面は4人数を横に並べ、狭い画面はタブ（JSなし）で切り替える */
.tab-input { position: absolute; opacity: 0; pointer-events: none; }
.tabs { display: flex; border-bottom: 1px solid var(--line); margin-bottom: 12px; }
.tabs label { padding: 8px 16px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.panel { display: none; min-width: 0; }
#tab-1:checked ~ .tabs label[for=tab-1], #tab-2:checked ~ .tabs label[for=tab-2],
#tab-3:checked ~ .tabs label[for=tab-3], #tab-4:checked ~ .tabs label[for=tab-4] {
  color: var(--fg); font-weight: 700; border-bottom-color: var(--accent);
}
.tab-input:focus-visible ~ .tabs { outline: 2px solid var(--accent); outline-offset: 2px; }
#tab-1:checked ~ .panels .panel-1, #tab-2:checked ~ .panels .panel-2,
#tab-3:checked ~ .panels .panel-3, #tab-4:checked ~ .panels .panel-4 { display: block; }
.panel h2 { display: none; }
@media (min-width: 1024px) {
  .tabs { display: none; }
  .panels { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
  .panel { display: block; }
  .panel h2 { display: block; }
}
`

export const Layout = ({ title, children }: { title: string; children: Child }) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title === SITE_NAME ? title : `${title} - ${SITE_NAME}`}</title>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </head>
    <body>
      <header class="site-header">
        <a href="/">{SITE_NAME}</a>
      </header>
      <main>{children}</main>
    </body>
  </html>
)
