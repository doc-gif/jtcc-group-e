# #68: Realtime の起床通知の migration と実 Supabase での確認

2026-09-26。担当者の要望（招待したとき「何人参加したか」がホストと参加者の画面にすぐ出てほしい。#60 の Realtime の項目は「有効にする」と決定）を、専用プロジェクト `lastpiece-pitch`（ref `vfwlulahhjtuqnrjjohd`）に適用した。適用の前に `lock:supabase` を #77 で取り、#51 の担当に #51 のスレッドで順番の調整を依頼した（DB の物は重ならない）。

## 調査（適用前、2026-09-26 07:35 UTC 時点）

- Realtime は**初期化済み**だった（`realtime.messages` が日ごとのパーティション付きであり、`realtime.send(jsonb,text,text,boolean)`・`realtime.topic()` がある）。Dashboard の操作は不要。以前の記録（MULTI_DEVICE.md の「未初期化」）は古かった。
- `realtime.messages` にポリシーが 1 件もなかった。非公開チャンネルは受信ポリシーがないと入れないので、`lp_wake` が送っていた通知（開始・予約・ピッチモード・名前の変更・ホストの再開）は**誰にも届いていなかった**。
- `lp_join`・`lp_ready`・`lp_leave` は通知を送っていなかった。
- `lp_wake` の内容に、以前の呼び出し元が渡したユーザー ID（`member`・`host`）と `startsAt` が入っていた。

## 変更

[`supabase/migrations/20260926075123_lp_realtime_wake.sql`](../supabase/migrations/20260926075123_lp_realtime_wake.sql)。適用済みの migration は変更していない。ファイル名の日時は `list_migrations` に記録された version（ローカルで作った名前から変えた）。

| 対象 | 内容 |
| --- | --- |
| `realtime.messages` のポリシー `lp_receive_round`（新規） | `SELECT`・`authenticated` だけ。`extension='broadcast' and lp_can_receive((select realtime.topic()))`。INSERT・UPDATE・DELETE のポリシーはない（クライアントは送れない）。Realtime のない DB（PGlite のテスト）では作らない |
| `lp_can_receive`（RPC の補助、SECURITY DEFINER） | トピックを `lp:<小文字の uuid>` として解釈し `lp_is_member` を呼ぶ。以前は全ルームを走査して文字列を比べていた。形が違えば `false` |
| `lp_wake`（内部） | 送る内容を `{roomId, roundNo, reason}` に固定。reason は `join`・`ready`・`leave`・`start`・`schedule`・`pitch-mode`・`rename`・`host`・`change` のどれか。以前の呼び出し元の hint のオブジェクトからはキーの種類だけを見る（値を送らない） |
| `lp_join` | 席を入れた直後に `lp_wake(reason=join)` |
| `lp_ready` | 更新の直後に `lp_wake(reason=ready)` |
| `lp_leave` | 更新の直後に `lp_wake(reason=leave)` |
| `lp_fire_schedule`（内部） | 予約の時刻に開始できなかったとき（nobody-ready など）に `lp_wake(reason=schedule)`。開始したときは `lp_draw` が送る |

- `realtime.send` は取引の中で `realtime.messages` に書くので、取り消された RPC は送らない。受信側はコミット後の状態を取り直す。
- `CREATE OR REPLACE` は既存の権限を保つ。`lp_wake` は `public`・`anon`・`authenticated` から実行権限を外したまま（念のため revoke を繰り返した）。`search_path=''` と SECURITY DEFINER／INVOKER は元のまま。ロックの順は変えていない。
- 同時に採用した下書き `supabase/drafts/optional_broadcast.sql` は削除した（migration に入った）。

## ローカル（PGlite）

`scripts/shared-db.test.mjs`（26 件成功）。`realtime.send` の代役が `realtime.messages` に topic・event・private・payload を記録する。

- 100 人の入室・準備・開始で、join 100 件・ready 100 件・start 1 件。すべて `lp:<roomId>`・イベント `round`・private。
- join・join（名前なし）・ready・rename・pitch-mode・schedule・schedule の取り消し・host・start・leave が **1 回ずつ**。取り消された ready（`round-active`）は 0 件。
- 内容のキーは `reason`・`roomId`・`roundNo` の 3 つだけ。招待コード・ホスト用キー・名前（自動の名前を含む）・ユーザー ID・賞品名を含まない。
- 予約の時刻での開始は 1 回（start）、準備した人がいないときは 1 回（schedule）。
- 受信ポリシーは SELECT・`{authenticated}` の 1 件だけで、migration を 2 回流しても 1 件。`lp_can_receive` はメンバーとホストだけ `true`、非メンバー・大文字の uuid・余分な文字・形の違うトピック・null・退室後は `false`。

