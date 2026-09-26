# F13: 開始の人数（ホスト以外に 2 人以上）の migration と実 Supabase での確認

2026-09-26。担当者の決定「ガチャはホスト以外に2人以上じゃないと引けないようにしたい」を SQL にし、T14・F07・F10 と同じ専用プロジェクト `lastpiece-pitch`（ref `vfwlulahhjtuqnrjjohd`）に適用した。公開アプリはまだこの DB に接続していない。仕様は [共有オープニングの契約](SHARED_OPENING_CONTRACT.md) の「開始の人数（F13）」。

## 決めたこと（取りまとめ役の既定、担当者に伝達済み）

1. **今すぐ開始**（`lp_start`）は、ホスト以外の active メンバーが 2 人未満なら `need-more-players`。コイン・在庫・roundNo・ready・予約は変えない。
2. **予約**（1・3・5・10 分後、F07）は人数が足りなくてもできる。時刻を過ぎても 2 人未満なら始めない。予約は残り（`scheduledAt` のまま、`lastSchedule` なし）、2 人目が入った時点で始まる。ホストは待っている予約を変更・取り消しできる。
3. **ピッチモード**も同じ規則。
4. 数えるのは、ホストでなく退室していない（`active`）席。オンラインかどうか・準備OKかどうかでは数えない。
5. 画面は上限（内部の 100）を出さず、「集まっている人 N人」と「あと N 人で始められます」だけ。

## 変更

[`supabase/migrations/20260926033821_lp_min_guests.sql`](../supabase/migrations/20260926033821_lp_min_guests.sql)。適用済みの migration は変更していない。ファイル名の日時は実プロジェクトの `supabase_migrations.schema_migrations` の version と同じ（ローカルで作った名前から、`list_migrations` に記録された version へ変えた）。

| 対象 | 内容 |
| --- | --- |
| 新しい内部の関数 | `lp_guest_count(p_room)`: ホスト以外の active メンバーの数。SECURITY INVOKER、`search_path=''`、`public`・`anon`・`authenticated` から実行権限を外した |
| `lp_draw`（内部） | `round-active` の直後に、2 人未満なら `need-more-players`。`lp_start` の確認の順は `host-required` → 再送 → `stale-round` → `round-active` → `need-more-players` → `nobody-ready` → `sold-out` → `insufficient-coins` |
| `lp_fire_schedule`（内部） | 最初に人数を数え、2 人未満なら何もせずに戻る（予約を消さない・`last_schedule` を書かない） |
| `lp_join`（RPC） | 席を入れた後にもう一度 `lp_fire_due` を呼ぶ。人数待ちの予約は、2 人目（退室した人の再入室を含む）が入った呼び出しの中で、その人を数に入れて始まる。入った直後は準備前なので抽選の対象ではない |

ロックの順は変えていない（部屋行→会員・在庫・ラウンド）。`lp_draw` と `lp_fire_schedule` は部屋行を `FOR UPDATE` で持った呼び出し元の中で数えるので、数えている間に人数は変わらない。`lp_snapshot` は変えていない。人数待ちの予約は `scheduled_at` を過ぎたまま残るので、その間の snapshot は（F07 の設計どおり）部屋行を `FOR UPDATE` で取る。待っている部屋の active メンバーはホストと参加者 1 人の 2 人以下なので、競合は小さい。人数は snapshot の `members`（active な人）と `host` から画面側で数えられるので、snapshot の形は変えていない。

`CREATE OR REPLACE` は既存の権限を保つので、`lp_join` は `authenticated` だけ、`lp_draw`・`lp_fire_schedule` は実行権限なしのまま。

## ローカル（PGlite）

`scripts/shared-db.test.mjs` に migration を順に適用して確認した（24 件成功。F13 の 4 件は migration がないと失敗することを確認済み）。

