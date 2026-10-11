# 協力タイピングゲーム ランキングサイト

2026-10-11時点の要件・設計準備用リポジトリ。プロジェクト名: songtypingtheater-ranking。
実装・公開はまだ行っていない。

## 文書

- [要件定義](docs/requirements.md): 確定した動作、推奨案、受入条件
- [API連携案](docs/api-contract.md): Unity開発者との調整用。未合意の具体形式を含む
- [初回登録・再送仕様](docs/auth-options.md): クライアント生成トークンの登録・応答消失対策
- [データ設計案](docs/data-design.md): 曲・プレイヤー・記録とLyricDataCreator連携
- [決定事項と残課題](docs/decisions.md): 実装前に確定する項目

## 状態と進め方

要件は設計を開始できる状態。クライアント生成の個別installationToken方式と初回登録の再送仕様は合意済み。APIの日時等の最終調整、ホスティング選定は未完了。
文書中の「確定」は会話で合意された内容。「提案」は実装候補であり、ゲーム開発者との合意を意味しない。

1. API連携案をゲーム開発者と確認する。
2. 曲マスターと既存ランキングの移行サンプルを確認する。
3. セーブ消失時の扱い・受付日時・バージョン必須化・運用などの残課題を決める。
4. 記録受付、ランキング閲覧、移行の順に実装する。

GitHubの作成先は `mmhige0/songtypingtheater-ranking`、公開リポジトリ。既存のLyricDataCreatorとは別プロジェクトとして準備。
技術スタックはまだ選定していない。費用目標は無料優先、月100円以内。

## 開発用チェックアウト

```sh
git clone https://github.com/mmhige0/songtypingtheater-ranking.git
```

秘密情報・実際のプレイヤーデータはコミットしない。
