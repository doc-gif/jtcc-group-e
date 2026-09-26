# #88: 各自でカプセルを開ける migration と実 Supabase での確認

2026-09-26。担当者の決定（#88 のコメント）を SQL にし、専用プロジェクト `lastpiece-pitch`（ref `vfwlulahhjtuqnrjjohd`）に適用した（ロック #108）。仕様は [共有オープニングの契約](SHARED_OPENING_CONTRACT.md) の「各自で開ける（#88）」。

## 決めたこと（担当者の返事）

1. 開けない人は **10 秒** 待つ（カプセルが出てから）。過ぎたら全員の結果。
2. 自分の結果は、タップして開けるまで端末に送らない。
3. 開けないまま退室した人は待たない。
4. 予約の期限の余裕は 1 分のまま（全員の結果まで最長 8 + 10 秒で収まるので、2 分に広げる理由がなくなった。担当者に報告済み）。

## 変更

[`supabase/migrations/20260926104012_lp_open_each.sql`](../supabase/migrations/20260926104012_lp_open_each.sql)。適用済みの migration は変更していない。ファイル名の日時は `list_migrations` に記録された version と同じ。テストが #68 以後の migration を当て直すので、列の追加と新しい関数は再実行しても同じ結果になる形にした。

| 対象 | 内容 |
| --- | --- |
| 列 | `lp_members.opened_round`（本人が最後に開けたラウンド、既定 0）、`lp_rounds.reveal_at`（全員の結果の時刻。既存のラウンドは `starts_at` と同じ値にした） |
| `lp_open(room, round)`（新しい RPC） | SECURITY DEFINER、`search_path=''`、`authenticated` だけ実行可。部屋行 `FOR UPDATE` → 会員の確認 → `lp_fire_due` → 最新ラウンド・`starts_at` 以後・本人が抽選に入っているかを確かめ（違えば `invalid-round`）→ 記録 → `lp_settle_open` → 起床通知 `open` → snapshot。再送は記録も通知もしない |
| `lp_settle_open(room)`（新しい内部の関数） | 実行権限なし。抽選に入った active な人が全員開けていれば、`reveal_at` をその時刻に、`next_ready_at` をその 15 秒後に早める |
| `lp_draw`（内部） | `reveal_at = starts_at + 10 秒`、`next_ready_at = reveal_at + 15 秒`。人数・準備・在庫・ピッチの確定枠と確認の順は変えていない |
| `lp_snapshot`（RPC） | `results`・`stock` の公開を `starts_at` から `reveal_at` に。`myResults` に本人が開けたラウンドを加える。`round` に `revealAt`・`entrants`（ID だけ）・`opened` を加える。ロックの取り方は変えていない |
| `lp_leave`（RPC） | 退室の後に `lp_settle_open` |
| `lp_wake`（内部） | 理由に `open` を加えた。中身は `{roomId, roundNo, reason}` だけのまま |

ロックの順は変えていない（部屋行→会員・在庫・ラウンド）。`CREATE OR REPLACE` は既存の権限を保つ。

## ローカル（PGlite）

`scripts/shared-db.test.mjs`（30 件成功）。#88 の 1 件: 開始前・見守る人・ホスト（準備していない）・古い番号・番号なしは `invalid-round`。開けた本人だけに自分の結果、ほかの人と見守る人には見えない、`stock` も隠れる。再送で `revealAt` も通知の数も変わらない。2 人目が開けると全員の結果・`next_ready_at` は 15 秒後。誰も開けなければ期限の時刻で公開（書き込みなし）し、次の準備は `round-active`。開けないまま退室すると全員の結果。`authenticated` は `lp_settle_open`、`anon` は `lp_open` を実行できない。既存の件は、手で時刻を過去にする所に `reveal_at` を加え、`nextReadyAt - startsAt` の確認を `revealAt` の 10 秒と `nextReadyAt - revealAt` の 15 秒に分けた。

## 実 DB で確認したこと

| 確認 | 結果 |
| --- | --- |
| 適用前（2026-09-26 10:39 UTC 時点） | 開いているルームは 0、開封中のラウンドは 0（遊んでいる人への影響なし）。`list_migrations` はリポジトリと同じ 11 本 |
| 適用内容 | `list_migrations` に `20260926104012 lp_open_each`。既存の 5 ラウンドは `reveal_at = starts_at`（公開時刻は変わらない）、会員 23 行はそのまま |
| 関数権限 | `lp_open`: SECURITY DEFINER、`search_path=""`、`anon` 不可・`authenticated` 可。`lp_settle_open`・`lp_draw`・`lp_wake`: `anon`・`authenticated` とも不可。`lp_snapshot`・`lp_leave` は従来どおり `authenticated` だけ |
| RPC の動作（最後に例外で取り消す 1 つの DO ブロック。部屋・会員は所有者として直接入れ、ホスト用キーは使っていない。JWT の `sub` を切り替えて呼んだ） | ホストの開始で `entrants` 2 人・結果は非公開、`revealAt - startsAt` 10 秒、`nextReadyAt - revealAt` 15 秒。開始前の `lp_open` と見守る人の `lp_open` は `invalid-round`。1 人目が開けると本人の `myResults` 1 件・全員の結果と `stock` は非公開・`opened` 1 人。2 人目は開ける前の `myResults` が 0 件、開けると全員の結果 2 件・次の準備は 15 秒後。見守る人は全員の結果 2 件・自分の結果 0 件 |
| 後片付け | DO ブロックは例外で取り消した。適用後の行数はルーム 8・ラウンド 5・会員 23 で、確認の前と同じ |
| Advisors | performance: 指摘なし。security: これまでと同じ意図どおりの種類（RLS Enabled No Policy 6 テーブル、Signed-In Users Can Execute SECURITY DEFINER Function に `lp_open` が加わって 13 関数、匿名ログインのポリシー 2 件、Leaked Password Protection Disabled）。`lp_open` は本人と会員を関数の中で確かめる RPC なので意図どおり |

