# データ設計案

更新日: 2026-10-11（日本時間）

DB製品に依存しない概念設計。テーブル名・型は提案。物理設計（Cloudflare D1）とトランザクションの実現方法は[システム構成](architecture.md)を参照。新規APIで受理済みの全プレイを保存する。旧シートからは名前の組み合わせごとの最高スコアだけを移行する。失敗履歴テーブルは作らない。

| エンティティ | 主な情報 | 制約・意味 |
|---|---|---|
| Song | id、gameSongId、title、artist、level、levelSortValue、status、createdAt、updatedAt | 内部IDを主キーとし、Play.songRefIdはSong.idを参照する。gameSongIdはnull許容でnull以外を一意（将来の未承認曲用）。statusはapproved / pending / rejected / withdrawnを想定し、v1ではapprovedだけを作成する。表示文字列と難易度ソート値を分ける |
| Player | playerId、tokenHash、revokedAt、createdAt | 新規はセーブデータのUUIDv4。旧記録は`legacy-`で始まる内部専用ID。playerId自体は認証情報ではない。tokenHashはクライアント生成tokenの個別送信認証で、null許容・null以外は一意。正規token文字列のUTF-8に対するSHA-256のみ保存し、平文・復元可能な暗号化tokenは保存しない。tokenHashがnullでないことを初回登録完了とみなす（移行用Playerは常にnull）。1プレイヤー1tokenのため別テーブルにしない |
| Play | playId、songRefId、score、isFullCombo、isTaipen、receivedAt、gameVersion、hostPlayerId、playerCount、teamKey、excludedAt | 新規の全受理記録と移行で選んだ最高記録を保存。playIdは一意。APIのsongId（gameSongId）は受付時にSong.idへ変換してsongRefIdに保存する。FC・モード・バージョン・hostPlayerIdは移行用にnull許容。hostPlayerIdがnullの記録を移行分とみなす（APIはhostPlayerIdを必須とするため）。teamKeyは必須の文字列列で、参加者IDから生成して保存する（非一意） |
| PlayParticipant | playId、playerId、nameAtPlay、colorAtPlay | プレイ当時の名前・色を保持。colorAtPlayは必須。playId+playerIdとplayId+colorAtPlayをそれぞれ一意にする。表示順は色のR→B→Y→Gで決め、受信順は保存しない |
| SongBest | songRefId、playerCount、score、isFullCombo、hasFullCombo、tiedOthers、participants、updatedAt | 曲・人数ごとのランキング1位の集計結果（曲一覧・閲覧APIが読む）。songRefId+playerCountを主キーとし、記録のない組み合わせの行は持たない。hasFullComboは1位に限らずFCの記録があるか、participantsは1位の組の記録時点の名前と色。記録の受付時に保存と同じトランザクションで作り直す。記録を直接変えたとき（除外、旧IDの紐付けの反映、旧記録の取り込み直し）も作り直す |
| LegacyIdentityMapping | 移行用playerId、対応する新playerId、確認状態 | 確認できた旧IDと新IDの対応だけを管理する。名前一致だけの自動紐付けはしない。対応を記録に反映するとチームのまとまりが変わるため、反映後にSongBestを作り直す |

## 曲マスター

