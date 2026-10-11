# 協力タイピングゲーム ランキングサイト

2026-10-11時点の要件・設計準備用リポジトリ。プロジェクト名: songtypingtheater-ranking。
実装・公開はまだ行っていない。

## 文書

- [要件定義](docs/requirements.md): 確定した動作、推奨案、受入条件
- [API仕様](docs/api-contract.md): 採用済み契約、管理者用の曲登録API、再送間隔等の残る調整案
- [初回登録・再送仕様](docs/auth-options.md): クライアント生成トークンの登録・応答消失対策
- [データ設計案](docs/data-design.md): 曲・プレイヤー・記録とLyricDataCreator連携
- [システム構成](docs/architecture.md): Cloudflare構成、D1でのトランザクション方針、送信回数制限、バックアップ
- [決定事項と残課題](docs/decisions.md): 実装前に確定する項目

## 状態と進め方

要件は設計を開始できる状態。クライアント生成の個別installationToken方式と初回登録の再送仕様は合意済み。受付日時・gameVersion必須・再送キュー100件/7日・全参加者登録完了・代表記録の時点名検索・旧記録の最高スコアのみの移行も採用済み。構成はCloudflare（Workers＋D1）に決定。
文書中の「確定」は会話で合意された内容。「提案」は実装候補であり、ゲーム開発者との合意を意味しない。

1. 採用済みAPI差分をゲーム側実装へ共有する。
2. 曲マスターはランキングDBを正本とし、v1は管理者が認証付きの曲登録APIで登録する方針で確定。旧シートの曲番はゲーム曲IDと同じで、移行時に曲マスターを初期登録する。残りは曲別ランキング表と曲番の対応確認。
3. Cloudflareの構築時の確認項目を確認する。セーブ消失時の扱い・管理運用などの残課題を決める。
4. 曲登録、初回登録、記録受付、ランキング閲覧、移行の順に実装する。

譜面投稿フロー（LyricDataCreatorからの投稿→未承認曲の仮登録→承認）はv1対象外の将来構想。

GitHubの作成先は `mmhige0/songtypingtheater-ranking`、公開リポジトリ。既存のLyricDataCreatorとは別プロジェクトとして準備。
技術スタックはCloudflare Workers＋Hono、D1、Drizzle、TypeScript（[システム構成](docs/architecture.md)）。費用目標は無料優先、月100円以内。

## 開発用チェックアウト

```sh
git clone https://github.com/mmhige0/songtypingtheater-ranking.git
```

秘密情報・実際のプレイヤー名や成績・移行用の対応表はGit、PR、Issue、AIの作業メモリ・作業メモやログに残さない。設計書とテストには架空データだけを使う。
