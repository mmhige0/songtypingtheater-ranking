# 運用手順

[READMEへ戻る](../README.md)

曲登録・表示設定・記録の保守に使う手順です。ローカルの準備とデプロイは[README](../README.md#開発環境の準備)を参照してください。コマンドはリポジトリのルートで実行します。`sh` の例は Bash / WSL 向けです。

## 目次

- [曲の登録](#曲の登録)
- [今日の曲・人気曲の表示設定](#今日の曲人気曲の表示設定)
- [曲一覧の1位の作り直し](#曲一覧の1位の作り直し)
- [旧IDと新IDの紐付け](#旧idと新idの紐付け)

## 曲の登録

曲の登録・修正は管理者（運営者とゲーム開発者）が管理用キーを使って行う。新曲はゲームに公開する前に登録する（未登録の曲番の成績は`422 UNKNOWN_SONG`で失われる）。管理用キーは公開の場所に書かない。

### 登録スクリプト（CSVでまとめて登録）

CSVは1行目を`gameSongId,title,artist,level`とし、artist・levelは空欄ならnullとして登録する。levelは`5`・`5+`・`5-`の形式、または`-`（未定）・`?`（不明）。CSVは`imports/`（Git管理外）に置く。

```sh
ADMIN_API_KEY=<管理用キー> npx tsx scripts/register-songs.ts --base-url https://ranking.kayomodoki.com imports/songs.csv
```

- 1行ずつ`PUT /api/v1/admin/songs/{gameSongId}`を送り、created・updated・unchanged・エラーを表示する。エラーが1件でもあれば終了コード1。
- 同じCSVを再実行しても結果は変わらない（変更のない曲はunchanged）。
- HTTPSのURLだけを受け付ける（HTTPはlocalhostのみ）。

### 1曲だけ登録・修正する

```sh
curl -X PUT "https://ranking.kayomodoki.com/api/v1/admin/songs/<曲番>" \
  -H "Authorization: Bearer <管理用キー>" \
  -H "Content-Type: application/json" \
  -d '{"title":"曲名","artist":"アーティスト名","level":"5+"}'
```

- 本文は`title`・`artist`・`level`の3項目すべて必須（artist・levelはnull可）。新規は201 created、変更ありは200 updated、変更なしは200 unchanged。
- 同じ曲番で送ると曲情報を上書きする。曲番は変更できない。詳細は[API仕様](api-contract.md#曲登録api管理者)。

## 今日の曲・人気曲の表示設定

人気曲は表示中（昨日までの3日間のプレイ回数、最大5曲）。今日の曲は停止中で、データ取得を行わず `/daily` は404を返す。記録や曲データは削除しない。

`src/lib/page-features.ts` の `PAGE_FEATURES` で、再開する機能だけ `true` に変更し、`npm run check` を通してデプロイする。

- `dailySongs`: トップの今日の曲と `/daily` をまとめて再開する。
- `popularSongs`: トップの人気曲を再開する。昨日までの3日間を集計するため、再開前にDBの読み取り負荷を確認する。

人気曲のキャッシュはWorkerのisolate内で最大24時間保持し、日本時間の日付が変わると期限内でも再集計する。除外・曲名・公開状態の変更の反映は翌日まで遅れる。isolateの破棄・増加・デプロイで再取得されるため、DB取得が全体で1日1回になる保証はない。

キャッシュ命中時の人気曲追加読み取りは0行。未命中時はSQLを1回実行する。5曲表示でも読み取りが5行になるわけではなく、受付日時の索引で3日間のプレイを読み、曲ごとに集計して曲マスターと結合する（参加者テーブルは読まない）。正確な行数は本番D1の `meta.rows_read` で確認する。

DBの変更やデータの再登録は不要。

## 曲一覧の1位の作り直し

曲一覧・閲覧APIの人数ごとの1位は、集計済みの`song_best`を読む。記録の受付時には自動で更新されるが、記録を直接変えたとき（除外、旧IDと新IDの紐付けの反映、SQLでの修正・削除）は作り直す。

```sh
npm run rebuild-song-best -- --out imports/rebuild-song-best.sql
npx wrangler d1 execute DB --remote --file imports/rebuild-song-best.sql
```

- D1の書き込みは`song_best`の行数（最大で曲数×4）の4倍程度（全行の削除と挿入、表と主キーの索引）。読み取りは全記録分。

## 旧IDと新IDの紐付け

本人に確認できた旧ID（`legacy-`）と新IDの対応だけを旧記録に反映し、旧記録と新記録を同じ人（チーム）としてランキングに出す。名前の一致だけでは紐付けない（[データ設計](data-design.md#旧記録とidの紐付け)）。

1. 名前が完全一致する候補を出す（読み取りのみ。走査行数は記録数に応じて増える）。結果は`imports/`のファイルにだけ書き、画面やログに名前を残さない。

   ```sh
   npx wrangler d1 execute DB --remote --json --command "SELECT l.player_id AS legacy_id, n.player_id AS new_id, l.name_at_play AS name FROM (SELECT DISTINCT player_id, name_at_play FROM play_participant WHERE player_id LIKE 'legacy-%') AS l JOIN (SELECT DISTINCT pp.player_id, pp.name_at_play FROM play_participant AS pp JOIN player AS p ON p.player_id = pp.player_id WHERE p.token_hash IS NOT NULL) AS n ON n.name_at_play = l.name_at_play" > imports/legacy-link-candidates.json
   ```

2. 本人に確認できた対応だけを`imports/legacy-links.csv`に書く。1つの新IDに複数の旧IDを対応させてよいが、同じ旧IDは1行だけにする。

   ```csv
   legacyPlayerId,newPlayerId
   legacy-00001,00000000-0000-4000-8000-000000000001
   ```

3. 反映用SQLを作る。DBへは書き込まず、件数だけを表示する。

   ```sh
   npm run link-legacy-players -- --out imports/legacy-links.sql imports/legacy-links.csv
   ```

4. 現在のブックマークを控えてから適用する。

   ```sh
   npx wrangler d1 time-travel info DB
   npx wrangler d1 execute DB --remote --file imports/legacy-links.sql
   ```

   - 旧記録の参加者を新IDに置き換え、teamKey・playerCountを作り直し、対応を`legacy_identity_mapping`に`confirmed`で登録し、`song_best`を作り直す。時点名は変えない。新しく受け付けた記録は変えない。
   - 次の場合は失敗する。原因の行をCSVから直して作り直したSQLを流せば、途中まで反映された分も含めて同じ結果になる（同じSQLを2回流しても変わらない）。
     - 旧IDが既に別の新IDへ対応済み（`CHECK constraint failed`）
     - 同じプレイにいる複数の旧IDを同じ新IDへ対応させた（`UNIQUE constraint failed`）
     - 旧ID・新IDがDBにない（`FOREIGN KEY constraint failed`）
   - 書き込みは対象の参加者・記録の数行ずつと`song_best`の作り直し分。
- 紐付けた後は旧記録を取り込み直せない。
- 候補・CSV・SQLには実際の名前やIDの対応が含まれる。終わったら削除する。

秘密情報・実際のプレイヤー名や成績・移行用の対応表はGit、PR、Issue、AIの作業メモリ・作業メモやログに残さない。設計書とテストには架空データだけを使う。

