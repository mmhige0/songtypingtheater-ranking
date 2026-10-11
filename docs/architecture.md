# システム構成

更新日: 2026-10-11（日本時間）

Cloudflareの無料プランで構築する。他構成との比較は行わず、この構成で進める。
無料枠の数値・機能の提供状況は変わり得るため、[構築時の確認項目](#構築時の確認項目)を公式ドキュメントで確認してから実装・公開する。

## 構成

| 要素 | 採用 |
|---|---|
| 実行環境 | Cloudflare Workers（APIと閲覧画面を1つのWorkerで提供） |
| フレームワーク | Hono。閲覧画面はHono JSXによるサーバー描画 |
| DB | Cloudflare D1（SQLite系） |
| ORM・マイグレーション | Drizzle ORM。drizzle-kitで生成したSQLを`wrangler d1 migrations`で適用 |
| 送信回数制限 | Workers Rate Limiting（バインディング） |
| バックアップ | D1 Time Travel＋Cron TriggerによるR2への定期エクスポート |
| 言語・テスト | TypeScript（strict）、Vitest＋`@cloudflare/vitest-pool-workers` |
| ドメイン | 当面はworkers.devのサブドメイン |

LyricDataCreator（Vercel）とは運用基盤が別になる。連携は公開の曲一覧APIの読み取りだけで、相互に依存しない。

## 環境・秘密情報

- 本番とローカル開発（`wrangler dev`、ローカルD1）の2環境から始める。
- `ADMIN_API_KEY`は`wrangler secret`で設定する。`wrangler.toml`・リポジトリ・ログに含めない。
- 送信元IPは`CF-Connecting-IP`だけを使う。`X-Forwarded-For`等の任意の転送ヘッダーは信頼しない。

## D1でのトランザクション方針

D1はアプリから対話的にBEGIN〜COMMITを発行できず、`batch()`に渡した文の単位でまとめて成功・失敗する。データ設計の「1トランザクション」は次のように実現する。

| 処理 | 実装方針 |
|---|---|
| 成績登録 | 検証・曲の変換（gameSongId→Song.id）・参加者の登録確認を先に行い、Playと全PlayParticipantの挿入を1回の`batch()`で実行する。playIdの一意制約違反なら既存の記録・参加者を読み直して登録本文と比較し、同一なら200、異なるなら409 |
| 初回登録 | Player行（未作成時）とInstallationの挿入を1回の`batch()`で実行する。一意制約違反なら保存済みのID・tokenHash・失効状態を読み直し、仕様どおり200・409・401を返す |
| 曲登録 | `INSERT ... ON CONFLICT(gameSongId) DO UPDATE`の1文で登録・更新する。値が同じ場合は更新せず、created・updated・unchangedを判定できる形にする |
| 移行のID対応修正 | 参加者・teamKey・playerCountの更新を1回の`batch()`で実行する |

`batch()`の前に読んだ値が、実行時までに他のリクエストで変わる可能性がある処理（例: 検証後の失効）は、一意制約・条件付き更新で守れる範囲を実装時に確認する。

## 送信回数制限

[API仕様の送信制限](api-contract.md#送信制限の初期案)は目安とし、厳密には従わない。Workers Rate Limitingを使い、その機能で設定できる期間・回数に合わせる。

| 対象 | キー | 初期値 |
|---|---|---|
| POST /api/v1/plays | 送信元IP | 60秒20リクエスト |
| POST /api/v1/plays | 認証済みinstallation | 60秒20リクエスト |
| POST /api/v1/installations | 送信元IP | 60秒5リクエスト |
| PUT /api/v1/admin/songs/{gameSongId} | なし | 管理用キーで認証するため制限しない（初期登録の連続送信を妨げない） |
| 閲覧API・画面 | 送信元IP | 送信APIと別枠。値は実測後に決める |

- 期間は10秒または60秒しか選べない前提で、元の案（10分100、1時間20）に近い値にした。値は運用設定として実測後に調整する。
- Workers Rate Limitingはデータセンター単位の近似的な制限であり、全体で厳密な回数にはならない。
- 拒否時は429 RATE_LIMITEDを返す。残り時間を取得できないため、Retry-Afterには設定した期間（60）を返す。

## JSONの検証

API仕様は重複JSONキーの検出を求める。`JSON.parse`・`c.req.json()`では検出できないため、重複キーを検出できる自前のパーサー（または同等のライブラリ）を使う。本文は16 KiB上限のため、CPU時間への影響は小さい見込み。

## バックアップ

- D1 Time Travelで一定期間内の任意時点へ復元できるようにする。
- Cron Trigger（例: 週1回）で全テーブルをR2へエクスポートし、世代数を決めて古いものから削除する。
- エクスポートはプレイヤー名・成績を含むため、R2のバケットは非公開とする。公開リポジトリのGitHub Actionsの成果物・ログには置かない。
- 復元手順は実装後に一度実施して確認する。

## CI・デプロイ

- GitHub Actionsでlint・型チェック・テストを実行する。テストには架空データだけを使う。
- デプロイは当面、手元からの手動`wrangler deploy`とする。自動デプロイは必要になってから検討する。
- マイグレーションはデプロイ前に`wrangler d1 migrations apply`で適用する。

## 費用・制約

- 無料プランだけで運用する。Workers有料プラン（月5ドル）は費用目標（月100円以内）を超えるため使わない。
- 無料プランのCPU時間（1リクエストあたり約10ms、DB待ちは含まない）に収める。SHA-256はWeb Crypto、JSON検証は16 KiB上限で対応する。ランキング集計はDB側（SQLのwindow関数）で行い、Worker側で全件を処理しない。
- 想定規模（約500曲、約1万記録、月約1,000記録増、閲覧1日数十人）は無料枠に対して余裕がある見込み。

## 構築時の確認項目

公式ドキュメントで確認し、結果を本書に反映する。

| 項目 | 確認内容 |
|---|---|
| Workers無料枠 | 1日あたりリクエスト数、CPU時間上限 |
| D1無料枠 | ストレージ、1日あたりの読み取り行数・書き込み行数 |
| Workers Rate Limiting | 無料プランで使えるか、設定できる期間 |
| D1 Time Travel | 無料プランでの保持期間 |
| R2無料枠 | ストレージ、操作回数 |
| Cron Triggers | 無料プランでの利用可否・件数 |
| Drizzle＋D1 | `batch()`・一意制約違反の判別方法 |

## リポジトリ構成案

```text
src/
  routes/      # API・閲覧画面のルート
  db/          # Drizzleスキーマ・クエリ
  lib/         # 検証・teamKey生成・認証などの共通処理
migrations/    # D1マイグレーションSQL
scripts/       # 曲登録スクリプト（CLI）
tests/
wrangler.toml
```
