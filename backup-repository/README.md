# ランキングDBの日次バックアップ

このディレクトリ内だけを**非公開の専用リポジトリのルート**へ配置する。実データはGitへコミットしない。

- Node.js 22・Python 3。`npm ci`後、Actionsの日次取得またはRun workflowで実行。
- Secrets: `CLOUDFLARE_API_TOKEN`（D1 Edit）と`CLOUDFLARE_ACCOUNT_ID`。公開側から自動では引き継がれない。
- 毎日04:23 JST、SQLを一時DBへ復元検証し、gzipで90日間artifact保存。暗号化キー不要。
- 非公開状態を実行前に検査する。保存済みartifactの秘匿のため非公開状態を維持する。
- 復元はartifactを展開し、`gzip -dk`、`python3 scripts/validate.py <SQL>`、新規D1へインポート。本番の既存DBへ直接流し込まない。
- 共同管理者へGitHubの読み取り権限、手動実行ならwrite権限、CloudflareのD1・Worker操作権限を付与する。

詳しい復旧手順: https://github.com/mmhige0/songtypingtheater-ranking/blob/main/docs/backups.md
