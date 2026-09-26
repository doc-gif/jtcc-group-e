# F15: みんなで開封するルームを複数の端末で使う

2026-09-26。担当者の依頼「みんなで開封する機能を複数の端末でできるように対応させてください」。共有ルーム（T10・F05）を、専用の Supabase プロジェクト `lastpiece-pitch`（ref `vfwlulahhjtuqnrjjohd`）につないだ。SQL・RPC は T14〜F13 で適用済みのものをそのまま使う（この作業で DB は変えていない）。

## どうつないだか

| 項目 | 内容 |
| --- | --- |
| 設定 | リポジトリの [`.env.production`](../.env.production) に `VITE_SUPABASE_URL`（`https://vfwlulahhjtuqnrjjohd.supabase.co`）と `VITE_SUPABASE_PUBLISHABLE_KEY`（`sb_publishable_…`）だけを置いた。どちらもブラウザに公開する前提の値（Supabase MCP の `get_project_url`・`get_publishable_keys` で取得）。`vite build`（`pnpm check`・`pnpm build`）が読むので、CI・確認用プレビュー・本番（CI の成果物をそのまま公開）のビルドがすべてつながる。ワークフローは変えていない |
| 秘密の鍵 | secret キー・旧形式の管理者キーは使わない・置かない。`scripts/governance.test.mjs` が `.env.production` のキーの種類と形、`src/` と `.env.production` に秘密の鍵の形がないことを確かめる |
| 使う場所 | `src/realtime/supabase.ts` の `configuredClient()`・`configuredTransport()`（URL が `https://`、キーが `sb_publishable_` のときだけ）。`src/app/sharedRoom.ts` の `defaultRoomSession()` がルームの画面に渡す |
| 設定がないとき | 開発サーバー（`pnpm dev`）・単体テスト（vitest）は `.env.production` を読まないので、従来どおり同じブラウザのタブの間だけで動く端末内デモ（画面に「デモ」と明記） |
| E2E | ビルドは実 Supabase を指すが、`playwright.config.ts` が全ページの `localStorage` に `lastpiece_room_force_demo=1` を入れ、端末内デモにする。`e2e/room.spec.ts` が「テストしている成果物に実 Supabase の URL が入っている」ことと「`*.supabase.co` への要求が 0 件」を確かめる。テストは減らしていない |
| 本人の識別 | 各端末は Supabase Auth の匿名ログイン（最初の RPC の前に1回だけ。`src/realtime/supabase.ts`）。セッションはその端末のブラウザの `localStorage` に、公開先の URL のパスごとに置く（本番と確認用プレビューは別の人になる） |
| 画面 | 実 Supabase のときは「デモ：この端末のブラウザの中だけのルームです」などのデモの注記を出さない。ルームを作れるのはホスト用リンク（`#/host/<キー>`、F10）を開いた端末だけで、「この端末をデモのホストにして作る」は出ない |

## 実 DB で確認したこと（2026-09-26）

この作業環境からは `*.supabase.co` に HTTP で接続できない（プロキシが `CONNECT` を 403 で拒否）。そのため、ブラウザの流れと同じ RPC を、Supabase MCP の SQL で `authenticated` ロールと JWT の `sub`（匿名ユーザー `is_anonymous: true` と同じ形）を切り替えて順に呼び、最後に例外で取り消した（1 つの DO ブロック）。ホスト用キーは担当者の本物のキーを使わず、使い捨てのキー（salt とハッシュだけ）をその取引の中で入れて取り消した。担当者のキーの行（`owner 2026-09`）は読んでいない・変えていない。

| 手順（端末ごとに別の匿名 ID） | 結果 |
| --- | --- |
| A（ホスト）が `lp_create` | 部屋ができ、A がホスト、メンバー 1 人、3,000 コイン |
| A が 1 人で `lp_start` | `need-more-players`（F13） |
| A が表を直接読む | `42501`（RLS・権限で拒否。RPC だけが使える） |
| B が招待で `lp_join`（「ゆい」）→ `lp_ready` | メンバー 2 人 |
| B が `lp_start` | `host-required` |
| C が名前なしで `lp_join` | 「ゲスト さくら80」のような自動の名前 |
| 招待を持たない X が `lp_snapshot`・`lp_can_receive` | `room-unavailable`・`false` |
| A が準備して `lp_start`、同じ request で再送 | ラウンド 1、結果は非公開、A は 2,500。再送でも 2,500 のまま |
| 公開時刻を過ぎた後、A・B・C の `lp_snapshot` | 3 人とも同じ結果（2 人分）。残高 2,500・2,500・3,000（C は見守り）。自分の結果は 1・1・0 件。メンバーの `lp_can_receive` は `true` |
| `anon`（ログインなし）が `lp_join` | `42501` |
| 後片付け | `lp_rooms`・`lp_members`・`lp_stock`・`lp_rounds`・`lp_host_attempts` とも 0 行、`lp_host_keys` は 1 行のまま（担当者のキー） |

