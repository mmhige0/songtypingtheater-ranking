import type { Participant, RankingEntry } from '../lib/ranking'

const COLOR_NAMES = { R: '赤', B: '青', Y: '黄', G: '緑' } as const

const pad = (value: number) => String(value).padStart(2, '0')

// 受付日時（UTC）を日本時間で表示する
export const formatJst = (iso: string) => {
  const date = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000)
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

export const formatScore = (score: number) => score.toLocaleString('en-US')

// 値がnull・空文字・falseの項目を除いてクエリ文字列を作る
export const toQuery = (params: Record<string, string | number | boolean | null | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '' || value === false) continue
    search.set(key, value === true ? '1' : String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const FullComboMark = () => (
  <span class="fc" title="フルコンボ">
    FC
  </span>
)

export const Participants = ({ participants }: { participants: Participant[] }) => (
  <ul class="participants">
    {participants.map((p) => (
      <li>
        <span class={`dot dot-${p.color}`} title={COLOR_NAMES[p.color]} />
        <span>{p.name}</span>
      </li>
    ))}
  </ul>
)

// 新規記録は受付日時（達成日時ではない）。移行分の受付日時はインポート時刻のため日時を出さない
const ReceivedAt = ({ entry }: { entry: RankingEntry }) =>
  entry.isLegacy ? (
    <span title={`旧ランキングから移行した記録（移行受付日時 ${formatJst(entry.receivedAt)}）`}>移行記録</span>
  ) : (
    <span>受付 {formatJst(entry.receivedAt)}</span>
  )

export const RankingTable = ({ entries, emptyMessage }: { entries: RankingEntry[]; emptyMessage: string }) =>
  entries.length === 0 ? (
    <p class="empty">{emptyMessage}</p>
  ) : (
    <table class="ranking">
      <thead>
        <tr>
          <th class="rank">順位</th>
          <th>プレイヤー</th>
          <th class="score">スコア</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr>
            <td class="rank num">{entry.rank}位</td>
            <td>
              <Participants participants={entry.participants} />
              <div class="muted small received">
                <ReceivedAt entry={entry} />
              </div>
            </td>
            <td class="score num">
              {formatScore(entry.score)}
              {entry.isFullCombo === true && <FullComboMark />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

export const Pagination = ({
  page,
  limit,
  total,
  href,
}: {
  page: number
  limit: number
  total: number
  href: (page: number) => string
}) => {
  const lastPage = Math.max(1, Math.ceil(total / limit))
  if (lastPage === 1 && page === 1) return null
  return (
    <nav class="pagination" aria-label="ページ送り">
      {page > 1 ? <a href={href(Math.min(page - 1, lastPage))}>前へ</a> : <span class="muted">前へ</span>}
      <span class="num">
        {page} / {lastPage} ページ（{total}件）
      </span>
      {page < lastPage ? <a href={href(page + 1)}>次へ</a> : <span class="muted">次へ</span>}
    </nav>
  )
}
