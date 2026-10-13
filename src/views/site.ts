import { createContext, useContext } from 'hono/jsx'

// LyricDataCreator（歌詞データ作成・練習）
export const LDC_ORIGIN = 'https://ldc.kayomodoki.com'

// トップとランキングのオリジン（wranglerのvars）。ホストをまたぐリンクに使う
export type SiteOrigins = { top: string; ranking: string }

export const SiteContext = createContext<SiteOrigins>({
  top: 'https://kayomodoki.com',
  ranking: 'https://ranking.kayomodoki.com',
})

export const useSite = () => useContext(SiteContext)
