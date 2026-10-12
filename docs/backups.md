# バックアップ運用

D1 Time Travel（直近7日）に加え、非公開の専用リポジトリで日次SQLバックアップを90日保存する。暗号化キーは使わない。開始前の7日超の状態を取り出すことはできず、運用開始後に世代が蓄積する。

## 初回設定

1. `songtypingtheater-ranking-backups`という**非公開**リポジトリを作る。READMEを追加して初期化し、デフォルトブランチをmainにする。公開側をforkするのではなく新規作成する。
2. この公開リポジトリの`backup-repository/`内のファイルだけを専用リポジトリのルートへ配置する。workflowは専用リポジトリでのみ有効になる。コードだけを置き、SQLはコミットしない。
3. 専用リポジトリのSettings → Secrets and variables → Actionsに`CLOUDFLARE_API_TOKEN`（対象アカウントのD1 Edit権限）と`CLOUDFLARE_ACCOUNT_ID`を登録する。公開側のSecretsは自動で引き継がれない。値をチャットやIssueに貼らない。GitHub操作用tokenは自動発行の`github.token`を使うため個人PATは不要。
4. artifactの保存期間上限が90日以上であることを確認する。Actions → Daily D1 backup → Run workflowで初回実行し、成功・artifactを確認する。
5. 管理者を専用リポジトリとCloudflareへ招待し、以下の復旧を一度確認する。リポジトリ作成・Secrets登録は現在のGitHub連携ではできないため、管理者が実施する。コード配置は作成後にGitHub連携から実施できる（新リポジトリへのアクセス許可が必要な場合がある）。

## 日常運用

- 毎日04:23 JST。GitHub scheduleには遅延・欠落があり、毎日の成功を保証しない。取得日時・成功状況を確認し、失敗通知を有効にする。移行・大きな変更の前には手動取得する。
- 専用リポジトリは**非公開のまま運用**する。処理は実行前に非公開設定を検査するが、取得後にリポジトリを公開すれば過去のSQLも露出し得る。forkや第三者のコードを実行せず、管理権限を持つ人を限定する。
- artifactは90日で削除される。runやartifactを手動削除しても失われる。重要な世代は期限前に別の安全な場所へ保管する。
- gzip圧縮するが暗号化しない。平文SQLはrunnerの一時領域で復元検証後に削除し、SQL・成績・署名付きURLをログへ出さない。実データをGitに入れない。
- 非公開Actionsの無料枠はGitHub Freeなら実行2,000分/月、artifact保存500MB（アカウント全体）。90世代なら1世代平均約5MBで450MBになる。実際のサイズと他の利用分を確認し、必要なら保存期間を見直す。無料枠の最新条件は公式資料を確認する。
- DBバインディングは専用側の`wrangler.jsonc`で指定する。本番DBを変更したら専用側も更新する。エクスポート中はD1の他のリクエストが待たされることがある。

## 共同管理と復元

専用リポジトリの読み取り権限を持ちGitHubへログインできる管理者はartifactを取得できる。手動取得にはwrite権限、復旧にはCloudflareのD1作成・インポートとWorkerのバインディング変更・デプロイ権限が必要。ログイン情報を共有せず各管理者へ権限を与える。暗号化キーは不要。

1. 成功したrunの`d1-backup-...`をダウンロードし、ZIP内の`.sql.gz`をローカルのGit管理外の場所へ置く。
2. gzipを展開し、一時SQLiteへ復元検証する。

   ```sh
   gzip -dk backups/<取得ファイル>.sql.gz
   python3 scripts/validate.py backups/<取得ファイル>.sql
   ```

   終了コード0が成功。非0なら復旧を進めない。SQLやエラーの詳細は出力しない。

3. Cloudflareに**新規の空DB**を作り、SQLをインポートする。

   ```sh
   npx wrangler d1 create ranking-restore-check
   npx wrangler d1 execute ranking-restore-check --remote --file backups/<取得ファイル>.sql
   ```

4. 件数・曲一覧・ランキングを確認する。本番復旧時は送信を止め、現在の本番DBも保存する。既存本番へSQLを流し込まず、新規DBへ復元した後に本番側`wrangler.jsonc`のDB名・IDを変更してデプロイする。復元時点のコードとスキーマの互換性、未適用マイグレーションを確認する。旧DBは復旧確認まで残す。
5. 成績受付・表示を確認して送信を再開し、専用リポジトリのDBバインディングも変更する。別の管理者でもこの手順を実施できることを初回に確認する。

公式資料: [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)、[artifactダウンロード権限](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)、[Actions無料枠](https://docs.github.com/en/billing/concepts/product-billing/github-actions)。