- Advisors（security）: 以前と同じ意図どおりの 3 種（RLS Enabled No Policy 6 テーブル、Signed-In Users Can Execute SECURITY DEFINER Function 11 関数、Leaked Password Protection Disabled）。新しい指摘なし。
- 匿名ログイン: T12 で有効・60 件/時/IP を確認済み。`auth.users` に T12 の匿名ユーザー 1 件がある（ほかのユーザーなし）。Dashboard の設定値そのものは MCP では読めないため、この作業では再確認していない。
- 起床通知（Realtime）: `realtime.messages`・`realtime.send` がまだ DB にない（Realtime が未初期化）。受信ポリシー `supabase/drafts/optional_broadcast.sql` も未適用のまま。アプリは購読に失敗しても例外を出さず、**ポーリング（15 秒ごと）と時刻での取り直しで動く**（単体テストで確認）。

## 使うときの注意（ピッチの前に）

- **「今すぐ開始」は、ほかの端末に最大 15 秒遅れて届く**（Realtime がないため）。開封の秒読みは開始から 8 秒なので、参加者の画面が秒読みを飛ばして開封・結果から始まることがある。全員で同時に秒読みを見るには、**「開始の時間を予約する」で1分後などを予約**する（全端末が予約の時刻にサーバーへ取り直し、同じ秒読みになる）。
- **匿名ログインは 1 つの IP から 1 時間に 60 回まで**（T12 の設定）。会場の Wi‑Fi のように全員が同じ回線だと、61 人目以降が入れない。人数が多いときは、各自のモバイル回線で開いてもらうか、担当者が Dashboard（Authentication → Rate Limits）で上限を上げる（担当者の判断）。
- 本番・確認用プレビューの URL ごとに別の匿名 ID になる。ホストと参加者は同じ URL（招待リンク）を使う。
- 本番に出すのは取りまとめ役の指示のとき（[DEPLOYMENT.md](DEPLOYMENT.md)）。

## 未確認

- ブラウザからの HTTP 経路（匿名ログイン → `/rest/v1/rpc/lp_*`、`error.hint` の受け取り、ポーリング）を実際の通信で動かしていない。RPC の名前・引数・エラーの扱いは transport の単体テスト（`src/realtime/supabase.test.ts`）で、DB 側の動作は上の SQL で確認した。
- 実機の 2 台以上・多数端末（最大 100 台）・実 iPhone の遅延と再接続。
- Realtime の起床通知（未初期化のため使っていない）。
- 匿名ログインの上限の現在値（Dashboard で担当者が確認）。

## 担当者の 2 台での確認手順（5 分）

用意: スマホ 2 台（A＝担当者、B＝参加者）。できれば 3 台目（C）。ルームの開始にはホストのほかに 2 人が必要（F13）。2 台だけのときは、B のほかに同じスマホの別のブラウザ（例: Safari と Chrome）を C にする。

1. A でホスト用リンク `https://<確認用プレビューまたは本番の URL>/#/host/<キー>` を開く。アドレスバーから `#/host/…` のキーが消え、「ルームを作る」が出る（「デモ：…」の注記が出ないこと）。名前を入れて「ルームを作る」。
2. A の「招待リンクを共有」→「リンクをコピー」で招待リンクを B（と C）へ送る。
3. B で招待リンクを開き「ルームに入る」→ 名前（例「ゆい」）→ 入る。A の画面の「集まっている人」が 15 秒以内に 2 人になること。B で「抽選に参加する」。
4. C で同じ招待リンクを開き、「ルームに入る」→「名前を決めずに入る」→ 自動の名前（例「ゲスト さくら12」）で入る。A に「あと N 人」が消え、「開封をはじめる」が押せること。
5. A で「開始の時間を予約する」→「1分後」→「1分後に開始を予約」。B・C にも予約の秒読みが出ること。時刻になると 3 台とも「もうすぐ開封！」の秒読み → 「せーので、ひらこう！」→ 結果。B の「みんなの結果を見る」に、A・B（と参加した人）の結果が同じ内容で出ること。
6. B で再読み込み（または一度アプリを閉じて招待リンクを開き直す）→ 同じルームの結果・ロビーに戻ること。
7. うまくいかないときは、画面の文言と時刻、使った URL（キーは送らない）を取りまとめ役に伝える。
