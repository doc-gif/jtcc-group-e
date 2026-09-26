# T14: 共有オープニングの正式 migration と実 Supabase での確認

2026-09-26。T13 でレビューした SQL 草案を正式 migration にし、専用の Supabase プロジェクト `lastpiece-pitch`（ref `vfwlulahhjtuqnrjjohd`、ap-northeast-1）に適用した。提案モック用の検証プロジェクトであり、公開アプリはまだこの DB に接続していない（`VITE_SUPABASE_URL` などは未設定）。

## 変更

| ファイル | 内容 |
| --- | --- |
| [`supabase/migrations/20260926000239_lp_shared_opening.sql`](../supabase/migrations/20260926000239_lp_shared_opening.sql) | T13 の草案 `supabase/drafts/shared_opening.sql` をそのまま移した（先頭のコメントのみ変更）。4 テーブル、RLS、9 関数、権限 |
| [`supabase/migrations/20260926000446_lp_is_member_internal.sql`](../supabase/migrations/20260926000446_lp_is_member_internal.sql) | `lp_is_member` の `authenticated` への実行権限を外した。ほかの SECURITY DEFINER 関数の中だけで使うため、`/rest/v1/rpc/lp_is_member` として公開する必要がない |
| [`scripts/shared-db.test.mjs`](../scripts/shared-db.test.mjs) | 2 つの migration を順に適用して検証する。`authenticated` が `lp_is_member` を呼べないことを追加で確認（2 つ目の migration がないと失敗することを確認済み） |

ファイル名の日時は、実プロジェクトの `supabase_migrations.schema_migrations` に記録された version と同じにした。`supabase migration list` で差分が出ないようにするため。

`supabase/drafts/optional_broadcast.sql`（Realtime の受信ポリシー）は適用していない。実プロジェクトでは `realtime` スキーマはあるが `realtime.messages` と `realtime.send` がまだなく、Realtime が初期化されていないため。契約どおり、通知なしでもポーリングの snapshot で動く。

## 実 DB で確認したこと

| 確認 | 結果 |
| --- | --- |
| 適用内容 | 9 関数の本体の md5 が、リポジトリの migration をローカル（PGlite）に適用したものと一致 |
| テーブル権限 | 4 テーブルすべて RLS 有効。`anon`・`authenticated` は select / insert / update / delete すべて不可。`service_role` のみ可 |
| 関数権限 | `anon` はすべての `lp_*` を実行不可。`authenticated` は 7 つの RPC と `lp_can_receive` を実行可、`lp_is_member` は不可 |
| RPC の動作（`authenticated` として、ロールバックする取引内で実行） | 作成で残高 3,000。招待で 2 人目が入室。ゲストの開始は `host-required`。ホストの開始で残高 2,500、公開前は結果・在庫・`myResults` が非表示。同じ request の再送で再減算なし。非参加者の snapshot は `room-unavailable`。`authenticated` と `anon` の直接 select は `permission denied`。`anon` の RPC は `permission denied` |
| 後片付け | 確認後、4 テーブルとも 0 行（テストデータは残していない） |
| Advisors | performance: 指摘なし。security: 下記 |

### Security advisor の指摘と判断

- **RLS Enabled No Policy（INFO、4 テーブル）:** 意図どおり。ポリシーを作らず、`anon`・`authenticated` からの直接の読み書きを全面的に拒否する。読み書きはすべて RPC を通す。
- **Signed-In Users Can Execute SECURITY DEFINER Function（WARN）:** 意図どおり。RPC は `auth.uid()` と参加中かどうかを関数の中で確認する設計（T03 契約・T13 レビュー）。不要だった `lp_is_member` は 2 つ目の migration で外した。`lp_can_receive` は Realtime の受信ポリシーが `authenticated` として呼ぶため残す（本人が参加中の部屋かどうかしか返さない）。
- **Leaked Password Protection Disabled（WARN、Auth 設定）:** このアプリは匿名ログインだけでパスワードを使わないため、今回は変更していない。

## 未確認

- この作業環境からは `*.supabase.co` に接続できず、ブラウザと同じ経路（匿名ログイン → `/rest/v1/rpc/...`）での確認はしていない。上の確認は DB の中で `authenticated` ロールと JWT の claim を設定して行った。
- 同時実行の負荷（同時入室・同時開始）、40 端末の接続、Realtime の初期化と受信ポリシーの適用は後続タスク。
- 公開アプリの画面はまだ `supabaseTransport` に接続していない。
