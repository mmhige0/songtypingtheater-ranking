# 個別トークンの初回登録・再送仕様

更新日: 2026-10-11（日本時間）

## 採用済みの方針

ゲーム開発者との合意により、installationTokenはゲーム側で生成・永続保存してから登録する。
サーバー発行方式から変更し、以降の成績送信は従来どおりBearer認証を使う。
サーバーはSHA-256のtokenHashと失効状態だけを保存し、tokenの平文・復元可能な暗号化データは保存しない。
registrationSecret、RegistrationRecovery、復旧用暗号鍵・鍵更新・7日削除ジョブは不要とし、旧復旧案は採用しない。
匿名登録は正規ゲーム・本人の証明ではなく、送信元ごとの制限・失効に使う。共通登録キーは採用しない。

## ゲーム側の処理

1. 初回起動時にplayerId（UUIDv4）とinstallationTokenを生成する。tokenはRandomNumberGeneratorによる暗号学的乱数32バイトとする。
2. tokenをBase64URL（パディングなし、43文字）へ変換する。
3. API通信より前にplayerIdとtokenの両方を端末内の永続領域へ保存する。保存失敗時は登録を送信しない。
4. POST /api/v1/installationsへ保存済みの両方を送信する。
5. タイムアウト・通信切断・5xxでは同じ値で再送する。429もRetry-Afterに従って再送する。再試行や再起動のたびに生成し直さない。
6. 登録成功後、成績送信にAuthorization: Bearer <installationToken>を付ける。成功レスポンスからtokenを受け取る処理は不要。

登録成功後に応答が失われても、同じID・tokenの再送で成功を確認できる。復旧期限は設けないが、失効済みtokenは受け付けない。
保存済みtokenは大文字・小文字を区別し、トリムや文字種変換をしない。

## 登録API

HTTPS、UTF-8 JSON。共通の本文サイズ・JSON検証・送信制限・エラー形式は[API連携案](api-contract.md)に従う。
既存Bearer tokenは初回登録の前提としない。本文の秘密で同じ登録かを照合する。

本文形式（値は形式説明用のプレースホルダー）:

```json
{
  "playerId": "<UUIDv4>",
  "installationToken": "<32バイトのBase64URL・パディングなし43文字>"
}
```

両項目必須。playerIdは小文字へ正規化する。tokenはBase64URL文字・43文字・復号後32バイトを確認し、再エンコードが元の文字列と一致する正規形式だけを受理する。
長さ・形式は検証できるが、クライアントの乱数生成品質自体はサーバーでは証明できない。
tokenHashは正規形式のtoken文字列のUTF-8バイト列に対するSHA-256とする。登録とBearer認証で同じ規則を使う。

| 条件 | HTTP / code | 動作 |
|---|---|---|
| 新規playerId・未使用token | 201 | ID・ハッシュ・createdAt・失効状態を保存 |
| 同一playerId・同一token、未失効 | 200 | 登録済みとして成功。既存情報は変更しない |
| 同一playerId・異なるtoken | 409 PLAYER_ID_ALREADY_REGISTERED | 上書き・再発行しない |
| 同一playerId・同一token、失効済み | 401 REVOKED_TOKEN | 再有効化しない |
| 別playerIdで既登録tokenを再利用 | 409 TOKEN_ALREADY_REGISTERED | tokenの所有先を変更しない。失効済みも再利用不可 |
| 型・形式不正、不明フィールド等 | 400 INVALID_REQUEST | 保存しない |
| 送信制限 | 429 RATE_LIMITED | Retry-Afterに従って同じ値を再送 |
| サーバー障害 | 5xx SERVER_ERROR | 同じ値で再送 |

409・401・400は自動再送しない。異なるtokenの場合は既存IDの失効状態にかかわらず409とする。
成功応答はplayerIdとstatus（新規はcreated、再送はalready_registered）を返す。tokenやハッシュは返さない。Cache-Control: no-storeを指定する。
プロキシ由来の本文なしエラーや通信失敗も扱う。再送間隔はAPI連携案の再送方針に従う。

## 保存・同時登録・失効

- Installation.playerIdとtokenHashをそれぞれ一意にする。Bearer tokenから送信元を一意に特定する。
- 登録に伴うDB更新は一つのトランザクションで保存する。必要なPlayer行作成も同じトランザクションに含める。既存Player行だけを理由に初回Installation登録を拒否しない。
- 同時登録で一意制約が競合したらロールバックし、保存済みのID・ハッシュ・失効状態を再確認する。同じID・tokenなら200、異なるtokenなら409。一意制約競合を通常の500にしない。
- 別ID・同じtokenの同時登録は一方だけ201、もう一方は409とする。
- 再送でtokenHash・createdAt・revokedAtを変更しない。失効状態の照合を含め、登録と失効の並行処理でも再有効化しない。
- tokenの有効期限なし・個別失効可能という既存の初期案は維持する。失効を保持する行を削除して再登録可能にしない。

## 秘密情報・残る制約

- token・認証ヘッダー・登録本文をログ、エラー応答、Photonのカスタムプロパティへ出さない。全参加者がホストへtokenを渡す必要はない。
- playerIdだけ残りtokenが消失した場合は自動復旧できない。IDだけでtokenを再発行・置換しない。本人確認付き復旧か新IDへの移行は別途決める。
- セーブ複製はID・tokenも複製する。別PC利用と本人の厳密な区別は保証しない。
- 公開されたplayerIdの事前登録による占有を減らすため、登録完了後にPhotonへ公開する案は引き続きゲーム側と調整する。
- 本格的なスコア改ざん対策は初期範囲外。

## 受入確認

1. 正しい初回登録は201。DBにtoken平文・復旧用暗号化tokenを保存せず、成功応答にもtokenを含めない。
2. 成功応答消失後、再起動を挟んでも保存済みの同じID・tokenで200となる。
3. 同一ID・同一tokenの同時登録は1件だけ保存され、応答は201と200となる。
4. 同一ID・異なるtokenは409。既存の認証情報は変更されない。同時登録でも一方だけ成功する。
5. 失効済みの同一ID・tokenは401。再送で復活しない。別IDでの同じtokenの登録も409。
6. 不正な長さ・文字・パディング・非正規エンコードは400。正しいtokenは登録とBearer認証で同じハッシュになる。
7. 通信失敗・5xx・429で同じ値を再送し、429のRetry-Afterより早く再送しない。
8. 登録本文・token・認証ヘッダーがログ・Photon・エラー応答へ出ない。
