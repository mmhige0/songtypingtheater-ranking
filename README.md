# Song Typing Theater ランキングサイト

Song Typing Theaterの成績を受け付け、曲別・参加人数別のランキングを公開するサイトです。Cloudflare Workers + D1、Hono、Drizzle、TypeScriptで実装しています。

- [トップ](https://kayomodoki.com/)
- [曲一覧・ランキング](https://kayomodoki.com/songs)
- ゲームからのAPI送信先: `https://ranking.kayomodoki.com/api/v1/…`

画面とAPIは同じWorkerで提供しています。旧ドメインのランキング画面はパスとクエリを保ってメインドメインへ301転送し、旧ルート `/` は `/songs` へ転送します。

## 目的から探す

| やりたいこと | 参照先 |
|---|---|
| 新曲の登録・曲名や難易度の修正 | [運用手順：曲の登録](docs/operations.md#曲の登録) |
| 今日の曲・人気曲の表示設定やキャッシュの確認 | [運用手順：表示設定](docs/operations.md#今日の曲人気曲の表示設定) |
| 記録修正後に曲一覧の1位を更新 | [運用手順：1位の作り直し](docs/operations.md#曲一覧の1位の作り直し) |
| 確認済みの旧IDと新IDを紐付け | [運用手順：IDの紐付け](docs/operations.md#旧idと新idの紐付け) |
| 手元で動かす・変更を確認する | [開発環境の準備](#開発環境の準備) |
| 本番へ反映する | [デプロイ](#デプロイ) |
| PRの確認用URL・制約を知る | [PRプレビュー](docs/pr-previews.md) |
| ゲームとAPIを連携する | [API仕様](docs/api-contract.md)・[初回登録と再送](docs/auth-options.md) |

## 開発環境の準備

Node.jsは[CI](.github/workflows/ci.yml)と同じ24系（現在24.22.1）を使用します。コマンドはリポジトリのルートで実行してください。

```sh
git clone https://github.com/mmhige0/songtypingtheater-ranking.git
cd songtypingtheater-ranking
npm ci
```

`.dev.vars.example` を `.dev.vars` にコピーします。ローカルで曲登録APIを使う場合は `ADMIN_API_KEY` を設定してください。トップとランキングを同じホストで見るための `TOP_ORIGIN`・`RANKING_ORIGIN` はサンプルに設定済みです。

```sh
npm run db:migrate:local  # ローカルD1を準備・更新
npm run dev               # http://localhost:8787
npm run check             # lint・型チェック・テスト
```

WindowsとWSLで作業環境を切り替える場合は、切り替え先で `npm ci` を実行します。Wranglerの実行に必要な依存パッケージはOSごとに異なります。

## デプロイ

`main` へのpush後、[GitHub Actions](.github/workflows/ci.yml)がlint・型チェック・テストに成功すると本番へ自動デプロイします。同一リポジトリのPRでは、本番D1を共用する閲覧専用プレビューを作成します（[詳細](docs/pr-previews.md)）。

**D1マイグレーションは自動適用しません。** マイグレーションを含む変更は、`main` へのマージ・push前に内容を確認して `npm run db:migrate:remote` を実行します。先にコードをデプロイすると、未作成のテーブル・列を参照して失敗します。DBへ先に適用しても稼働中のコードが動くことも確認してください。

`ADMIN_API_KEY` はWorkerに設定済みのsecretを使い、CIからは変更しません。

### 別環境を新しく用意する場合

既存本番の通常デプロイでは初期設定をやり直す必要はありません。[Cloudflareの初期設定](docs/architecture.md#cloudflare上の初期設定管理者が実施)と[PRプレビューの初回設定](docs/pr-previews.md)を参照してください。

自動デプロイには、GitHubの Settings → Secrets and variables → Actions に次のSecretsが必要です。

| 名前 | 内容 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Workersへのデプロイと独自ドメインの設定に使うAPIトークン（対象ゾーン：`kayomodoki.com`） |
| `CLOUDFLARE_ACCOUNT_ID` | CloudflareのアカウントID |

## 設計資料

| 文書 | 内容 |
|---|---|
| [要件定義](docs/requirements.md) | 動作・受入条件 |
| [API仕様](docs/api-contract.md) | 成績送信・曲登録・閲覧API |
| [初回登録・再送仕様](docs/auth-options.md) | トークン登録・応答消失時の再送 |
| [データ設計](docs/data-design.md) | 曲・プレイヤー・記録・集計の設計 |
| [システム構成](docs/architecture.md) | Workers・D1・送信制限・初期設定 |
| [決定事項と残課題](docs/decisions.md) | 採用方針と今後の検討事項 |

設計資料はこのPRの実装と照合しています。ゲーム側の未合意事項と、外部サービスの当時の確認結果は区別して記載しています。「提案」はゲーム開発者との合意を意味しません。現在の運用手順はこのREADMEと[運用手順](docs/operations.md)から確認してください。

## データ・秘密情報の取り扱い

管理用キー、実際のプレイヤー名・成績、移行用の対応表はGit・PR・Issue・AIの作業メモやログに残しません。設計書とテストには架空データを使います。`imports/` と `.dev.vars` はGit管理外です。

ライセンスは[MIT](LICENSE)。関連する表記は[NOTICE.md](NOTICE.md)を参照してください。
