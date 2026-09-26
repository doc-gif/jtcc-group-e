# F07: 予約開始・ピッチモード・100 席の migration と実 Supabase での確認

2026-09-26。担当者の決定（予約開始、ピッチモード、ルームの上限 100 人と在庫 3 倍）を SQL にし、T14 と同じ専用プロジェクト `lastpiece-pitch`（ref `vfwlulahhjtuqnrjjohd`）に適用した。公開アプリはまだこの DB に接続していない。仕様は [共有オープニングの契約](SHARED_OPENING_CONTRACT.md) の「予約開始」「ピッチモード」。

## 変更

[`supabase/migrations/20260926014051_lp_schedule_pitch.sql`](../supabase/migrations/20260926014051_lp_schedule_pitch.sql)。適用済みの 2 本は変更していない。ファイル名の日時は、実プロジェクトの `supabase_migrations.schema_migrations` に記録された version と同じにした（T14 と同じ理由）。

| 対象 | 内容 |
| --- | --- |
| 列 | `lp_rooms.scheduled_at`（予約の時刻）、`pitch_guarantee`（ピッチモード）、`last_schedule`（最後の予約の結末）。`lp_rounds.guaranteed`（確定枠を使ったか） |
| 新しい RPC | `lp_schedule(p_room, p_minutes)`、`lp_set_pitch_mode(p_room, p_on)`。ホストだけ。`authenticated` だけが実行できる |
| 内部の関数 | `lp_draw`（全員分の抽選。T14 の `lp_start` の本体を移し、ピッチモードの確定枠を加えた）、`lp_fire_schedule`（時刻を過ぎた予約を 1 回だけ実行）、`lp_wake`（Realtime の起床通知）。SECURITY INVOKER で、`public`・`anon`・`authenticated` から実行権限を外した |
| 置き換えた RPC | `lp_snapshot`（予約の実行と新しい項目）、`lp_start`（`lp_draw` を呼び、予約を置き換える）、`lp_create`（在庫 300）、`lp_join`（100 席） |

ロックの順は T13・T14 と同じ（部屋行→会員・在庫・ラウンド）。`lp_snapshot` は、ロックなしの読み取りで予約の時刻を過ぎていると分かったときだけ部屋行を `FOR UPDATE` で取り、それ以外は `FOR SHARE` のまま。`FOR SHARE` から格上げしない（同時に格上げする 2 つの取引がデッドロックするため）。

## ローカル（PGlite）

`scripts/shared-db.test.mjs` に 3 本の migration を順に適用して確認した（9 件成功）。

- 100 人目まで入室、101 人目は `room-full`。新しい部屋の在庫は 300（`badge` 180・`plush` 30・`pouch` 90）。100 人の開始後の残りは 200。
- 予約: ホスト以外は `host-required`、非参加者は `room-unavailable`、1・3・5・10 以外と期限の 1 分前を超える時刻は `invalid-schedule`、変更・取り消し（`cancelled`）、開封中は `round-active`、「今すぐ開始」で予約が消える。
- ホストが 60 秒応答しない状態で、準備していない見守りの snapshot が時刻を過ぎた予約を開始する。オンラインで準備済みの人だけが減算され、ホストの残高は 3,000 のまま。`startsAt` は `scheduledAt` の 8 秒以上後。4 回続けて snapshot してもラウンドは 1 つ。同じ時刻の予約を戻しても再抽選しない。
- 時刻に誰も準備していなければ予約を消して `nobody-ready`。売り切れなら `sold-out` で、確保した目玉を含めコイン・在庫・準備・ラウンドはすべて元のまま。
- ピッチモード: ホストだけが切り替えられ、全員の snapshot に出る。目玉が残り 1 つのとき目玉はちょうど 1 人、`guaranteed` は開始直後から全員に見える。目玉が 0 なら `guaranteed = false` で誰も目玉を受け取らない（予約の開始でも同じ）。在庫が十分なら 4 ラウンド続けて毎回 1 人以上。
- `authenticated` は `lp_draw`・`lp_fire_schedule`・`lp_wake` を実行できない。

## 実 DB で確認したこと

| 確認 | 結果 |
| --- | --- |
| 適用内容 | `list_migrations` に `20260926014051 lp_schedule_pitch`。`lp_*` の 14 関数すべての本体の md5 が、リポジトリの 3 本をローカル（PGlite）に適用したものと一致 |
| 関数権限 | `anon` はすべての `lp_*` を実行不可。`authenticated` は `lp_schedule`・`lp_set_pitch_mode` を含む 9 つの RPC と `lp_can_receive` を実行可。`lp_is_member`・`lp_draw`・`lp_fire_schedule`・`lp_wake` は不可 |
| テーブル権限 | 4 テーブルとも RLS 有効のまま。`anon`・`authenticated` への直接の権限は 0 件 |
| RPC の動作（`authenticated` として、コミットしない取引内。T14 と同じ一時テーブルと DO ブロック） | 作成で在庫 300・ピッチモード off・予約なし。ゲストの予約とピッチモードは `host-required`。ゲストの `lp_draw`・`lp_fire_schedule` は `permission denied`。ホストの 2 分は `invalid-schedule`。ピッチモード on、1 分の予約は 60 秒後で見守りにも見える。予約の時刻を過ぎた状態（管理者として時刻を戻し、ホストの接続時刻を 60 秒前にした）で見守りが snapshot すると、ラウンド 1・予約なし・`lastSchedule.status = 'started'`・`guaranteed = true`・結果と在庫は非公開。さらに 4 回 snapshot してもラウンド 1、ゲスト 2,500、不在のホスト 3,000。開封中の予約は `round-active`。`authenticated` の `lp_rooms` 直接読み取りと、`anon` の 2 つの新 RPC は `permission denied` |
| 後片付け | 確認後、4 テーブルとも 0 行 |
| Advisors | performance: 指摘なし。security: T14 と同じ 3 種（RLS Enabled No Policy、Signed-In Users Can Execute SECURITY DEFINER Function、Leaked Password Protection Disabled）。新しい RPC 2 つが 2 つ目の一覧に加わった。いずれも [T14 の判断](SQL_MIGRATION_T14.md#security-advisor-の指摘と判断) のとおり意図どおり。内部の 3 関数は SECURITY INVOKER で実行権限もないため指摘なし |

## 未確認

- この作業環境からは `*.supabase.co` に HTTP で接続できず、匿名ログイン → `/rest/v1/rpc/lp_schedule` の経路は確認していない。
- 実 DB での同時実行（予約の時刻に多数の端末が同時に snapshot する競合、100 人の同時入室）は測っていない。ロックの設計と PGlite の逐次の確認のみ。
- 画面（予約の選択・秒読み・ピッチモードの表示）は Figma の後に実装する。
