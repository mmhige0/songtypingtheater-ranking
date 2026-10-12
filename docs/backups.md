# バックアップ運用

D1 Time Travel（無料プランの直近7日分）に加えて、毎日の**取得時点のDB全体**を暗号化して90日間保存する。取得開始前の7日超の状態を取り出すことはできない。保存世代は運用開始後に蓄積する。

## 初回設定

1. 管理者のローカル端末で32バイトのランダムな暗号化キーを作る。

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

2. 64文字の出力をリポジトリのSettings → Secrets and variables → Actionsで`BACKUP_ENCRYPTION_KEY`として登録する。**このチャット・Issue・Gitには貼らない**。復号時にも必要なので、パスワードマネージャー等に別途保管する。鍵を変更すると旧世代は新しい鍵で復号できない。旧鍵は対応するバックアップを使い終えるまで保管する。
3. デプロイ用に設定済みの`CLOUDFLARE_API_TOKEN`・`CLOUDFLARE_ACCOUNT_ID`を使う。トークンには対象アカウントのD1 Edit権限が必要。エクスポートは読み取り操作だがAPI権限はEditを要求する。
4. Settings → Actions → Generalのartifact/log retentionを90日にする。リポジトリ・組織の上限が短い場合、workflowの`retention-days: 90`だけでは90日保持を保証できない。
5. mainへマージした後、Actions → Daily D1 backup → Run workflowで初回実行する。成功とartifact作成を確認し、下記の手順で一度復号・復元を確認する。main以外の手動実行やforkでは本番バックアップを実行しない。

## 日常運用

- 毎日04:23 JST（UTC 19:23）に実行。GitHubのスケジュールは遅延・欠落することがあるため、厳密な時刻や毎日の成功は保証されない。Actionsで取得日時と成功状況を確認する。
- 公開リポジトリでは60日間リポジトリに活動がないとscheduled workflowが無効化される。継続運用時は有効状態を確認し、停止時はActionsから再有効化する。
- GitHubの失敗通知を有効にし、取得失敗時は認証・D1権限・キー・保存容量を確認して手動再実行する。ログはSQLや署名付きURLの漏えいを防ぐため詳細を出さない。
- 移行・大きな変更の直前にもRun workflowで取得する。artifactを消したりworkflow runを削除すると、その世代も失われる。90日以上保存したい重要世代は期限前にダウンロードして安全な場所へ保管する。
- DB全体（プレイヤー、成績、曲、関連付け、マイグレーション管理等）が対象。gzip後にランダムnonceのAES-256-GCMで暗号化し、暗号文だけをartifactへ送る。鍵は含めない。平文はrunnerの一時領域で処理後に削除する。
- 平文のバックアップをGit・Actions artifactへアップロードしない。公開artifactの暗号文は第三者にも取得され得るため、暗号化キーの秘匿を継続する。
- エクスポート中はD1への他のリクエストが待たされる場合がある。R2は使わない。公開リポジトリの標準Actions runnerは無料だが、利用条件・制限の変更は別途確認する。

## 共同管理者による復旧

復旧は作成者本人のアカウントに依存しない。別の管理者にも以下を用意する。

- GitHubにログインしてこのリポジトリのartifactを取得できること。手動バックアップの実行にはリポジトリへのwrite権限が必要。
- 共有パスワードマネージャー等から、対象世代の`BACKUP_ENCRYPTION_KEY`を取得できること。GitHub Secretは登録後に表示できないため、Secretにしか鍵がない状態にしない。
- Cloudflareの対象アカウントでD1の作成・インポートを行う権限と、WorkerのDBバインディング変更・デプロイを行う権限。Cloudflareのアカウントメンバー招待と各管理者のAPIトークンで用意し、本人のログイン情報を共有しない。
- この復旧手順、Node.js 22とPython 3を使える端末。

最低2名が鍵へアクセスできる状態にし、もう1名が復号と新規DBへの復元を一度確認する。バックアップファイルと旧鍵の対応が分かるよう、キー変更日も共有保管場所に記録する。

## 復号・復元

1. Actionsの成功した実行から`d1-backup-...`をダウンロードし、ZIPを展開する。内部の`.sql.gz.enc`をローカルの`backups/`へ置く（Git管理外）。
2. `BACKUP_ENCRYPTION_KEY`を安全な方法で環境変数に設定する。シェル履歴へ鍵を直接書かない。Bashなら以下で非表示入力できる。

   ```sh
   read -r -s -p 'Backup key: ' BACKUP_ENCRYPTION_KEY
   export BACKUP_ENCRYPTION_KEY
   npm run backup -- decrypt backups/<取得ファイル>.sql.gz.enc backups/restore.sql
   unset BACKUP_ENCRYPTION_KEY
   python3 scripts/backup/validate.py backups/restore.sql
   ```

   正しい鍵・認証タグを検証してから平文を書く。既存の出力ファイルは上書きしない。検証の終了コード0が成功。非0なら復元を進めない。

3. Cloudflareにも一時的な**新規の空DB**を作り、インポート・件数・ランキング表示を確認する。

   ```sh
   npx wrangler d1 create ranking-restore-check
   npx wrangler d1 execute ranking-restore-check --remote --file backups/restore.sql
   ```

4. 本番復旧時は成績送信を止め、現在の本番DBのバックアップも取得する。**既存本番DBへSQLを直接流し込まない**（テーブルの重複や記録混在を避ける）。新規DBへの復元が確認できた後、`wrangler.jsonc`のDBバインディングの`database_name`・`database_id`を復元DBへ変更してデプロイする。復元時点のマイグレーションとアプリコードの互換性を確認し、必要な未適用マイグレーションを新DBへ適用する。旧DBは復旧確認が終わるまで保持する。
5. 復旧後は曲一覧・成績受付・ランキング・日次バックアップの対象DBを確認し、送信を再開する。復号したSQLは安全に保管するか削除する。復旧で失われるのはバックアップ取得後の更新なので、復旧範囲は事前に確認する。

## 検証

`npm run test:backup`は架空データによる暗号化・復号、鍵違い、改ざん、切断、キー形式を確認する。日次取得時は毎回SQLを一時SQLiteへ復元し、主要テーブル・`integrity_check`・`foreign_key_check`に成功したものだけ暗号化・保存する。Cloudflareへの復元と本番データを使う確認は管理者の初回設定時に実施する。

公式資料: [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)、[D1 export](https://developers.cloudflare.com/d1/wrangler-commands/#d1-export)、[artifact保存期間](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)、[scheduled workflowの制約](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。
