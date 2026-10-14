// TOP_ORIGINとRANKING_ORIGINが同じなら1つのホストでトップ（`/`）とランキングを両方出す（ローカル開発用。
// wrangler devはリクエストのホストをroutesの先頭に書き換えるため、ホストではトップとランキングを分けられない）
export const isSingleHost = (env: Env) => env.TOP_ORIGIN === env.RANKING_ORIGIN

export const isTopHost = (env: Env, url: URL) => isSingleHost(env) || url.host === new URL(env.TOP_ORIGIN).host
