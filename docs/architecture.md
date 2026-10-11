# システム構成

更新日: 2026-10-11（日本時間）

Cloudflareの無料プランで構築する。他構成との比較は行わず、この構成で進める。
無料枠の数値・機能の提供状況は変わり得る。2026-10-11時点の公式ドキュメントの確認結果は[無料枠・制約の確認結果](#無料枠制約の確認結果)を参照。

## 構成

| 要素 | 採用 |
|---|---|
| 実行環境 | Cloudflare Workers（APIと閲覧画面を1つのWorkerで提供） |
| フレームワーク | Hono。閲覧画面はHono JSXによるサーバー描画 |
| DB | Cloudflare D1（SQLite系） |
| ORM・マイグレーション | Drizzle ORM。drizzle-kitで生成したSQLを`wrangler d1 migrations`で適用 |
| 送信回数制限 | Workers Rate Limiting（バインディング）。使えない場合はD1の固定窓カウンター |
| バックアップ | D1 Time Travel（7日）＋管理者の手動`wrangler d1 export` |
| 言語・テスト | TypeScript（strict）、Vitest＋`@cloudflare/vitest-plugin`（旧`@cloudflare/vitest-pool-workers`） |
| 設定・型 | `wrangler.jsonc`。Workerの型は`wrangler types`で生成（`worker-configuration.d.ts`はコミットせず、型チェック時に生成） |
| ドメイン | 当面はworkers.devのサブドメイン |

LyricDataCreator（Vercel）とは運用基盤が別になる。連携は公開の曲一覧APIの読み取りだけで、相互に依存しない。

## 環境・秘密情報

- 本番とローカル開発（`wrangler dev`、ローカルD1）の2環境から始める。
- `ADMIN_API_KEY`は`wrangler secret`で設定する。`wrangler.jsonc`・リポジトリ・ログに含めない。ローカルでは`.dev.vars`（コミットしない）に設定する。
- 送信元IPは`CF-Connecting-IP`だけを使う。`X-Forwarded-For`等の任意の転送ヘッダーは信頼しない。

## D1でのトランザクション方針

D1はアプリから対話的にBEGIN〜COMMITを発行できず、`batch()`に渡した文の単位でまとめて成功・失敗する。データ設計の「1トランザクション」は次のように実現する。

| 処理 | 実装方針 |
|---|---|
| 成績登録 | 検証・曲の変換（gameSongId→Song.id）・参加者の登録確認を先に行い、Playと全PlayParticipantの挿入を1回の`batch()`で実行する。playIdの一意制約違反なら既存の記録のreceivedAtを読み直して200 already_registered（本文は比較しない） |
| 初回登録 | tokenHash付きのPlayer行の挿入1文で実行する。一意制約違反なら保存済みのID・tokenHash・失効状態を読み直し、仕様どおり200・409・401を返す |
| 曲登録 | gameSongIdで既存行を読み、なければINSERT（created）、あれば内容を比較して同じならunchanged、異なればUPDATE（updated）。created・updated・unchangedを区別するため1文のupsertにはしない。同時登録でINSERTが一意制約違反になったら既存行を読み直して比較・更新に切り替える |
| 移行のID対応修正 | 参加者・teamKey・playerCountの更新を1回の`batch()`で実行する |

`batch()`の前に読んだ値が、実行時までに他のリクエストで変わる可能性がある処理（例: 検証後の失効）は、一意制約・条件付き更新で守れる範囲を実装時に確認する。

公式ドキュメントでは`batch()`は「Batched statements are SQL transactions」とされ、文は順に実行され、途中の失敗で全体がロールバックされる。ローカルD1のテストでも、`batch()`の途中の失敗で先行する挿入が取り消されることを確認した（`tests/schema.test.ts`）。

重複による制約違反は、ローカルD1で次の形式のエラーメッセージになることを確認した。一意インデックス（gameSongId・tokenHash等）の違反は`SQLITE_CONSTRAINT_UNIQUE`、主キー（playId・playerId・参加者のplayId+playerId）の違反は`SQLITE_CONSTRAINT_PRIMARYKEY`になる。判別には両方を対象とし、メッセージの`<テーブル>.<列>`で対象の制約を見分ける。Drizzle経由ではエラーが包まれるため、`cause`も確認する。

```text
D1_ERROR: UNIQUE constraint failed: song.game_song_id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)
D1_ERROR: UNIQUE constraint failed: play.play_id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_PRIMARYKEY)
```

外部キー違反・CHECK制約違反もそれぞれ`FOREIGN KEY constraint failed`・`CHECK constraint failed`を含む。D1では外部キー制約が有効である。

## D1の制約への対応

- 読み取り行数は返した行数ではなく走査した行数で数える。ランキング・曲一覧・参加者検索はインデックスで走査範囲を絞り、全件走査を避ける。曲名の部分一致検索（約500行の走査）は許容する。
- 1クエリのバインドパラメータは100個まで、1回の呼び出しのクエリは50件まで。成績登録（Play1件＋参加者最大4件）は収まる。移行・初期登録の一括挿入は1文100パラメータ以内に分割する。

## 送信回数制限

[API仕様の送信制限](api-contract.md#送信制限の初期案)は目安とし、厳密には従わない。Workers Rate Limitingを使い、その機能で設定できる期間・回数に合わせる。

| 対象 | キー | 初期値 |
|---|---|---|
| POST /api/v1/plays | 送信元IP | 60秒20リクエスト |
| POST /api/v1/plays | 認証済みtokenのplayerId | 60秒20リクエスト |
| POST /api/v1/installations | 送信元IP | 60秒5リクエスト |
| PUT /api/v1/admin/songs/{gameSongId} | なし | 管理用キーで認証するため制限しない（初期登録の連続送信を妨げない） |
| 閲覧API・画面 | 送信元IP | 送信APIと別枠。値は実測後に決める |

- 期間は10秒または60秒しか選べない前提で、元の案（10分100、1時間20）に近い値にした。値は運用設定として実測後に調整する。
- Workers Rate Limitingはデータセンター単位・結果整合の近似的な制限であり、全体で厳密な回数にはならない（公式に「accurate accounting systemとして使わない」と明記）。
- 拒否時は429 RATE_LIMITEDを返す。`limit()`は成否しか返さず残り時間を取得できないため、Retry-Afterには設定した期間（60）を返す。
- 設定は`wrangler.jsonc`の`ratelimits`（`PLAYS_IP_LIMITER`・`PLAYS_PLAYER_LIMITER`・`INSTALLATIONS_IP_LIMITER`）、判定は`src/lib/rate-limit.ts`。plays のIP単位は認証前（拒否されるリクエストも数える）、プレイヤー単位は認証後に判定する。`CF-Connecting-IP`がない場合（ローカル実行）は全体を`unknown`として数える。
- テストでは上限を緩めた設定で機能テストを行い、429の動作はテスト用のバインディングに差し替えて確認する。
- 無料プランで利用できるかは公式ドキュメントに記載がないが、2026-10-11に本番で動作を確認した。制限はかかるが近似的で緩い（初回登録に不正な本文を40回連続送信し、429は28回目の1回だけ）。大量送信の抑止として現状のまま使い、利用状況をWorkersのログで見て、必要ならD1カウンターへ切り替える。
- 利用できない場合は、D1にキー・時間窓ごとの件数を数えるテーブルを置く固定窓カウンターへ切り替える。1リクエスト1行の書き込みで、無料枠（1日10万行）に収まる。

## JSONの検証

API仕様は重複JSONキーの検出を求める。`JSON.parse`・`c.req.json()`では検出できないため、重複キーを検出できる自前のパーサー（または同等のライブラリ）を使う。本文は16 KiB上限のため、CPU時間への影響は小さい見込み。

## バックアップ

- D1 Time Travelで過去7日以内（無料プラン）の任意時点へ復元できる。復元はDBを上書きするが、返されるブックマークで取り消せる。
- 7日より前に戻すため、管理者が手動で`wrangler d1 export <DB名> --remote`を実行し、SQLファイルを非公開の場所に保存する。目安は週1回と、移行の前後・大きな変更の前。
- D1のエクスポートはwrangler CLIからのみ実行でき、Worker内からは実行できない。このためCron TriggerとR2による自動エクスポートは採用しない（R2有効化時の支払い方法登録も不要になる）。
- エクスポート中は他のDBリクエストが待たされる。想定規模では短時間の見込みだが、アクセスの少ない時間帯に行う。
- エクスポートはプレイヤー名・成績を含むため、リポジトリ外に保存する。Git・公開リポジトリのGitHub Actionsの成果物・ログには置かない。
- 復元手順は実装後に一度実施して確認する。

## CI・デプロイ

- GitHub Actionsでlint・型チェック・テストを実行する。テストには架空データだけを使う。
- デプロイは当面、手元からの手動`wrangler deploy`とする。自動デプロイは必要になってから検討する。
- マイグレーションはデプロイ前に`wrangler d1 migrations apply`で適用する。

## 費用・制約

- 無料プランだけで運用する。Workers有料プラン（月5ドル）は費用目標（月100円以内）を超えるため使わない。
- 無料プランのCPU時間（1リクエストあたり約10ms、DB待ちは含まない）に収める。SHA-256はWeb Crypto、JSON検証は16 KiB上限で対応する。ランキング集計はDB側（SQLのwindow関数）で行い、Worker側で全件を処理しない。
- 想定規模（約500曲、約1万記録、月約1,000記録増、閲覧1日数十人）は無料枠に対して余裕がある見込み。

## 無料枠・制約の確認結果

2026-10-11に公式ドキュメントで確認した値。変更され得るため、公開前と問題発生時に再確認する。

| 項目 | 確認結果 | 出典 |
|---|---|---|
| Workers | 1日10万リクエスト（UTC 0時リセット）、CPU時間1リクエスト10ms、サブリクエスト50、メモリ128MB。超過時はError 1027 | [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Cron Triggers | 無料プランで1アカウント5個 | 同上 |
| D1容量 | 1DB 500MB、アカウント合計5GB、10DBまで | [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/) |
| D1クエリ | 1回の呼び出しで50クエリ、1クエリのバインドパラメータ100、1行2MB | 同上 |
| D1読み書き | 1日あたり読み取り500万行・書き込み10万行（UTC 0時リセット）。超過するとその日はクエリ不可。読み取りは走査行数で数える | [D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| D1 batch() | SQLトランザクションとして順に実行し、失敗時は全体をロールバック | [D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/) |
| D1 Time Travel | 無料プラン7日（有料30日）。復元は上書きだがブックマークで取り消し可 | [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) |
| D1エクスポート | wrangler CLIのみ。実行中は他のリクエストを待たせる | [D1 Import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/) |
| Workers Rate Limiting | 期間は10秒または60秒のみ。`limit()`は成否を返す。データセンター単位・結果整合。無料プランでの利用可否は記載なし | [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) |

### デプロイ後に確認する項目

| 項目 | 確認方法 |
|---|---|
| Workers Rate Limitingの無料プランでの利用可否 | 確認済み（2026-10-11）。無料プランで利用でき429が返るが、制限は緩い（[送信回数制限](#送信回数制限)） |
| 一意制約違反の判別方法 | ローカルD1でDrizzle経由も含め確認済み（[D1でのトランザクション方針](#d1でのトランザクション方針)、causeをたどって判別する`src/db/errors.ts`）。本番D1で同じ形式になるかは確認する |

## リポジトリ構成

```text
src/
  routes/      # API・閲覧画面のルート
  db/          # Drizzleスキーマ・クエリ
  lib/         # 検証・teamKey生成・認証などの共通処理
migrations/    # D1マイグレーションSQL
scripts/       # 曲登録スクリプト（CLI）
tests/
wrangler.jsonc
drizzle.config.ts
vitest.config.ts
```

スキーマを変更したら`npm run db:generate`でマイグレーションSQLを生成する。

## Cloudflare上の初期設定（管理者が実施）

1. `npx wrangler login`
2. `npx wrangler d1 create songtypingtheater-ranking`を実行し、表示された`database_id`で`wrangler.jsonc`の仮の値を置き換える。
3. `npm run db:migrate:remote`でマイグレーションを適用する。
4. 管理用キーを生成し（例: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`）、`npx wrangler secret put ADMIN_API_KEY`で設定する。キーは登録スクリプトで使うため、リポジトリ外に安全に保管する。
5. `npm run deploy`でデプロイする。Workersのログはダッシュボードで確認できる（`observability`を有効化済み）。
