# データ設計案

更新日: 2026-10-11（日本時間）

DB製品に依存しない概念設計。テーブル名・型は提案。受理済みの全プレイを保存する。失敗履歴テーブルは作らない。

| エンティティ | 主な情報 | 制約・意味 |
|---|---|---|
| Song | gameSongId、title、artist、level、levelSortValue、lyricDataCreatorId（任意） | ゲーム曲IDを一意にする。表示文字列と難易度ソート値を分ける |
| Player | playerId | セーブデータに保存する固定ID。認証情報ではない |
| Installation | playerId、tokenHash、revokedAt、createdAt | 個別送信認証。playerIdは一意。通常の認証DBにtoken平文を保存しない |
| RegistrationRecovery（検討案） | playerId、registrationSecretHash、encryptedToken、expiresAt | 初回登録の応答消失から復旧するための期間限定データ。auth-options.md参照 |
| Play | playId、songId、score、isFullCombo、isTaipen、legacyFinishedAt、receivedAt、gameVersion、hostPlayerId、playerCount、source、excludedAt | 全受理記録保存。playIdは一意。FC・モード・バージョンは移行用にnull許容。legacyFinishedAtは移行分のみ |
| PlayParticipant | playId、playerId、nameAtPlay、colorAtPlay、position | プレイ当時の名前・色を保持。playId+playerIdを一意にする |
| LegacyIdentityMapping | 移行元の名前等、対応するplayerId、確認状態 | 旧記録と新IDの対応を管理する案。推測だけで同一人物と断定しない |

## 組み合わせと代表記録

参加者IDをソートした配列を正規化して組み合わせキーを作る。単純な区切り文字結合の曖昧さを避ける。
曲ID・人数・組み合わせキーでまとめ、score降順、フル達成優先、receivedAt昇順、playId辞書順で代表を選ぶ。
FCのtrueを優先し、移行分のfalseとnullは同じ優先度にする案。nullをfalseに書き換えない。
異なるチームの順位は得点だけによる競技順位（1位、1位、3位）。同点の表示順はreceivedAt、playIdで安定させる。
TAIPEN4人は通常の4人と同じランキングに含める。サバイバルも区別しない。
receivedAtで先着を判定するのは最終調整案であり、実際の達成順とは限らない。
移行分のreceivedAtはインポート受付時刻。元の達成日時がある場合はlegacyFinishedAtに保持するが、取得した日時を受付時刻と偽らない。
この案では移行分が同点の場合に新規記録と比較される順序はインポート時刻に依存する。旧記録の扱いは移行前に確認する。

ゲームバージョンは分類キーにしない。譜面修正後も既存のランキングに残す。
除外記録は代表選択から外す。保存方式・索引は、件数に応じて決める。最初から別の集計DBを必須にしない。

## 保存・再送の整合性

- Play.playIdにDB一意制約。PlayParticipantのplayId+playerIdとplayId+positionも一意にする。
- プレイと参加者は1トランザクション。途中失敗で一部だけ保存しない。
- 同時の挿入競合はロールバック後に既存本文を比較。同一なら200、異なるなら409。
- 比較用の元の登録値を保持する。管理者除外や曲情報の更新で再送判定が変わらないようにする。
- 受信順と、playerIdをソートしたチーム判定用の順は分離する。
- token失効はInstallation単位。プレイヤーID自体が認証になるわけではない。
- 拒否した成績はDBに保存しない。未送信キュー・運用用短期ログは全受理プレイ履歴と区別する。
- 初期索引候補はsongId+playerCount+score、playId、参加者playerId。具体的な集計・索引はDB選定後に確認する。

## 名前・IDの注意

名前はプレイ時点のスナップショットを保持する案。過去名検索と最新名表示のどちらを採用するかは未確定。
セーブデータ保存により同環境でIDを維持できるが、別PC移行・セーブ紛失・共有セーブ時の扱いは別問題。
IDの衝突対策だけでは、同じセーブのコピーによる同一IDの複数利用を防げない。

## LyricDataCreator調査

2026-10-10にGitHub mainを確認。参照コミット: 8dd9b708760b7c09aeacdb2199bb24ac6f10369d。

- [schema.prisma](https://github.com/mmhige0/LyricDataCreator/blob/8dd9b708760b7c09aeacdb2199bb24ac6f10369d/prisma/schema.prisma): Songにid、title、artist、youtubeUrl、level、levelValue、scoreEntries、createdAt、updatedAt。
- [songQueries.ts](https://github.com/mmhige0/LyricDataCreator/blob/8dd9b708760b7c09aeacdb2199bb24ac6f10369d/lib/songQueries.ts): 曲一覧は歌詞を含めずid、title、artist、youtubeUrl、levelを選択。
- [levels.ts](https://github.com/mmhige0/LyricDataCreator/blob/8dd9b708760b7c09aeacdb2199bb24ac6f10369d/lib/levels.ts): levelValueは整数難易度×3に、+なら1、-なら-1を加える方式。
- [import-songs/route.ts](https://github.com/mmhige0/LyricDataCreator/blob/8dd9b708760b7c09aeacdb2199bb24ac6f10369d/app/api/import-songs/route.ts): titleで既存曲を探し、全削除・採番リセットのオプションがある。

既存内部IDをゲーム共通の不変IDとみなさない。ゲーム曲IDと明示的に対応付ける。
曲名での自動一致を恒久的な紐付けに使わない。連携先の再採番があるなら固定外部ID導入か運用変更が必要。
歌詞・タイムスタンプ・動画はランキングの必須データではない。
曲マスターの更新元、同期方向、ゲーム収録済み曲の識別は未確定。ランキングDBの独立運用＋必要なメタ情報の同期を提案する。

## 移行

1. シートの列・日時・色・スコアのサンプルを確認し、移行元をバックアップする。
2. 曲名等をゲーム曲IDへ対応付ける。不一致・曖昧一致は一覧で確認する。
3. 既存にプレイヤーIDがない場合、確認済み対応だけ新IDに結び付ける。暫定IDを使う案を検討する。
4. 旧記録のフル・バージョンは不明を許容する。日時を推測で補完しない。
5. 移行元識別子で再取り込みの重複を防ぐ。人数・曲別件数と代表記録を照合する。

移行ファイルや実プレイヤーデータはGitに含めない。
