// 参加者の組み合わせキー。正規化済み（小文字）のplayerIdを辞書順にソートし、空白なしのJSON配列文字列にする。
// 順序・名前・色・ホストによらず、同じ参加者集合なら同じキーになる
export const toTeamKey = (playerIds: readonly string[]) => JSON.stringify([...playerIds].sort())