- 0 人・1 人では `need-more-players`、ゲストの開始は先に `host-required`、退室した人は数えない、ピッチモードでも同じ。断られてもコイン・ラウンドは変わらない。2 人目が入ると開始でき、オフライン（10 分応答なし）の参加者も席として数える。開封中は `round-active` が先。`authenticated`・`anon` は `lp_guest_count` を実行できない。
- 予約の時刻を過ぎても 1 人なら、snapshot・`lp_ready` をしても `scheduledAt` のまま・`lastSchedule` なし・ラウンドなし。今すぐ開始は `need-more-players` で予約は残る。2 人目の `lp_join` の戻り値がラウンド 1・`lastSchedule.status = 'started'`。準備OKのホストと参加者だけが 500 減り、入ったばかりの人は 3,000 のまま。ラウンドは 1 つ。
- 時刻の前に参加者が退室すると待ち、名前を選ばない再入室で始まる（ピッチモードの確定枠つき）。
- 待っている予約をホストが 3 分後に変更・取り消しできる（`cancelled` と元の時刻）。

F13 より前の 3 件（通知の失敗・Realtime なしの台帳・開封中の名前の変更）は、ホスト 1 人か参加者 1 人で開始していたので、参加者を 2 人にした。

## 実 DB で確認したこと

| 確認 | 結果 |
| --- | --- |
| 適用前 | `lp_rooms`・`lp_members`・`lp_stock`・`lp_rounds`・`lp_host_attempts` とも 0 行。`lp_host_keys` は読んでいない・変えていない（担当者のキーの行がある） |
| 適用内容 | `list_migrations` に `20260926033821 lp_min_guests`。`lp_*` の 24 関数すべての本体の md5・SECURITY DEFINER の有無・`search_path` の設定が、リポジトリの 9 本をローカル（PGlite）に適用したものと一致（関数ごとの値をつないだ md5 `f4aa20e6f847a8da8032caad41abf2c6`）。変えた 4 関数: `lp_draw` `603768b6…`、`lp_fire_schedule` `995cee58…`、`lp_guest_count` `aa09ffe4…`、`lp_join` `1a8b5ebf…`。すべての `lp_*` が `search_path=""` |
| 関数権限 | `anon` はすべての `lp_*` を実行不可。`authenticated` は 10 の RPC（すべて SECURITY DEFINER）と `lp_can_receive` だけ。`lp_guest_count` を含む内部の 13 関数は不可 |
| テーブル権限 | 6 テーブルとも RLS 有効。`anon`・`authenticated` への直接の権限なし |
| RPC の動作（最後に例外で取り消す 1 つの DO ブロック。部屋は所有者として直接入れ、ホスト用キーは使っていない。以降は `authenticated` と JWT の `sub` で呼んだ） | 参加者 0 人の開始は `need-more-players`。1 人入って、参加者の開始は `host-required`、ホストの開始は `need-more-players`。`authenticated` の `lp_guest_count` は `42501`。1 分後の予約を入れ、時刻を過ぎた状態（所有者として時刻を戻した）で参加者が snapshot すると、ラウンド 0・予約あり・`lastSchedule` なし。その後のホストの開始は `need-more-players` で、予約は残る。2 人目の `lp_join` の戻り値はラウンド 1・予約なし・`started`・結果は非公開、入った人の残高 3,000。残高はホスト 2,500・準備した参加者 2,500・入った人 3,000、ラウンドは 1 つ。別の部屋で 2 人が入った後のホストの今すぐ開始はラウンド 1・残高 2,500。`anon` の `lp_guest_count`・`lp_start` は `42501` |
| 後片付け | 確認後、5 テーブルとも 0 行（`lp_host_keys` は触っていない） |
| Advisors | performance: 指摘なし。security: T14・F07・F10 と同じ意図どおりの 3 種（RLS Enabled No Policy 6 テーブル、Signed-In Users Can Execute SECURITY DEFINER Function 11 関数、Leaked Password Protection Disabled）。新しい指摘はない（`lp_guest_count` は SECURITY INVOKER で実行権限もない） |

## 未確認

- この作業環境からは `*.supabase.co` に HTTP で接続できず、匿名ログイン → `/rest/v1/rpc/lp_start` の経路は確認していない。
- 実 DB での同時実行（2 人目と 3 人目の同時の入室、入室と snapshot の競合）は測っていない。部屋行のロックの設計と PGlite の逐次の確認のみ。
- 画面（ロビーの「あと N 人で始められます」、開始ボタンの無効、予約の人数待ち）は Figma のマスターに加えた後、F05 で接続する。
