# PRの動作確認

同一リポジトリのPRを作成・更新すると、GitHub Actionsの「PR Preview」がチェック成功後に確認用Workerをデプロイする。Cloudflare管理画面でのGit連携は不要。本番デプロイは従来どおりmainへのpushだけで行う。

1. PRの「PR Preview」が成功するまで待つ。
2. PRのデプロイ欄（preview-pr-番号）の「View deployment」、またはActionsの実行サマリーにあるURLを開く。
3. PRにpushすると同じURLが更新される。PRをclose・mergeすると確認用Workerを削除する。

Worker名は `songtypingtheater-ranking-pr-<PR番号>`。初回はCloudflareアカウントにworkers.devサブドメインが設定されている必要がある。未設定ならWorkers & Pagesのアカウント設定で設定する。本番Workerのworkers.devを有効にする必要はない。

## DB・API

本番と同じD1を読む。プレビュー用の入口 `src/preview.ts` はGET・HEAD・OPTIONS以外を405で拒否し、初回登録・成績送信・曲登録の処理へ到達させない。トップ、ランキング、検索、画面内リンクはプレビューURLで動く。プレビューに管理用secretは設定しない。

プレビューの閲覧分もWorkers・D1のアカウント共通の無料枠を使う。D1マイグレーション、テストデータ投入、DBの複製は実行しない。DB変更を含むPRは、本番DBのスキーマと互換性がある範囲で確認する。書き込みを伴う機能はローカルD1で確認する。

この閲覧専用制限はアプリの入口での制御であり、D1自体の読み取り専用権限ではない。GET処理にDB更新を追加する変更は、共有DBへの影響をレビューする。

## 初回設定・失敗時

既存のActions secrets `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を使用する。APIトークンは確認用Workerの新規作成・更新・削除と、本番D1のバインドを許可する必要がある。デプロイ時に権限エラーが出た場合はトークンの対象・権限を確認する。

forkからのPRとDependabotによる実行は、secretsを渡さずプレビューを作らない。`pull_request_target` は使用しない。同一リポジトリ内のPRコードにはデプロイ権限を与える構成なので、信頼できる共同作業者だけがブランチを作成できる運用とする。

close時の削除が失敗した場合は、Cloudflare管理画面から対象の `songtypingtheater-ranking-pr-<PR番号>` だけを削除する。本番WorkerやD1は削除しない。削除後もGitHubのデプロイ履歴は残るが、そのURLは利用できなくなる。

設定をmainへマージする前から存在するPRは、ブランチにmainを取り込んで更新するとプレビューを作成できる。
