# Excel差分からスコアを補完する手順

既存のユーザーIDに全参加者を紐付けたJSONから、追加専用のSQLを生成する。名前による自動紐付けやユーザーの新規作成は行わない。

以下のコマンドはすべてWSLのBashで実行する。実際の名前・成績を含む入力と出力はGit管理外の`imports/`に置く。

## 1. Excelを用意して差分を作る

旧ファイルを`imports/old.xlsx`、新ファイルを`imports/new.xlsx`に置く。コマンドのファイル名を実際の名前に置き換えてもよい。旧、新の順に指定する。`songs.csv`の用意・更新は不要。

```bash
npm run compare-legacy-sheets -- imports/old.xlsx imports/new.xlsx
```

次の2ファイルが出力される。

- `imports/legacy-play-diff.csv`: 曲番・人数・参加者名の組み合わせ・スコアを比較した「旧のみ」「新のみ」のプレイ。同一記録の重複件数も比較する。
- `imports/legacy-play-diff-summary.json`: 件数、対象外タブ、保留タブ、読み飛ばした記録の集計。保留や読み飛ばしがあれば内容を確認する。

**差分だけが必要なら、ここまでで完了。**

曲番号はタブ名を使い、見出しの曲番号との不一致は無視する。名前は空白も含め完全一致で扱う。チーム内の順序は比較キーから除き、重複名は人数分保持する。読み取り・保留の判定は既存の移行処理と共通。元のExcelやDBは変更しない。同名の出力ファイルは上書きする。

## 2. 補完候補のJSONを作る

```bash
npm run prepare-recovery-scores -- --batch outage-20261017 --out imports/recovery.json imports/legacy-play-diff.csv
```

`legacy-play-diff.csv`の「新のみ」を全件候補にする。同一記録の増加件数も保持する。旧記録の削除・変更は行わない。

`--batch`には今回の補完を識別する名前を指定する。JSONの出力先がすでに存在する場合は上書きせず停止する。

recordIdは曲・人数・スコア・順序を除く名前の組み合わせと同一記録の出現回数から生成する。CSVの行番号には依存しない。再試行では同じbatchIdと確認済みJSONを使い、元CSVの再生成で確認内容を上書きしない。出力ファイルが存在する場合は上書きせず停止する。Excel同士の差分でありDBとの差分ではないため、既存API記録との照合は別途必要。

## 3. ユーザーIDと補完対象を確認する

`legacy-link-candidates.json`がある場合は、名前の完全一致でIDを入力できる。

```bash
npm run fill-recovery-player-ids -- --out imports/recovery-filled.json imports/recovery.json imports/legacy-link-candidates.json
```

候補JSONはD1の出力形式（`[{ "results": [{ "name": "名前", "new_id": "ユーザーID" }] }]`）。IDが一意の名前だけ空欄を埋め、入力済みIDは保持する。候補なし・複数候補の名前は空欄のまま表示する。同一プレイでIDが重複する場合は出力しない。出力先が存在する場合は上書きしない。名前の一致は本人確認ではないため、結果を確認し、以降のSQL生成では`imports/recovery-filled.json`を入力に使う。

`imports/recovery.json`を開く。生成された各記録の`batchId`・`recordId`を維持し、参加者の`playerId`を入力する。構造の例:

```json
{
  "batchId": "outage-20261017",
  "records": [
    {
      "recordId": "sheet1-row2",
      "gameSongId": "001",
      "score": 12345,
      "participants": [
        {
          "name": "アリス",
          "playerId": "00000000-0000-4000-8000-000000000001"
        }
      ]
    }
  ]
}
```

1. 対象曲が本番DBに登録されていることを確認する。曲番号は先頭ゼロを含めて一致させる。未登録曲は先に登録する。参加者は1～4人。同名でも記録ごとに確認する。
2. 全参加者について、実在するユーザーIDとの対応を確認して`playerId`を入力する。ID欠落・形式不正・同一プレイ内のID重複が1件でもあればSQLを生成しない。
3. 既存API記録と曲・チーム・スコアを照合して、補完対象だけを残す。異なるプレイで同じ得点もあり得るため、スクリプトはこの条件で自動削除しない。

例のユーザーIDは実際のIDに置き換える。CSVの名前は空白も含め保持し、IDを名前だけで決定しない。

## 4. SQLを生成する

```bash
npm run import-recovery-scores -- --out imports/recovery.sql imports/recovery.json
```

この段階ではDBに書き込まない。JSONと生成SQLを確認する。SQLの出力先がすでに存在する場合は上書きせず停止する。

## 5. 本番DBへ適用する

本番DBへアクセスできるCloudflareアカウントで、WSL側のWranglerにログインする。すでにWSL側で認証済みの場合は不要。

```bash
npx wrangler login
```

確認済みSQLを適用する。

```bash
npx wrangler d1 execute DB --remote --file imports/recovery.sql
```

受付日時はSQLをDBへ適用した時刻（UTC）。FC・タイペン・ゲームバージョン・ホストは不明としてNULLにする。色は入力順にR/B/Y/Gを仮割り当てする。現在の表示では旧記録扱いになる。ランキングの集計も再構築する。

## 途中で失敗した場合・再実行する場合

`batchId` と `recordId` は取り込み後も変更しない。同じ入力の再実行は既存記録と受付日時を保持し、途中失敗も同じSQLの再実行で補完できる。同じIDで曲・スコア・チーム・名前・順序を変更すると制約違反で止まる。新しいbatchIdやrecordIdにすると別記録として追加される。

SQLは複数文のため、実行方法によっては失敗前の文が反映される。原因を解消して同じSQLを最後まで再実行する。既存プレイや旧移行データの削除は行わない。未登録の曲・ユーザーはDB制約で停止する。大量データはD1の日次書き込み枠も考慮する。

## 差分作成の追加オプション

- 出力先を変更するには、差分作成コマンドに`--out-dir imports/別フォルダー`を追加する。
- 曲マスターと照合するには`--songs imports/songs.csv`を追加する。CSVにない曲番を集計JSONの`unknownSongs`で確認できる。プレイ差分の対象は変わらず、本番DBへの登録状況を確認する機能ではない。

`tsx`を起動できない環境では、依存パッケージをインストールしたうえで次のコマンドでも差分を作れる。

```bash
node --loader ./scripts/legacy-diff-loader.mjs scripts/compare-legacy-sheets.ts imports/old.xlsx imports/new.xlsx
```
