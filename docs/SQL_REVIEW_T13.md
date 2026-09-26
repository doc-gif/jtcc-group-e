# T13: 共有オープニング SQL 草案のレビュー

この記録は提案モックの supabase/drafts に対するものです。Supabase 本番プロジェクトへ SQL を適用していません。正式 migration は T14 で作成しました（[T14 の記録](SQL_MIGRATION_T14.md)）。

## 変更

lp_snapshot は最初に部屋行を FOR SHARE でロックし、失効と active membership を確認してから会員・ラウンド・在庫を読みます。変更系 RPC は部屋行を FOR UPDATE してから会員行に触れるため、抽選開始や退室のコミットをスナップショットの途中へ挟みません。同じロック順で、部屋→会員の循環待ちを避けます。

## 受け入れ条件の確認

| 条件 | 根拠と限界 |
| --- | --- |
| 重複 start で再減算しない | 部屋行の排他ロック後に (room, request_id) を確認し、既存なら snapshot を返す。台帳には一意制約がある。PGlite の再送で残高 2,500 のままを確認。実DBの並行再送は未測定。 |
| 40 席を超えない | join が部屋行を排他ロックしてから active 件数を数える。40 人目まで入室、41 人目を拒否するローカル検証は成功。実DBの同時入室負荷は未測定。 |
| 非参加者は結果・残高を操作できない | 公開テーブルは RLS 有効で anon/authenticated の直接権限を取り消す。RPC は authenticated に限定し、会員・ホストを確認する。非参加者の snapshot/start と退室後 snapshot の拒否を PGlite で確認。実 Supabase のロール・権限監査は T14。 |
| 公開前の結果が見えない | starts_at 前の round.results と在庫は null、新しい myResults も非表示。部屋ロックにより、旧 round と新 stock の混在を防ぐ。既存テストは時刻前後を確認。実DBの競合試験は未測定。 |
| Realtime 未初期化でも動く | コア草案を realtime スキーマのない PGlite に適用し、作成・準備・抽選を確認。通知は任意で失敗時も台帳を取り消さない。受信ポリシーは Realtime 初期化後に別途適用する。 |

## 検証

pnpm exec vitest run scripts/shared-db.test.mjs: 1 ファイル、5 件成功。PGlite は実 Supabase の同時トランザクション、40 台のWebSocket、RLSの実ロール動作を代替しません。T14以降で migration の適用と認可を実DBで確認し、40端末の負荷は後続タスクで測定します。

**AIによる非視覚レビュー:** 結果の先見え、退室後の閲覧、二重減算を避けることで、友達と同時に開ける体験を守る設計です。対象ファンによる観察は行っていません。公開アプリが共有ルームへ接続済みという意味ではありません。

参考: [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast)（private フラグだけでは部屋ごとの購読認可にならない）、[PostgreSQL の関数 volatility](https://www.postgresql.org/docs/current/xfunc-volatility.html)（VOLATILE 関数内の SQL はクエリごとに新しい snapshot）。