- 正本はランキングDB。v1は管理者（運営者とゲーム開発者）が曲登録API（[API仕様](api-contract.md#曲登録api管理者)）または登録スクリプトで登録・修正する。管理画面は後回し。
- 曲番号順の並べ替えは`ORDER BY CAST(game_song_id AS INTEGER), game_song_id`とする（4桁以上・先頭ゼロ混在でも数値順）。この式とstatusの索引を設け、約3,000曲に増えても曲一覧の1ページ表示で全件を走査しないようにする。曲名・アーティストの部分一致検索は全件走査を許容する。
- 公開の曲一覧・ランキング・成績受付の対象はstatus=approvedの曲だけ。v1ではgameSongIdを必ず持つapprovedの曲だけが存在する。
- 曲情報の修正は同じ行の更新とし、内部ID・gameSongIdを変えない。修正しても既存のPlayと代表記録はそのまま残る。
- levelSortValueはlevelからサーバー側で算出する。LyricDataCreatorと同じく、整数部×3に「+」なら+1、「-」なら-1を加える。levelがnull・`-`・`?`ならlevelSortValueはnull（難易度順では最後）。`-`・`?`は文字列のまま保存・表示する。
- 将来の譜面投稿では、未承認曲（pending、gameSongIdなし）として仮登録し、承認時にgameSongIdを設定してapprovedにする。このためgameSongIdを主キーにしない。
- 曲の削除・gameSongIdの変更・非公開化は管理機能の残課題とする。

## 組み合わせと代表記録

組み合わせキーは集計のためにPlay.teamKey列へ保存する。新規受付・旧記録の移行ともWeb側で参加者IDから生成し、クライアントからは受信しない。
参加者IDは保存するplayerIdと同じ正規化を適用（UUIDは小文字化）し、重複がないことを検証してから文字列の辞書順にソートする。
ソートしたID配列を空白なしのJSON配列文字列にシリアライズしたものをteamKeyとする。単純な区切り文字結合やハッシュ化は行わない。
同じ参加者なら順序・名前・色・ホストの違いによらず同じキーになる。曲・人数・スコア・FC・TAIPEN・バージョンはキーに含めない。
同じチームの複数プレイを保存するため、teamKeyおよびsongRefId+playerCount+teamKeyには一意制約を付けない。

曲ID・人数・teamKeyでまとめ、score降順、フル達成優先、receivedAt昇順、playId辞書順で代表を選ぶ。
FCのtrueを優先し、移行分のfalseとnullは同じ優先度にする案。nullをfalseに書き換えない。
異なるチームの順位は得点だけによる競技順位（1位、1位、3位）。同点の表示順はreceivedAt、playIdで安定させる。
TAIPEN4人は通常の4人と同じランキングに含める（v1ではゲームから送られない）。サバイバルも区別しない。
receivedAtで先着を判定する。実際の達成順とは限らない。
移行分のreceivedAtはインポート受付時刻。旧記録の達成日時はランキングDBには保存せず、受付時刻への置き換えにも使わない。
移行分が同点の場合に新規記録と比較される順序はインポート時刻に依存する。表示は「受付日時」または「移行受付日時」とし、達成日時とは表示しない。

ゲームバージョンは分類キーにしない。譜面修正後も既存のランキングに残す。
除外記録は代表選択から外す。保存方式・索引は、件数に応じて決める。最初から別の集計DBを必須にしない。
曲一覧の1位は表示のたびに集計するとD1の読み取りが1ページ約1万行になったため、SongBestに集計結果を持つ。除外や旧IDの紐付けを反映する処理を作るときは、該当する曲・人数（または全体）のSongBestを作り直すこと（`src/lib/song-best-sql.ts`）。

## 保存・再送の整合性

- Play.playIdにDB一意制約。PlayParticipantのplayId+playerIdとplayId+colorAtPlayも一意にする。
- プレイ（teamKey・playerCountを含む）と参加者は1トランザクション。途中失敗で一部だけ保存しない。
- teamKeyは保存する参加者ID集合、playerCountはその件数と常に一致させる。移行後のID対応修正などで参加者IDが変わる場合は、同じトランザクションで再計算する。
- 同じplayIdの再送は本文を比較せず200とする。同時の挿入競合もロールバック後に既存記録のreceivedAtを返して200。比較用の元の登録値は保持しない。
- 表示順（色順）と、playerIdをソートしたチーム判定用の順は分離する。
- 新規成績は全参加者の初回登録完了（Player.tokenHashがnullでない）が前提。未登録参加者を受付時に自動作成しない。旧記録の移行は専用処理とし、tokenを生成しない。
- token失効はPlayer.revokedAtで管理する。プレイヤーID自体が認証になるわけではない。
- 初回登録の同一ID・同一token再送は200、異なるtokenは409、失効済みの同一tokenは401。既存行を更新・再有効化しない。別IDで同じtokenの再利用も409。並行登録は一意制約とトランザクションで保護する。
- 初回登録の応答消失はクライアントで事前保存したID・tokenの再送で対応し、復旧用テーブル・暗号鍵・期限削除ジョブは設けない。詳細は[初回登録・再送仕様](auth-options.md)を参照。
- 拒否した成績はDBに保存しない。未送信キュー・運用用短期ログは全受理プレイ履歴と区別する。
- 初期索引候補はsongRefId+playerCount+teamKey+score（チーム別集計）、songRefId+playerCount+score（ランキング取得）、参加者playerId。playIdは一意制約で索引を持つ。具体的な集計・索引はDB選定後に確認する。

## 名前・IDの注意

名前はプレイ時点のnameAtPlayを保持する。プレイヤー名検索は代表記録を選んでから、その代表記録のnameAtPlayに対して行う。別記録の名前・最新名・過去名の一覧からIDを検索しない。改名後の名前が代表記録に含まれなければ、その名前では見つからない。
FC絞り込み併用時はFC記録から代表選択した後に名前検索する。最新名・別名検索用のテーブルは追加しない。
セーブデータ保存により同環境でIDを維持できるが、別PC移行・セーブ紛失・共有セーブ時の扱いは別問題。
IDの衝突対策だけでは、同じセーブのコピーによる同一IDの複数利用を防げない。

## LyricDataCreator調査

2026-10-10にGitHub mainを確認。参照コミット: 8dd9b708760b7c09aeacdb2199bb24ac6f10369d。

- [schema.prisma](https://github.com/mmhige0/LyricDataCreator/blob/8dd9b708760b7c09aeacdb2199bb24ac6f10369d/prisma/schema.prisma): Songにid、title、artist、youtubeUrl、level、levelValue、scoreEntries、createdAt、updatedAt。
- [songQueries.ts](https://github.com/mmhige0/LyricDataCreator/blob/8dd9b708760b7c09aeacdb2199bb24ac6f10369d/lib/songQueries.ts): 曲一覧は歌詞を含めずid、title、artist、youtubeUrl、levelを選択。
- [levels.ts](https://github.com/mmhige0/LyricDataCreator/blob/8dd9b708760b7c09aeacdb2199bb24ac6f10369d/lib/levels.ts): levelValueは整数難易度×3に、+なら1、-なら-1を加える方式。
- [import-songs/route.ts](https://github.com/mmhige0/LyricDataCreator/blob/8dd9b708760b7c09aeacdb2199bb24ac6f10369d/app/api/import-songs/route.ts): titleで既存曲を探し、全削除・採番リセットのオプションがある。

- [importSongs.gs](https://github.com/mmhige0/LyricDataCreator/blob/8dd9b708760b7c09aeacdb2199bb24ac6f10369d/scripts/gas/importSongs.gs): 曲一覧シートの「曲番」列はTXTファイル名の特定だけに使われ、DBには保存されない。

既存内部IDをゲーム共通の不変IDとみなさない（曲名一致での更新・採番リセットがあるため）。Songに連携先IDの列は持たない。
曲名での自動一致を恒久的な紐付けに使わない。
歌詞・タイムスタンプ・動画はランキングの必須データではない。

### 連携方針（確定）

- 曲一覧シートの「曲番」はゲーム曲ID（gameSongId）と同じ。
- 曲一覧シートはランキング移行完了後に廃止する。曲番・曲名・アーティスト・難易度の正本はランキングDBとする。
- 同期方向はランキング→LyricDataCreatorの一方向。LyricDataCreatorは公開の曲一覧API（GET /api/v1/songs）から曲情報を取得し、gameSongIdで突き合わせる。逆方向の同期は行わない。
- 譜面TXT・YouTube URLはLyricDataCreatorだけが保持し、ランキングDBには保存しない。譜面だけの修正ではランキング側の更新は不要。
- シート廃止に伴うLyricDataCreator側の曲取り込み（現在はシート＋Drive）の再設計は、LyricDataCreatorリポジトリの課題とする。

## 移行（確定）

移行元は現在のスプレッドシートのみ。他の送信元データ・ログは残っていない。曲別ランキング表を移行対象にし、集計・一覧表を重複して取り込まない。実データの再取得・保存は設計変更には不要。

1. 各曲の1〜4人の横並びブロックを、曲・人数・スコア・参加者名を持つ成績へ展開する。
2. 曲マスターを曲一覧シートの曲番（=gameSongId）・曲名・アーティスト・難易度から一度だけ初期登録する（曲登録APIまたは同じ検証規則の移行処理）。曲別ランキング表は曲番で曲マスターに対応付ける。曲番で対応を確認できない曲は曖昧な曲名一致で自動確定せず、確認できるまでその曲の取り込みを保留する。
3. 曲ID×人数×名前の組み合わせでまとめ、最高スコアの1件だけを選ぶ。名前の並び順は無視する。名前は完全一致で比較し、前後空白除去・大小文字変換・Unicode正規化・別名統合はしない。同じ名前が複数人いる場合も人数を保持した配列（多重集合）で比較する。比較キーはソートした名前配列のJSON表現とし、名前に区切り文字が含まれても衝突させない。
4. 同点の候補は移行元の固定したタブ順・行番号・人数ブロック順で先の1件を選ぶ。これは移行の再現性のためであり達成順ではない。次点以下は移行しないため、後日除外しても旧シートの次点はDBから復帰できない。
5. 完全一致の名前を基準に内部専用の移行用playerIdを割り当てる。同じ名前が同一チームに複数ある場合は出現数分の区別可能なIDを使い、参加者IDの一意性と人数を保つ。対応は移行処理用の管理データとして維持する。移行用playerIdは`legacy-`で始まる形式とし、新規UUIDv4と区別する。初回登録APIでは受け付けない。Playerに種別の列は設けない。名前一致は旧記録の集約ルールであり、実在する人物の同一性を保証しない。
6. 新しいplayerIdへは自動で紐付けず、確認できた対応だけをLegacyIdentityMappingで管理する。改名前後も推測でまとめない。未確認の旧チームと新チームは別として扱う。同一プレイ内の複数の旧IDが一つの新IDへ重なる対応は自動適用せず、参加者ID重複を解消できるまで保留する。
7. isFullCombo・isTaipen・gameVersion・hostPlayerIdはnullとする。不明をfalseや推測値に置き換えない。colorAtPlayは移行元に情報がないが、表示順を保つため、シート上の参加者の並び順に1人目からR・B・Y・Gを割り当てる（実際の色ではなく仮定）。旧達成日時の列は追加せず、receivedAtには移行バッチの初回インポート受付時刻を設定する。
8. 割り当てた参加者IDから通常と同じ規則でteamKeyとplayerCountを生成する。確認済みの新IDへ対応を修正する場合も、参加者・teamKey・playerCountを一つのトランザクションで更新する。反映用SQL（[運用手順の「旧IDと新IDの紐付け」](operations.md#旧idと新idの紐付け)）は、D1へのファイル適用が1つのトランザクションにならない場合に備え、途中で失敗しても原因を直して流し直せば同じ結果になる順に文を並べる。
9. 移行元の行識別子は保存しない。公開前は移行分（hostPlayerIdがnullのPlayと参加者・移行用Player）をすべて削除して取り込み直せる。同点の選択規則が固定されているため、取り込み直しても同じ記録が選ばれる。公開後（新IDとの対応付け開始後）は取り込み直さない。
10. 曲・人数別の選択後件数、最高スコア、参加者数、再取り込み時の件数不変を照合する。新規APIの全受理記録保存とは区別する。

### 実データの取り扱い

設計書・コード・テストには架空データだけを使う。プレイヤー名・個別成績・移行ファイル・名前とIDの対応表をGit、PR、Issue、AIの作業メモリ・作業メモ、会話出力、ログ、共有成果物へ転記・保存しない。設計確認時の実データは処理中のメモリ内だけで扱い、終了時に破棄する。
実際の移行で必要な成績・ID対応・再取り込み管理情報は、移行先DB等の用途に必要な管理領域に限定する。移行元データを公開リポジトリへバックアップしない。
