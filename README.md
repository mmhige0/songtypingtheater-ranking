# 協力タイピングゲーム ランキングサイト

2026-10-11時点。プロジェクト名: songtypingtheater-ranking。
送信系API（曲登録・初回登録・成績送信）、送信回数制限、ランキング閲覧API・画面を実装し、Cloudflareへデプロイ済み。旧記録の移行インポーターは未実装。

- URL: `https://ranking.kayomodoki.com`（APIの送信先とランキング画面）
- 移行期間中は`https://songtypingtheater-ranking.songtypingtheater-ranking.workers.dev`も同じWorker・同じDBで受け付ける

## 文書

- [要件定義](docs/requirements.md): 確定した動作、推奨案、受入条件
- [API仕様](docs/api-contract.md): 採用済み契約、管理者用の曲登録API、閲覧API・画面、再送間隔等の残る調整案
- [初回登録・再送仕様](docs/auth-options.md): クライアント生成トークンの登録・応答消失対策
- [データ設計案](docs/data-design.md): 曲・プレイヤー・記録とLyricDataCreator連携
- [システム構成](docs/architecture.md): Cloudflare構成、D1でのトランザクション方針、送信回数制限、バックアップ
- [決定事項と残課題](docs/decisions.md): 残課題

## 状態と進め方

クライアント生成の個別installationToken方式と初回登録の再送仕様は合意済み。受付日時・gameVersion必須・全参加者登録完了・代表記録の時点名検索・旧記録の最高スコアのみの移行も採用済み。再送キュー100件/7日はゲーム側への推奨値で、ゲーム開発者とは未合意。構成はCloudflare（Workers＋D1）に決定。
文書中の「確定」は会話で合意された内容。「提案」は実装候補であり、ゲーム開発者との合意を意味しない。

1. 採用済みAPI差分をゲーム側実装へ共有する。
2. 曲マスターはランキングDBを正本とし、v1は管理者（運営者とゲーム開発者）が管理用キーで認証する曲登録APIで登録する方針で確定。旧シートの曲番はゲーム曲IDと同じで、移行時に曲マスターを初期登録する。残りは曲別ランキング表と曲番の対応確認。
3. Cloudflare無料枠の公式ドキュメント確認は完了（2026-10-11）。セーブ消失時の扱い・管理運用などの残課題を決める。
4. 曲登録、初回登録、記録受付、ランキング閲覧、旧記録の移行スクリプトは実装済み。

譜面投稿フロー（LyricDataCreatorからの投稿→未承認曲の仮登録→承認）はv1対象外の将来構想。

GitHubの作成先は `mmhige0/songtypingtheater-ranking`、公開リポジトリ。既存のLyricDataCreatorとは別プロジェクトとして準備。
技術スタックはCloudflare Workers＋Hono、D1、Drizzle、TypeScript（[システム構成](docs/architecture.md)）。費用目標は無料優先、月100円以内。

## 開発用チェックアウト

```sh
git clone https://github.com/mmhige0/songtypingtheater-ranking.git
npm ci
npm run db:migrate:local  # ローカルD1へマイグレーション適用
npm run dev               # http://localhost:8787
npm run check             # lint・型チェック・テスト
```

