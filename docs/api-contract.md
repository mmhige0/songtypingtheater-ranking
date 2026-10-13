# ランキング送信API v1 — Webサイト側設計

更新日: 2026-10-11（日本時間）

Unity/C#のホストからHTTPSでUTF-8 JSONを受信する。提示されたゲーム側仕様v1とレビュー回答を反映した設計文書。初回登録・成績送信・曲登録APIは実装済みで、Cloudflareへデプロイ済み（`https://ranking.kayomodoki.com`）。
初回登録のクライアント生成token方式、受付日時による先着判定、gameVersion必須は採用済み。再送キュー最大100件・初回保存から7日はゲーム側への推奨値であり、ゲーム開発者とは未合意。

## 対象・責務

- 新規APIで受理した全送信対象のクリア成績を保存し、代表記録の選択・ランキング表示はWeb側で行う。
- 通常とサバイバルは同じランキングで扱う。モード項目は受信しない。
- TAIPEN OFFは1〜4人、TAIPEN ONは4人のみ登録可能。ただしv1ではTAIPEN ONの記録はゲーム側で送信しない（送信する記録の`isTaipen`は常にfalse）。項目は将来の受け付けに備えて必須のまま残す。
- 対戦・Debug・ゲームオーバー・キャンセル・途中離脱時の送信抑止と、Master Client交代・開始時参加者スナップショットの管理はゲーム側の責務。Web側にPhoton固有の判定・ホスト交代処理を追加しない。
- Web側は受信したhostPlayerIdがplayersにちょうど1件存在することを検証するが、実際のMaster Clientだったことは証明できない。
- キー入力、採点、音楽同期、譜面・ハッシュ、曲配信、譜面投稿、Discord連携はv1対象外（譜面投稿の将来構想は[要件定義](requirements.md#将来構想v1対象外)）。本格的なスコア改ざん対策は後回し。

新曲は管理者が[曲登録API](#曲登録api管理者)で曲マスターへ登録してからゲームへ公開する（運用ルール）。登録前の曲への成績は422 UNKNOWN_SONGで再送されず失われる。v1では未承認曲を保留する仕組みは設けない。
成績送信はホストを含む全参加者の初回登録完了を条件とする。各端末は201または同一登録の200で完了を確認し、ゲーム側で全員の完了を確認してから送信する。登録待ちの間に送信本文のplayerIdを差し替えない。

## エンドポイント・認証

| メソッド | パス | 用途・状態 |
|---|---|---|
| POST | /api/v1/plays | 成績登録 |
| POST | /api/v1/installations | クライアント生成の送信トークン登録。合意済み |
| PUT | /api/v1/admin/songs/{gameSongId} | 管理者による曲マスター登録・修正。管理用キーで認証 |

### 採用: 個別installationToken

初回起動時にゲームがplayerId（UUIDv4）とinstallationTokenを生成し、API通信より前に両方を端末内へ永続保存する。
tokenはRandomNumberGeneratorによる乱数32バイトをBase64URL（パディングなし43文字）にする。
POST /api/v1/installationsのJSONにplayerIdとinstallationTokenを含めて登録する。
APIは正規形式のtoken文字列のUTF-8バイト列に対するSHA-256ハッシュと失効状態を保存し、平文・復元可能な暗号化tokenは保存しない。
成功応答はplayerIdとstatusだけを返し、tokenは返さない。Cache-Control: no-storeを指定する。

| 登録条件 | 応答 |
|---|---|
| 新規登録 | 201、status=created |
| 同一playerId・同一token、未失効 | 200、status=already_registered。既存情報は変更しない |
| 同一playerId・異なるtoken | 409 PLAYER_ID_ALREADY_REGISTERED。上書きしない |
| 同一playerId・同一token、失効済み | 401 REVOKED_TOKEN。再有効化しない |
| 別playerIdで既登録tokenを再利用 | 409 TOKEN_ALREADY_REGISTERED。失効済みも再利用不可 |

タイムアウト・通信切断・5xxは保存済みの同じID・tokenで再送する。429はRetry-Afterに従う。
登録済みでも応答を失った場合は同じ値の再送で成功を確認できる。詳細な形式検証・同時登録・受入確認は[初回登録・再送仕様](auth-options.md)を参照する。
registrationSecretや復旧用暗号化token・7日削除ジョブは設けない。セーブ消失によるtoken紛失は通信再送とは別問題であり、IDだけで再発行しない。

ゲームはPOST /playsに`Authorization: Bearer <installationToken>`を付ける。
APIはtokenに紐づくplayerIdとhostPlayerIdを照合する。tokenHashは一意とし、複数IDへの同じtokenの登録を拒否する。
installationTokenは有効期限なし・個別失効可能とする既存の初期案を維持する。
トークンをログ・応答調査情報・Photonのカスタムプロパティへ出力しない。全参加者がホストへトークンを渡す必要はない。
公開の匿名登録は誰でも利用できるため、正規ゲームの証明にはならない。個別制限・失効のための方式である。
共通登録キー方式は採用しない。

## 共通規則

- HTTPSのみ。本文はUTF-8 JSON、Content-Typeはapplication/json、本文上限16 KiB。
- キーはcamelCase。不明フィールド、重複JSONキー、型不正、必須項目欠落は400。
- JSONパーサーで重複キーを検出する。通常の解析で最後の値に上書きするだけではこの条件を満たさない。
- UUIDv4を受理し、大文字は小文字へ正規化する。数字文字列のsongIdの先頭ゼロは保持する。
- colorは大文字のR/B/Y/Gのみ受理。小文字の自動変換はしない。
- 名前をHTMLとして解釈しない。表示側でテキストとして描画する。
- 認証ヘッダーを複数・曖昧な値で受け付けない。認証失敗で本文やトークンを反射しない。

## 成績登録本文

```json
{
  "playId": "a978c461-3a06-487d-80c8-552eb969031a",
  "songId": "001",
  "score": 123456,
  "isFullCombo": true,
  "hostPlayerId": "428d19c3-786c-4650-81c1-06848583d7fa",
  "players": [
    {
      "playerId": "428d19c3-786c-4650-81c1-06848583d7fa",
      "name": "プレイヤーA",
      "color": "R"
    },
    {
      "playerId": "f3e1a5de-d740-43d2-bce1-cd513c9b6790",
      "name": "プレイヤーB",
      "color": "B"
    }
  ],
  "gameVersion": "1.65",
  "isTaipen": false
}
```

全項目必須とする。gameVersionもv1新規送信では必須。移行データの不明値は別途許容する。

| フィールド | 型・検証 |
|---|---|
| playId | UUIDv4。再送でも同じID |
| songId | 数字3〜8桁の文字列。000不可。曲マスターのgameSongIdを指し、受付時に曲マスターの内部IDへ変換して保存する。新規はstatus=approvedの登録済み曲のみ |
| score | 整数、0〜2,147,483,647。小数不可 |
| isFullCombo | boolean。このプレイの達成判定 |
| hostPlayerId | UUIDv4。playersにちょうど1回存在 |
| players | 1〜4件、playerId重複不可、color重複不可。配列の順序は意味を持たず、表示順は色のR→B→Y→Gで決める。1〜3人では任意の色の組み合わせ（例: R・Y・G）を受理する |
| players[].playerId | UUIDv4。初回登録済みのIDのみ |
| players[].name | 1〜40 Unicode scalar values。制御文字・改行・不正なサロゲートを拒否。見た目の文字数やUTF-16コード単位数とは区別 |
| players[].color | R / B / Y / Gのみ |
| gameVersion | 1〜32の表示可能ASCII文字（U+0020〜U+007E） |
| isTaipen | boolean。trueはplayers.lengthが4の場合のみ |

teamKeyはWeb側で正規化した参加者IDから生成し、Playの列に保存する（生成規則はデータ設計を参照）。teamKeyは送信本文に追加しない。
人数はplayers.lengthから求め、playerNumは受信しない。曲名・アーティスト・難易度は曲マスターから取得する。
クライアント終了日時finishedAtはv1で受信しない。APIが初回保存時にUTCのreceivedAtを設定し、クライアントは変更できない。

## 検証・保存・同時再送

1. 認証、本文サイズ、JSON、型・構造・各値の形式の順に確認する。未認証のリクエストは本文を読まずに401とする。scoreは解析後の値が整数なら受理し、`1.0`・`1e3`等の表記の違いは区別しない。
2. 重複参加者・重複した色とhostPlayerIdの所属を確認する。tokenの所有IDとの一致も確認。
3. playIdの既存記録があれば、本文の内容を比較せずに200 already_registeredと初回のreceivedAtを返す。以降の検証・保存は行わない。
4. 新規のみ曲マスター登録（status=approved）・全参加者の初回登録済み状態（Player.tokenHashがnullでない）・TAIPEN人数・得点範囲を検証。tokenHashのないPlayer行（移行用）は登録完了とみなさない。未登録参加者は422 UNKNOWN_PLAYERで拒否し、受付時にPlayerを自動作成しない。ホストのtoken失効は認証で拒否する。同席者のtokenを受信・認証することは求めず、ここでは登録の存在を検証する。同席者のtokenが失効していても登録済みとして受理する（失効はその端末からの送信を止めるもの）。
5. teamKeyとplayerCountを生成し、プレイと全参加者を同じトランザクションで保存して201を返す。

DBのPlay.playIdに一意制約を設定する。存在確認後に同時保存が競合した場合、失敗したトランザクションをロールバックし、保存済みの記録のreceivedAtを再取得して200 already_registeredを返す。一意制約の競合を通常の500として返さない。
既存記録・参加者・初回receivedAtは再送で更新しない。除外済みの記録も再送で復活させない。

再送の本文は既存記録と比較しない。playIdはクライアントが生成するUUIDv4であり、偶然の重複は想定しない。ゲームの不具合等で別のプレイに同じplayIdを使った場合、後着の記録は保存されず200が返る。比較用の元の登録値は保持しない。

## 応答

新規は201、同じplayIdの再送は本文にかかわらず200。

```json
{
  "playId": "a978c461-3a06-487d-80c8-552eb969031a",
  "status": "created",
  "receivedAt": "2026-10-10T13:00:02.120Z"
}
```

再送時はstatusをalready_registeredにし、初回のreceivedAtを返す。

```json
{
  "error": {
    "code": "UNKNOWN_SONG",
    "message": "曲が未登録です",
    "retryable": false
  },
  "requestId": "<調査用ID>"
}
```

| HTTP | code | 再送 |
|---|---|---|
| 400 | INVALID_REQUEST / DUPLICATE_PLAYER_ID / DUPLICATE_COLOR | 不可 |
| 401 | INVALID_TOKEN / REVOKED_TOKEN | 不可 |
| 403 | HOST_ID_MISMATCH | 不可 |
| 413 | PAYLOAD_TOO_LARGE | 不可 |
| 415 | UNSUPPORTED_MEDIA_TYPE | 不可 |
| 422 | UNKNOWN_SONG / UNKNOWN_PLAYER / INVALID_TAIPEN_PLAYER_COUNT / SCORE_OUT_OF_RANGE | 不可 |
| 429 | RATE_LIMITED | Retry-Afterを考慮して再送 |
| 500 / 502 / 503 / 504 | SERVER_ERROR | 可 |

400は形式・型・構造の不正、422は正しい型だが登録条件に合わない値。scoreの小数・文字列は400、整数の範囲外は422。
全非再送エラーでretryable=false、429・5xxでtrueを返す。プロキシ由来の本文なしエラーや通信失敗もHTTPステータス・通信結果で扱う。
初回登録の応答・再送規則は[初回登録・再送仕様](auth-options.md)を参照。

## 再送・保留キュー

以下はすべてゲーム側への推奨案であり、ゲーム開発者とは未合意（保存上限100件・初回保存から7日を含む）。サーバーは件数・期間に依存せず、同じplayIdの再送を何度でも200で受ける。Web側で失敗履歴を保存する機能は作らない。

- HTTP送信前にplayIdと完成済み本文を永続保存。認証情報は本文と別に管理する。
- タイムアウト15秒。通信失敗・429・5xxのみ再送。2 / 5 / 10 / 30 / 60 / 120 / 300秒、その後300秒間隔。各待機に±20%のばらつき。
- Retry-Afterは秒数またはHTTP日付を扱い、指定された最短待機時間より早く再送しない。
- 保留の保存上限は100件、初回キュー保存から7日間とする。超過時は古いものから破棄する。期限切れや非再送エラーは保留から削除し、失敗履歴へ移さない。
- 非再送エラーの1件が後続を止めない。再送待ち中の1件も、送信可能な別の記録を妨げない。
- 選曲・結果画面で同時1件。曲中の開始・再試行は行わない。ゲーム側の進行を待たせない。
- 成功または登録済み応答（200 already_registered）で保留を削除。別playIdへの振り替えは禁止。
- この保留キューは未送信成績の一時保存であり、失敗履歴の保存ではない。登録待ちも保存期間を延長する理由にしない。

Web側はエラー応答のために失敗成績をDBへ登録しない。運用調査用の短期ログ・件数集計は成績履歴と分け、秘密情報や本文全体を残さない。

## 送信制限の初期案

実測後に調整可能なサーバー設定とし、拒否時は429とRetry-Afterを返す。
以下は目安であり厳密には従わない。実際の期間・回数はCloudflareの機能に合わせる（[システム構成](architecture.md#送信回数制限)）。

- /playsは送信元IP単位で10分100リクエスト、上限16 KiB。成功・再送・拒否を含むリクエスト数で制限する。
- 認証済みinstallation単位でも10分100リクエスト。自己申告のplayerIdだけで制限しない。
- /installationsはIP単位で1時間20リクエスト。匿名の大量登録を完全には防げない。
- 共用回線・起動時の保留送信で429が出る可能性を考慮し、拒否して破棄せず再送対象とする。
- 閲覧APIの制限は送信APIと別枠。信頼するプロキシ経由の送信元IPだけを使い、任意の転送ヘッダーで回避されない構成にする。

## ランキング

- 曲ID×人数別。保存済みteamKeyで同じ参加者ID集合をまとめる。参加者の表示順は色のR→B→Y→G。
- 代表選択はscore降順 → FC達成優先 → receivedAt昇順 → playId辞書順。
- FC達成優先は同じチームの代表選択だけに使用。異なるチーム間の順位は得点のみの競技順位（100、100、90なら1、1、3）。
- FC印は選ばれたプレイ自身の値。TAIPEN4人記録も同じ曲・人数のランキングに含める。
- gameVersionでランキングを分割しない。
- プレイヤー名検索は、チームごとの代表記録を選んだ後、その記録のnameAtPlayだけを対象にする。最新名・別プレイの名前からIDを引いて検索しない。FC絞り込みを併用する場合はFC記録に絞る → 代表選択 → 名前検索の順とする。検索によって次点の記録へ差し替えない。
- receivedAtは受付順であって達成順ではない。再送遅延で逆転し得る。受付順を採用する。
- 移行記録のFC不明・インポート受付時刻による順序はデータ設計を参照。

## 受入確認

1. 正しい2人クリアは201、プレイ1件・参加者2件を保存。
2. 同じplayIdの再送は200。応答消失後も初回receivedAtを返す。
3. 同じplayIdの同時到着も1件のみ保存し、どちらも201または200を返す（500にしない）。
4. 同じplayIdで得点・名前等が異なる本文を送っても200を返し、既存記録・参加者は変更しない。
5. 未登録曲は422。TAIPEN3人は422、TAIPEN4人は201。
6. 重複参加者・同じ色の参加者は400。R・Y・Gの3人は201で、表示はR・Y・Gの順。ホストが含まれない・token所有IDと不一致なら403。
7. colorのrや任意HTML色は400。日本語・引用符・HTML風の名前は文字列として安全に表示。
8. 16 KiB超過は413。重複JSONキー・不明フィールド・型違い・欠落は400。
9. 同じチーム・同点なら後着でもFCを代表にする。別チーム同点は同順位。
10. 失敗した成績はDBに保存せず、除外済み成績を再送で復活させない。
11. 全員登録済みなら新規成績を受理する。未登録参加者を含む場合は422 UNKNOWN_PLAYER、retryable=falseで成績・参加者を保存しない。移行用Player行だけがある場合も登録済みと扱わない。
12. gameVersion欠落は400。finishedAtは不明フィールドとして400。再送でも初回receivedAtを維持する。
13. 代表記録と別の記録だけにある名前で検索しても、次点の記録を代わりに表示しない。
14. （ゲーム側・推奨案）キューは100件を超えたら古いものから破棄し、初回保存から7日で期限切れにする。再起動・再試行で期限を延ばさない。

## 曲登録API（管理者）

v1の曲マスター登録手段。管理画面は後回しとし、管理者（運営者とゲーム開発者）は登録スクリプト（CLI）またはHTTPクライアントからこのAPIを呼ぶ。移行時の曲マスター初期登録（約500曲）も同じ検証規則で行う。

### 認証

- `Authorization: Bearer <adminApiKey>`。adminApiKeyは32バイト以上の乱数をサーバーの環境変数に保持する。
- 定数時間で比較する。installationTokenとは別の資格情報で、installationTokenでは管理APIを利用できない。
- 管理用キー・認証ヘッダーをログ・エラー応答へ出さない。キーが漏洩したら環境変数を差し替えて無効化する。
- キー未設定・不一致・ヘッダー不正は401 INVALID_TOKEN。サーバー側でキーが未設定なら全リクエストを拒否する。

### 本文

```json
{
  "title": "架空の曲名",
  "artist": "架空のアーティスト",
  "level": "5+"
}
```

共通規則（HTTPS、UTF-8 JSON、16 KiB、不明フィールド・重複キー・型不正は400）に従う。

| 項目 | 型・検証 |
|---|---|
| パスのgameSongId | 成績登録のsongIdと同じ形式（数字3〜8桁、000不可、先頭ゼロ保持） |
| title | 必須。1〜200 Unicode scalar values。制御文字・改行・不正なサロゲートを拒否 |
| artist | 必須キー。文字列（1〜200、titleと同じ文字検証）またはnull |
| level | 必須キー。`^[1-9][0-9]?[+-]?$`の文字列、難易度未定・不明を表す`-`・`?`、またはnull。前後空白は受理しない |

levelSortValueはサーバーがlevelから算出し、本文では受け取らない（[データ設計](data-design.md#曲マスター)）。YouTube URL・譜面・歌詞は受け取らない。

### 動作・応答

全項目を指定する置き換え型の登録で、同じ本文の再送は結果を変えない。

| 条件 | HTTP | status |
|---|---|---|
| gameSongIdが未登録 | 201 | created（status=approvedで作成） |
| 登録済みで内容が異なる | 200 | updated（title・artist・level・levelSortValueを更新） |
| 登録済みで内容が同じ | 200 | unchanged |

```json
{
  "status": "created",
  "song": {
    "gameSongId": "001",
    "title": "架空の曲名",
    "artist": "架空のアーティスト",
    "level": "5+"
  }
}
```

- 更新で内部ID・gameSongId・status・既存の記録を変更しない。曲情報を修正しても同じランキングに記録が残る。
- gameSongIdの一意制約で同時登録の競合を検出し、500ではなく既存行に対する更新・unchangedとして処理する。
- 削除・gameSongId変更・非公開化のAPIはv1に設けない。
- エラーはINVALID_REQUEST（400）、INVALID_TOKEN（401）、PAYLOAD_TOO_LARGE（413）、UNSUPPORTED_MEDIA_TYPE（415）、RATE_LIMITED（429）、SERVER_ERROR（5xx）。応答形式は成績登録と同じ。
- 送信制限は成績登録・閲覧と別枠とし、初期登録の連続送信を妨げないようにする（v1は管理用キー認証のため制限しない）。

## 閲覧API

ログイン不要。対象はstatus=approvedの曲と除外されていない記録だけ。送信元IPごとの送信制限は送信APIと別枠（429の形式は送信APIと同じ）。
クエリの空文字は指定なしとして扱う。不正な値は400 INVALID_REQUEST。playerId・内部IDは返さない。サンプルの値は架空。

### GET /api/v1/songs

曲一覧。LyricDataCreatorもこのAPIで曲情報を取得し、gameSongIdで突き合わせる。

| クエリ | 内容 |
|---|---|
| q | 曲番号・曲名・アーティストの部分一致（英字の大文字・小文字は区別しない。全角・半角、ひらがな・カタカナは同一視しない）。100文字以内 |
| level | 難易度の完全一致（`5`・`5+`・`5-`・`-`・`?`） |
| sort | `id`（既定。曲番号の数値順）または`level`（難易度順、難易度なし・`-`・`?`は最後） |
| dir | `desc`（既定。降順）または`asc`（昇順）。難易度順は降順でも難易度なし・`-`・`?`を最後にし、同じ難易度の中は曲番号の昇順 |
| page / limit | ページ番号（1〜10000、既定1）と件数（1〜100、既定50） |

```json
{
  "songs": [
    {
      "gameSongId": "001",
      "title": "架空の曲名",
      "artist": "架空のアーティスト",
      "level": "5+",
      "bestScores": {
        "1": {
          "score": 987654,
          "name": "架空の名前",
          "isFullCombo": true,
          "participants": [{ "name": "架空の名前", "color": "R" }],
          "tiedOthers": 1
        },
        "2": {
          "score": 1234567,
          "isFullCombo": null,
          "participants": [
            { "name": "架空の名前A", "color": "R" },
            { "name": "架空の名前B", "color": "B" }
          ],
          "tiedOthers": 0
        },
        "3": null,
        "4": null
      }
    }
  ],
  "page": 1,
  "limit": 50,
  "total": 1
}
```

- bestScoresは人数ごとのランキング1位。記録がなければnull。
- 1位が同点で複数組いる場合は、ランキングの表示順で先頭の組（代表記録）を返し、残りの組数をtiedOthersに入れる。isFullCombo・participants（参加者の時点名と色、R→B→Y→G順）はその代表記録のもの。isFullComboのnullは不明（移行分）。
- 1人のnameはparticipantsの1人目と同じ（以前からの項目として残す）。

### GET /api/v1/songs/{gameSongId}/rankings

`{gameSongId}`は成績登録のsongIdと同じ形式。存在しない曲は404 NOT_FOUND。記録0件の曲は200で空の一覧。

| クエリ | 内容 |
|---|---|
| players | 人数1〜4（必須） |
| fc | `1`ならFC記録だけからランキングを作る（既定`0`） |
| name | プレイヤー名の部分一致（代表記録のnameAtPlayが対象。英字の大文字・小文字は区別しない）。100文字以内 |
| page / limit | ページ番号（1〜10000、既定1）と件数（1〜100、既定50） |

```json
{
  "song": { "gameSongId": "001", "title": "架空の曲名", "artist": "架空のアーティスト", "level": "5+" },
  "players": 2,
  "entries": [
    {
      "rank": 1,
      "score": 1234567,
      "isFullCombo": true,
      "receivedAt": "2026-10-10T13:00:02.120Z",
      "isLegacy": false,
      "participants": [
        { "name": "架空の名前A", "color": "R" },
        { "name": "架空の名前B", "color": "B" }
      ]
    }
  ],
  "page": 1,
  "limit": 50,
  "total": 1
}
```

- 処理順はFC絞り込み → チームごとの代表選択 → 順位付け → 名前検索。FC絞り込み時はFC記録の中で順位を付け直す。名前検索では順位を付け直さず、絞り込み前の順位をそのまま返す。
- 表示順はscore降順 → receivedAt昇順 → playId辞書順。
- isFullComboのnullは不明（移行分）。isLegacyは移行分（receivedAtはインポート受付時刻）。isTaipen・gameVersionは返さない。

### 閲覧画面

| パス | 内容 |
|---|---|
| `/` | ランキング（曲一覧。列幅固定の表、100件ずつ。表の上下にページ番号のボタンと前へ・次へを置く）。曲番号・曲名・アーティスト検索、Lv.1〜10の範囲のスライダーでの絞り込み（`levelMin`・`levelMax`。Lv.5〜7なら「5-」〜「7+」、範囲を絞るとレベル未設定の曲は除く）、No.・Lv.の列見出しで昇順・降順の並べ替え（`sort`・`dir`）。人数ごとの1位のスコア・FCとその下にプレイヤー名（全員）を表示（同点は「ほかN名」「ほかN組」）。狭い画面は表を横スクロール |
| `/songs/{gameSongId}` | 1〜4人のランキングを人数のチップ（タブ）で切り替えて大きく表示。各人数の上位10件と「すべて見る」。`players`で最初に開くタブ、`fc`・`name`で絞り込み |
| `/songs/{gameSongId}/players/{1〜4}` | 人数別のランキング（50件ずつのページ送り） |

- 受付日時は表示しない。フルコンボは王冠のマークで表示する。
- 検索結果に出さない。全応答（画面・API・エラー）に`X-Robots-Tag: noindex, nofollow, noarchive`を付け、画面には同じ内容のmeta robotsも入れる。robots.txtは置かない（巡回を止めると検索エンジンがnoindexを読めなくなるため）。AIクローラーはCloudflareの「AI Scrapers and Crawlers」のブロックで止める（Bot Fight Modeはゲームからの送信を妨げるおそれがあるため使わない）。
- JSを使わずに動く。JSが有効な場合、検索欄は入力が止まって250ms後に自動で検索し（検索ボタンなし）、「フルコンボのみ」はチェックした時点で反映する。結果だけを差し替えてURLを書き換え、人数のタブを切り替えたときもURLの`players`を書き換える。曲一覧の並べ替え・ページ送りも結果だけを差し替え、下側のページ送りでは結果の先頭へスクロールする（無効な場合は検索ボタン・Enterで検索、リンクでページ遷移）。
- 存在しない曲・パスは404、不正なクエリは400のHTMLを返す（`/api/`以下はJSON）。429の画面にもRetry-Afterを付ける。
- 見た目はLyricDataCreatorに合わせる（サイト名「Song Typing Theater」、同じテーマ色の変数・角丸・カード・チップ、Space Grotesk・Inter TightをGoogle Fontsから読み込み）。
- ライト・ダークは端末の設定に従う。ヘッダーの切り替えボタン（JSが有効な場合だけ表示）で選んだテーマはブラウザのlocalStorageに保存する。