## 実 DB（`lastpiece-pitch`）

- `list_migrations` に `20260926075123 lp_realtime_wake` が記録された。
- 関数本体の md5（`pg_proc.prosrc`）がファイルと一致: `lp_can_receive` `f77523213a5776db68174fe80c3e6cc3`、`lp_wake` `3075e4420ad6f78d82212b13754dc4ed`、`lp_join` `6ffad456478b710c6c159dbe385803b8`、`lp_ready` `2d1e16b92444d06e8304f97b03c473de`、`lp_leave` `012154e2501ab4c0beb72aa8d10765b9`、`lp_fire_schedule` `ccdcdfd0334177414856f83e766e6235`。
- 権限: `lp_can_receive`・`lp_join`・`lp_ready`・`lp_leave` は `authenticated` のみ、`lp_wake`・`lp_fire_schedule` は実行権限なし（`postgres`・`service_role` だけ）。
- 取り消す取引（DO ブロックの最後で例外）で、ホスト・参加者 2 人のルームを作り、参加 → 準備 → 名前なしの参加 → 開始 → 開封中の準備（`round-active` で拒否）→ 退室。`realtime.messages` に join・ready・join・start・leave の 5 件（すべて private・`broadcast`・イベント `round`、内容は `roomId`・`roundNo`・`reason` と Supabase が付ける通知の `id` だけ）。拒否された準備は 0 件。`authenticated` のロールで同じルームの `realtime.topic` を設定して読むと、参加者は 5 件、招待のない人は 0 件。取引の後、そのルームの行と通知は 0 件（取り消し済み）。`lp_host_keys` は読んでいない・変えていない。
- Advisors（security）: 以前からの 3 種（RLS Enabled No Policy 6 テーブル、Signed-In Users Can Execute SECURITY DEFINER Function 12 関数、Leaked Password Protection Disabled）に加え、**Anonymous Access Policies（`realtime.messages` の `lp_receive_round`）**。参加者は匿名ログインなので意図どおり（ポリシーはそのルームの参加中の人だけに絞る。F15 の `storage.objects` の `lp_pitch_goods_read` と同じ指摘）。Advisors（performance）: 指摘なし。

## 上限（無料プラン、2026-09-26 時点の公式の表）

同時接続 200、イベント 100 件/秒（端末へ届けた 1 件ずつを数える）、チャンネルへの参加 100 件/秒。100 人のルームでは 1 回の変化で 100 件になる。全員がいっせいに準備するとイベントの上限を超え、Supabase が接続をいったん切る（supabase-js が自動でつなぎ直し、その間はポーリングで動く）。十数人までの確認・ピッチでは足りる。100 人で使う前に、プランを上げるか通知をまとめるかを担当者が判断する（#68）。

## ブラウザからの実通信（ローカル、2026-09-26 07:57 UTC 時点）

この PR の確認用プレビュー（run `36227686658` の `app/`、SHA `671ca57`。以後の変更は文書と main の取り込みだけ）を、Playwright の Chromium で**ブラウザのコンテキストを 3 つに分けて**（別々の端末・匿名 ID と同じ）開いた。ホスト用キー（`lp_host_keys`）を使わないため、ルームは SQL で作り（ホストなし）、最初に入った A を SQL でホストにした。

| 操作 | ほかの端末に届くまで（操作の応答から） |
| --- | --- |
| B が招待から入る | A の「集まっている人」が 2人 に: 0.2 秒以内 |
| C が入る | A と B が 3人 に: 0.1 秒以内 |
| B が「抽選に参加する」 | A の「1人 準備完了」: 0.1 秒 |
| A が「開封をはじめる」 | B・C が「もうすぐ開封！」: 0.2 秒以内。どちらも「開封まで00:08」から（秒読みを飛ばさない） |

ポーリング（15 秒）では届かない速さなので、Realtime の通知で取り直している。JS エラー 0 件。後片付け: 検証のルーム 2 つは `expires_at=now()` で閉じた（匿名の検証ユーザーは F15 のときと同じく `auth.users` に残る）。実機のスマホ（iOS Safari・Android Chrome）での確認は、本番公開後にチームで行う（#68）。
