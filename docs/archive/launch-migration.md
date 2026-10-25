# 公開前の準備・旧記録移行（履歴）

[READMEへ戻る](../../README.md)

**公開前に使用した手順の記録です。稼働中の本番DBには実行しないでください。** テストデータ削除は本番の成績も削除し、旧記録の再取り込みは新IDとの紐付け後には実行できません。現在の保守には[運用手順](../operations.md)を使ってください。

以下の件数・書き込み見込み・制約は移行当時の記述です。現行スキーマでの実行を保証するものではありません。障害復旧は移行のやり直しではなく、バックアップからの復元として判断してください。

## 公開前のテストデータ削除

結合テストは本番環境で行う。ゲーム公開前に、テストで登録された成績を削除する。曲（song）と初回登録したプレイヤーは残す。

```sh
npx wrangler d1 execute DB --remote --command "DELETE FROM song_best; DELETE FROM play_participant; DELETE FROM play; DELETE FROM legacy_identity_mapping; DELETE FROM player WHERE token_hash IS NULL;"
npx wrangler d1 execute DB --remote --command "SELECT (SELECT COUNT(*) FROM song) AS songs, (SELECT COUNT(*) FROM player) AS players, (SELECT COUNT(*) FROM player WHERE token_hash IS NOT NULL) AS registered_players, (SELECT COUNT(*) FROM play) AS plays"
```

- 外部キーのため、この順序で削除する。誤って削除した場合はD1 Time Travelで7日以内に戻せる。
- 初回登録したプレイヤー（tokenHashあり。失効済みを含む）は、テスト端末のIDを公開後も使えるよう残す。playersとregistered_playersが一致することを確認する。削除した場合、その端末は保存済みの同じplayerId・tokenで初回登録（`POST /api/v1/installations`）を送り直せば再登録できる。
- 旧記録の移行より**前**に行う。移行後に実行すると移行した記録も消える（順序: テストデータ削除 → 旧記録の移行 → ゲーム公開）。

## 旧記録の移行

旧スプレッドシートの曲別ランキング表（タブ名が曲番のタブ）から、曲・人数・名前の組み合わせごとの最高スコアを移行する。規則は[データ設計](../data-design.md#移行確定)。

1. 旧スプレッドシートを「ファイル → ダウンロード → Microsoft Excel（.xlsx）」で保存し、`imports/`（Git管理外）に置く。
2. 移行用SQLを作る。`--songs`には登録済みの曲マスターと同じCSV（`gameSongId,title,artist,level`）を渡す。

   ```sh
   npm run migrate-legacy-scores -- --songs imports/songs.csv --out imports/legacy-scores.sql imports/<ダウンロードしたファイル>.xlsx > imports/legacy-scores.log
   ```

   - 曲・人数ごとの件数と最高スコア、保留したタブ・曲番、取り込まなかった行（理由・曲番・人数・順位）、合計件数を表示する。名前は表示しない。
   - D1の1日の書き込み上限（10万行、UTC 0時＝日本時間9時リセット）に収まるよう、SQLを`legacy-scores-1.sql`、`legacy-scores-2.sql`…に分けて書き出し、ファイルごとの件数と書き込み見込み（1ファイル8万行以下）を表示する。書き込み行数は索引の分も数えるため、件数よりかなり多い（約1万件で約15万行）。
   - 曲マスターにない曲番、見出し（`【曲番】`・列見出し）がタブ名や想定の列と合わないタブは取り込まない。
   - スコアが空・整数でない、名前が人数分埋まっていない、`#REF!`等のエラー値の行は取り込まない。名前はAPIと同じく空白を除去せず完全一致で扱い、空白だけの名前も1つの名前として取り込む。
3. テストデータを削除する（[公開前のテストデータ削除](#公開前のテストデータ削除)）。
4. SQLを番号順に、**1日（UTC）に1ファイルずつ**適用する。日本時間9時をまたげば別の日になるため、8時台に1つ目、9時過ぎに2つ目を流せば同じ朝に終わる。各ファイルの前に、`time-travel info`で表示される現在のブックマークを控える。

   ```sh
   npx wrangler d1 time-travel info DB
   npx wrangler d1 execute DB --remote --file imports/legacy-scores-1.sql
   # 日本時間9時（UTC 0時）を過ぎてから
   npx wrangler d1 time-travel info DB
   npx wrangler d1 execute DB --remote --file imports/legacy-scores-2.sql
   ```

   - 1つ目の後、2つ目を流すまでは旧記録の一部だけが表示される。
   - 失敗したら、そのファイルの前に控えたブックマークへ戻し（`npx wrangler d1 time-travel restore DB --bookmark=<ブックマーク>`）、翌日（UTC）にそのファイルから流し直す。途中まで入った分をSQLで消して入れ直すと、削除も書き込み行数に数えるため、その日の上限を超えることがある。上限超過で失敗した場合は、その日はDBへの問い合わせ自体ができない。
5. 件数を照合する。

   ```sh
   npx wrangler d1 execute DB --remote --command "SELECT (SELECT COUNT(*) FROM play WHERE host_player_id IS NULL) AS plays, (SELECT COUNT(*) FROM play_participant) AS participants, (SELECT COUNT(*) FROM player WHERE player_id LIKE 'legacy-%') AS players"
   ```

   - plays・participants・playersが表示の「移行する成績」「参加者」「移行用プレイヤー」と一致することを確認する。
- 1つ目のSQLは先に移行分（hostPlayerIdがnullのPlayと参加者・`legacy-`のPlayer）を全削除するため、公開前なら作り直して1つ目から何度でも適用できる。同点の選択規則が固定のため、同じファイルなら同じ記録が選ばれる。ただし全件を入れた後は、全削除だけで約15万行の書き込みになり1日の上限を超える。全件を入れた後に作り直す場合は、1つ目の前に控えたブックマークへTime Travelで戻してから、翌日（UTC）に1つ目から流す。
- 新IDとの対応（legacy_identity_mapping）を登録した後は、外部キー違反で適用が失敗する（公開後は取り込み直さない）。
- 生成したSQL・ログ・ダウンロードしたファイルには実際の名前・成績が含まれる。移行・照合が終わったら削除する。