## 公開中のアプリへの影響

本番（v0.4.0）と確認用プレビューはこの DB を使う。古いアプリは `revealAt` を知らないが、`startsAt` の後も結果が出るまで 1 秒ごとに取り直すので、全員の結果が最大 10 秒遅れて出るだけで壊れない（開ける操作はないので必ず 10 秒待つ）。

## 未確認

- この作業環境からは `*.supabase.co` に HTTP で接続できず、匿名ログイン → `/rest/v1/rpc/lp_open` の経路は確認していない。
- 実 DB での同時実行（2 人が同時に開ける、開けると退室の競合）は測っていない。部屋行のロックの設計と PGlite の逐次の確認のみ。
- 画面（自分のカプセル・みんなを待つ・全員の結果）は Figma のマスター T10 に加えてから、続きの PR で接続する。

## 2 回目: 各自のペースで回す・みんなの結果は開始から 15 秒（`lp_open_self_paced`）

2026-09-26。担当者の 2 回目の決定（#88 のコメント。前の決定より優先）を SQL にし、同じプロジェクトに適用した（ロック #129）。

### 決めたこと

1. 開始の秒読みはなくし、開始したらすぐ回す。時間の数字は出さない。
2. 時間切れはない。まだ回していない人は、回し終えるまで回す画面のまま。
3. みんなの結果は開始から **15 秒**（固定。全員が開けても早めない）。まだ開けていない人の結果もみんなの結果に出てよい（本人の画面では開けるまで隠す）。前の決定「開けるまで結果を端末に送らない」は 15 秒まで。
4. 予約の期限の余裕（1 分）は変えない。

### 変更

[`supabase/migrations/20260926133919_lp_open_self_paced.sql`](../supabase/migrations/20260926133919_lp_open_self_paced.sql)。ファイル名の日時は `list_migrations` の version と同じ。

| 対象 | 内容 |
| --- | --- |
| `lp_draw`（内部） | `starts_at` = 開始のコミットの時刻（前は 8 秒後）、`reveal_at` = 開始 + 15 秒、`next_ready_at` = 開始 + 30 秒。人数・準備・在庫・ピッチの確定枠は変えていない |
| `lp_open`（RPC） | `starts_at` の確認と早めの公開をなくした（開始の直後から開けられる。時間切れなし） |
| `lp_leave`（RPC） | 退室で公開を早めない（#88 より前の形に戻した） |
| `lp_settle_open`（内部） | 削除 |
| `lp_snapshot`（RPC） | `myResults` の「本人が開けた」ラウンドの条件から `starts_at` を外した |

### ローカル（PGlite）

`scripts/shared-db.test.mjs`（30 件成功）。#88 の 1 件を書き直した: 開始の直後に開けられる、見守る人・ホスト（準備していない）・古い番号・番号なしは `invalid-round`、開けた本人だけに自分の結果、再送で `revealAt` も通知の数も変わらない、全員が開けても公開しない、固定の時刻で公開、誰も開けなくても公開（まだ開けていない人の結果も入る）、公開の後も開けられる、退室で公開が動かない、`lp_settle_open` がない、`anon` は `lp_open` を実行できない。予約の開始の時刻の確認は「8 秒以上」から「0 秒以上」に。

### 実 DB で確認したこと

| 確認 | 結果 |
| --- | --- |
| 適用前（2026-09-26 13:38 UTC 時点） | 開いているルーム 0、開封中のラウンド 0。`list_migrations` はリポジトリと同じ 12 本 |
| 適用内容 | `list_migrations` に `20260926133919 lp_open_self_paced`。`lp_settle_open` は 0 件 |
| 関数権限 | `lp_open`・`lp_leave`・`lp_snapshot` は SECURITY DEFINER・`search_path=""`・`authenticated` だけ。`lp_draw` は実行権限なし（変わらず） |
| RPC の動作（最後に例外で取り消す 1 つの DO ブロック。部屋・会員は所有者として直接入れ、ホスト用キーは使っていない） | 開始で `entrants` 2 人・結果は非公開、`startsAt` は開始の時刻（差 0.0 秒）、`revealAt - startsAt` 15 秒、`nextReadyAt - revealAt` 15 秒。1 人目は開始の直後に開けて自分の結果 1 件・全員の結果は非公開。見守る人の `lp_open` は `invalid-round`。2 人とも開けても全員の結果は非公開。`reveal_at` を過ぎると見守る人に全員の結果 2 件 |
| Advisors | performance: 指摘なし |

### 公開中のアプリへの影響

本番（v0.4.0）と main のアプリは、みんなの結果が開始から 15 秒で出るだけで壊れない（結果が出るまで取り直す）。v0.4.0 は秒読みの画面を出さず、すぐ「せーので、ひらこう！」で 15 秒待つ。