Node.js 22を使用。Cloudflare上の初期設定は[システム構成](docs/architecture.md#cloudflare上の初期設定管理者が実施)を参照。
ローカルの`npm run dev`で曲登録APIを使う場合は、`.dev.vars.example`を`.dev.vars`にコピーして`ADMIN_API_KEY`を設定する。

## デプロイ

`main`へpushすると、GitHub Actions（[ci.yml](.github/workflows/ci.yml)）がlint・型チェック・テストの成功後に`wrangler deploy`で本番へデプロイする。PRではデプロイしない。

- D1マイグレーションは自動適用しない。マイグレーションを含む変更は、`main`へpushする**前**に`npm run db:migrate:remote`で本番へ適用する（先にデプロイすると新しいコードが未作成のテーブル・列を参照して失敗する）。
- `ADMIN_API_KEY`はWorkerのsecretとして設定済みのものを使う。CIからは変更しない。
- 初回のみ、GitHubリポジトリのSettings → Secrets and variables → Actionsに以下を登録する。
  - `CLOUDFLARE_API_TOKEN`: Cloudflareで作成したAPIトークン。テンプレート「Edit Cloudflare Workers」を使い、ゾーンは`kayomodoki.com`（独自ドメインのルート設定に必要）。
  - `CLOUDFLARE_ACCOUNT_ID`: CloudflareのアカウントID。

## バックアップと復旧

- **直近7日以内の誤操作**: Cloudflare D1 Time Travelで、現在のDB全体を指定日時へ戻す。
- **7日より前・別DBへの復元**: 非公開の[バックアップ専用リポジトリ](https://github.com/mmhige0/songtypingtheater-ranking-backups)に保存した日次artifact（90日保存）から、新規DBへ復元する。
- 本番復旧では送信を止めて現在のDBを保存し、スキーマ・曲一覧・ランキングを確認する。artifactからの復元は、確認後に本番の接続先を切り替える。旧DBは復旧確認まで残し、日次バックアップの接続先も更新する。

具体的なコマンド・確認項目・切り戻しは[復旧手順](https://github.com/mmhige0/songtypingtheater-ranking-backups/blob/main/docs/backups.md)を参照（専用リポジトリの閲覧権限が必要）。復元時点より後の登録・成績は自動では引き継がれない。

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
- 同じ曲番で送ると曲情報を上書きする。曲番は変更できない。詳細は[API仕様](docs/api-contract.md#曲登録api管理者)。

## 公開前のテストデータ削除

結合テストは本番環境で行う。ゲーム公開前に、テストで登録された成績を削除する。曲（song）と初回登録したプレイヤーは残す。

```sh
npx wrangler d1 execute DB --remote --command "DELETE FROM play_participant; DELETE FROM play; DELETE FROM legacy_identity_mapping; DELETE FROM player WHERE token_hash IS NULL;"
npx wrangler d1 execute DB --remote --command "SELECT (SELECT COUNT(*) FROM song) AS songs, (SELECT COUNT(*) FROM player) AS players, (SELECT COUNT(*) FROM player WHERE token_hash IS NOT NULL) AS registered_players, (SELECT COUNT(*) FROM play) AS plays"
```

- 外部キーのため、この順序で削除する。誤って削除した場合はD1 Time Travelで7日以内に戻せる。
- 初回登録したプレイヤー（tokenHashあり。失効済みを含む）は、テスト端末のIDを公開後も使えるよう残す。playersとregistered_playersが一致することを確認する。削除した場合、その端末は保存済みの同じplayerId・tokenで初回登録（`POST /api/v1/installations`）を送り直せば再登録できる。
- 旧記録の移行より**前**に行う。移行後に実行すると移行した記録も消える（順序: テストデータ削除 → 旧記録の移行 → ゲーム公開）。

## 旧記録の移行

旧スプレッドシートの曲別ランキング表（タブ名が曲番のタブ）から、曲・人数・名前の組み合わせごとの最高スコアを移行する。規則は[データ設計](docs/data-design.md#移行確定)。

1. 旧スプレッドシートを「ファイル → ダウンロード → Microsoft Excel（.xlsx）」で保存し、`imports/`（Git管理外）に置く。
2. 移行用SQLを作る。`--songs`には登録済みの曲マスターと同じCSV（`gameSongId,title,artist,level`）を渡す。

   ```sh
   npm run migrate-legacy-scores -- --songs imports/songs.csv --out imports/legacy-scores.sql imports/<ダウンロードしたファイル>.xlsx > imports/legacy-scores.log
   ```

   - 曲・人数ごとの件数と最高スコア、保留したタブ・曲番、取り込まなかった行（理由・曲番・人数・順位）、合計件数を表示する。名前は表示しない。
   - 曲マスターにない曲番、見出し（`【曲番】`・列見出し）がタブ名や想定の列と合わないタブは取り込まない。
   - スコアが空・整数でない、名前が人数分埋まっていない、`#REF!`等のエラー値の行は取り込まない。名前はAPIと同じく空白を除去せず完全一致で扱い、空白だけの名前も1つの名前として取り込む。
3. テストデータを削除してから（[公開前のテストデータ削除](#公開前のテストデータ削除)）SQLを適用し、件数を照合する。

   ```sh
   npx wrangler d1 execute DB --remote --file imports/legacy-scores.sql
   npx wrangler d1 execute DB --remote --command "SELECT (SELECT COUNT(*) FROM play WHERE host_player_id IS NULL) AS plays, (SELECT COUNT(*) FROM play_participant) AS participants, (SELECT COUNT(*) FROM player WHERE player_id LIKE 'legacy-%') AS players"
   ```

   - plays・participants・playersが表示の「移行する成績」「参加者」「移行用プレイヤー」と一致することを確認する。
- SQLは先に移行分（hostPlayerIdがnullのPlayと参加者・`legacy-`のPlayer）を削除するため、公開前なら作り直して何度でも適用できる。同点の選択規則が固定のため、同じファイルなら同じ記録が選ばれる。
- 新IDとの対応（legacy_identity_mapping）を登録した後は、外部キー違反で適用が失敗する（公開後は取り込み直さない）。
- 生成したSQL・ログ・ダウンロードしたファイルには実際の名前・成績が含まれる。移行・照合が終わったら削除する。

秘密情報・実際のプレイヤー名や成績・移行用の対応表はGit、PR、Issue、AIの作業メモリ・作業メモやログに残さない。設計書とテストには架空データだけを使う。
