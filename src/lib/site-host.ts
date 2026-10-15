// ローカル開発ではTOP_ORIGINと旧ランキング・APIのRANKING_ORIGINを同じ値にする。
// その場合、ホストに関係なく`/`にトップを出す。
// wrangler devはリクエストのホストをroutesの先頭に書き換えるため。
export const isSingleHost = (env: Env) => env.TOP_ORIGIN === env.RANKING_ORIGIN

export const isTopHost = (env: Env, url: URL) => isSingleHost(env) || url.host === new URL(env.TOP_ORIGIN).host
