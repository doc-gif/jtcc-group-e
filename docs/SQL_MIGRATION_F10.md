# F10: ホスト用リンクとニックネームの migration と実 Supabase での確認

2026-09-26。担当者の決定（ホストは担当者だけ、参加者によるホスト交代の廃止、ルーム内で重ならないニックネーム）を SQL にし、T14・F07 と同じ専用プロジェクト `lastpiece-pitch`（ref `vfwlulahhjtuqnrjjohd`）に適用した。公開アプリはまだこの DB に接続していない。仕様は [共有オープニングの契約](SHARED_OPENING_CONTRACT.md) の「ホスト用リンク」「ニックネーム」。

## 変更

[`supabase/migrations/20260926023427_lp_host_key_names.sql`](../supabase/migrations/20260926023427_lp_host_key_names.sql)、advisor の指摘に合わせた [`20260926023642_lp_host_attempts_pk.sql`](../supabase/migrations/20260926023642_lp_host_attempts_pk.sql)、PR #33 のレビューに合わせた [`20260926025335_lp_name_chars_create_retry.sql`](../supabase/migrations/20260926025335_lp_name_chars_create_retry.sql)、PR #35 のレビューに合わせた [`20260926031422_lp_name_cf_rename_idle.sql`](../supabase/migrations/20260926031422_lp_name_cf_rename_idle.sql)（下記）。適用済みの migration は変更していない。ファイル名の日時は実プロジェクトの `supabase_migrations.schema_migrations` の version と同じ。

| 対象 | 内容 |
| --- | --- |
| 新しいテーブル | `lp_host_keys`（キーごとの salt と `sha256(salt‖key)`、ラベル、期限、取り消し時刻。キー本体は持たない）、`lp_host_attempts`（キーの確認に失敗した匿名 ID と時刻）。どちらも RLS 有効、`public`・`anon`・`authenticated` の権限なし |
| 列 | `lp_rooms.host_key`（部屋を作ったキー。再開の照合用）、`lp_members.name_key`（比べる用の名前。生成列、active な人の間で一意の部分インデックス） |
| 新しい RPC | `lp_create(p_request, p_key, p_name)`（旧 `lp_create(uuid,text)` を置き換え）、`lp_resume_host(p_key, p_room)`、`lp_rename(p_room, p_name)`。`authenticated` だけが実行できる |
| 置き換えた RPC | `lp_join`（名前の重複・名前なし） |
| 削除 | `lp_claim_host`（参加者によるホスト交代）、旧 `lp_create(uuid,text)` |
| 内部の関数 | `lp_host_key_check`（照合・回数制限）、`lp_clean_name`・`lp_name_key`（表示用・比較用の名前）、`lp_name_taken`、`lp_auto_name`、`lp_name_suggestion`。SECURITY INVOKER で、`public`・`anon`・`authenticated` から実行権限を外した |

ロックの順は変えていない（部屋行→会員・在庫・ラウンド）。部屋をロックする新しい RPC（`lp_create`・`lp_resume_host`・`lp_rename`）も、ロックの直後に時刻を過ぎた予約を先に実行する（`lp_fire_due`、F07）。

`lp_name_key` の正規表現の角かっこには、全角の空白（U+3000）をそのままの文字で入れている（適用時の SQL と同じ文字にして、本体の md5 を一致させるため）。3 本目の migration の `lp_clean_name` は、見えない文字をソースに置かないよう `chr()` で書いた。

## ホスト用キーの作成・交換・取り消し

本物のキーはリポジトリに置かない。担当者（または作業の取りまとめ役）が自分の端末で作り、担当者にだけ渡す。

1. キーを作る。キー（256 ビット、43 文字）と、salt とハッシュだけの SQL が表示される。キー本体は DB に送らない。

   ```sh
   node scripts/host-key.mjs "owner 2026-09" https://<公開先>/
   ```

2. 表示された `insert into public.lp_host_keys(...) returning id;` を Supabase の SQL Editor（`lastpiece-pitch`）で実行する。返った `id` を控える。
3. 担当者にホスト用リンク `https://<公開先>/#/host/<キー>` を安全な経路で渡す。チャット・PR・Issue・スクリーンショットに貼らない。
4. 期限を付ける場合: `update public.lp_host_keys set expires_at = now() + interval '30 days' where id = '<id>';`

交換（漏れた疑いがあるときも同じ）:

```sql
-- 1. 上の手順で新しいキーを登録し、新しい id を控える。
-- 2. 開いているルームを新しいキーへ移す（任意。移さなければ古いキーの部屋には新しいキーで戻れない）。
update public.lp_rooms set host_key = '<新しい id>' where host_key = '<古い id>' and expires_at > now();
-- 3. 古いキーを無効にする。以後は host-key-invalid。
update public.lp_host_keys set revoked_at = now() where id = '<古い id>';
```

一覧（キーは表示されない）: `select id, label, created_at, expires_at, revoked_at from public.lp_host_keys order by created_at;`

## 安全の考え方

- **キーを保存しない:** DB には salt（16 バイト）と `sha256(salt‖key)` だけ。キーは 256 ビットの乱数なので、速いハッシュでも総当たりは現実的でない（パスワードのような弱い値ではないため bcrypt は使わない）。
- **読めない場所:** 2 つのテーブルは RLS 有効・ポリシーなし・`anon`・`authenticated` の権限なし。照合は SECURITY DEFINER の RPC（`search_path=''`）の中の内部関数だけで行う。
- **時間で漏らさない:** 有効なキーそれぞれの salt で提示されたキーをハッシュし、32 バイトの値どうしを比べる。比べる時間はハッシュ値に依るだけで、提示したキーがどこまで合っているかには依らない。
- **回数制限:** 匿名 ID ごとに 1 分に 5 回の失敗で、正しいキーでも 1 分間 `too-many-attempts`。同じ ID の確認は advisory lock で 1 つずつ。失敗の記録を残すため、キーの失敗は例外にせず `{"error": ...}` を返す（例外だと取引ごと記録が消える）。1 時間より古い記録は消す。匿名 ID は作り直せるが、Supabase Auth の匿名ログインには IP ごとの上限がある。
- **URL のフラグメント:** キーは `#/host/<キー>` に置くので、ブラウザは HTTP の要求（サーバー・CDN のログ）に含めない。アプリは `localStorage` に保存し（その端末だけ）、アドレスバーからは消す（画面側、F05）。
- **参加者は交代できない:** `lp_claim_host` は削除した。ホストの操作（開始・予約・ピッチモード）は `lp_rooms.host` の本人だけ。

## ローカル（PGlite）

`scripts/shared-db.test.mjs` に migration を順に適用して確認した（最初の 2 本の時点で 16 件成功、F10 は 6 件。3 本目の追加後は 18 件）。

- 保存されるのは salt とハッシュだけで、行にキーの文字列を含まない。`authenticated`・`anon` は 2 つのテーブルを読めず、`lp_host_key_check`・`lp_auto_name` を実行できない。`anon` は `lp_create`・`lp_resume_host`・`lp_rename` を実行できない。
- 違うキー・短いキー・`null`・1 文字違いのキーは `host-key-invalid` で部屋を作らない。5 回の失敗の後は正しいキーでも `too-many-attempts`、ほかの利用者には影響しない。1 分後は作れる。1 時間より古い記録は消える。期限切れ・取り消し済みのキーは無効。
- 参加者はホストが 10 分不在でも `lp_claim_host`・旧 `lp_create` を呼べない（関数がない）。偽のキーで再開できず、開始は `host-required`。F07 までは同じ状況で `lp_claim_host` による交代が成功していた（旧テストで確認していた挙動）ので、それがなくなったことの回帰テスト。
- 新しい端末（新しい匿名 ID）がキーで再開すると、ホストの名前・コイン 2,500・自分の結果・保存済みの結果の userId が移り、ほかの人の残高・結果は同じ。予約は残る。前の端末は `room-unavailable`。参加者として席を持つ端末で再開すると、その席のままホストになり、前のホストの席が空く。開いている部屋がなければ `no-room`。
- 名前: 「もも」は `name-taken`、候補は「もも2」、次は「もも3」。「もも２」「も　も」「Momo」と「ＭＯＭＯ」「ｍｏ ｍｏ」は同じ名前。12 文字の名前の候補は 12 文字に収まる。空・空白だけ・13 文字は `invalid-name`。本人は大小を変えられる。`lp_rename` も同じ規則。退室した人の名前は空き、名前を選ばない再参加は空いていれば前の名前、なければ自動の名前。
- 名前を選ばない 100 人（ホストを含む）が全員「ゲスト <単語><数字>」で重ならず、12 文字以内。

`scripts/host-key.test.mjs` で、キーの形・salt とハッシュが SQL と同じ計算であること・SQL にキーを含まないこと・ラベルの引用符のエスケープを確認した。

## 実 DB で確認したこと

| 確認 | 結果 |
| --- | --- |
| 適用前 | 4 テーブルとも 0 行（名前の一意インデックスを既存データなしで作れる）。PostgreSQL 17.6、`en_US.UTF-8`。`normalize(…, NFKC)`・`sha256`・U+3000 を含む正規表現が PGlite と同じ結果 |
| 適用内容 | `list_migrations` に `20260926023427 lp_host_key_names` と `20260926023642 lp_host_attempts_pk`。`lp_*` の 22 関数すべての本体の md5 が、リポジトリの 6 本をローカル（PGlite）に適用したものと一致 |
| 関数権限 | `anon` はすべての `lp_*` を実行不可。`authenticated` は `lp_create`・`lp_resume_host`・`lp_rename` を含む 10 の RPC と `lp_can_receive` を実行可。内部の 11 関数（F10 の 6 つを含む）は不可 |
| テーブル権限 | 6 テーブルとも RLS 有効。`anon`・`authenticated` への直接の権限は 0 件 |
| RPC の動作（`authenticated` として、最後に例外で取り消す 1 つの DO ブロック。使い捨てのキーもその中で入れて取り消した） | 2 つのテーブルの読み取りと `lp_host_key_check` は `42501`（権限なし）。違うキーの作成は `{"error": "host-key-invalid"}`。正しいキーで作成（在庫 300）。「も　も」は `name-taken`、候補「も も2」。名前なしの参加は「ゲスト ゆず60」。「もも」への変更は `name-taken`・候補「もも2」。`lp_claim_host` は `42883`（関数がない）。参加者の開始は `host-required`。別の ID がキーで再開するとホストになり、名前「もも」を引き継ぎ（2 人のまま）、前の ID の snapshot は `room-unavailable`。5 回失敗した ID は正しいキーでも `too-many-attempts`。`anon` の作成は `42501` |
| 後片付け | 確認後、6 テーブルとも 0 行（キーも入れていない） |
| Advisors | performance: 最初の migration の後に `lp_host_attempts` の No Primary Key（INFO）が出たため、2 つ目の migration で主キーを加え、指摘なし。security: T14・F07 と同じ 3 種。RLS Enabled No Policy は新しい 2 テーブルを含む 6 テーブル（意図どおり）。Signed-In Users Can Execute SECURITY DEFINER Function に `lp_create`・`lp_resume_host`・`lp_rename` が加わり、`lp_claim_host` は消えた（本人とキーの確認は関数の中。[T14 の判断](SQL_MIGRATION_T14.md#security-advisor-の指摘と判断)）。Leaked Password Protection Disabled（匿名ログインだけなので変更なし） |

## 追加の migration: 名前の文字と作成の再試行

[`20260926025335_lp_name_chars_create_retry.sql`](../supabase/migrations/20260926025335_lp_name_chars_create_retry.sql)（PR #33 の Copilot の指摘への対応）。

- **名前の文字:** 最初の版は `[[:cntrl:]]` だけを拒否していたため、ゼロ幅の文字（U+200B）・双方向の上書き（U+202E）・BOM などの見えない書式文字を通し、同じに見える名前や向きの変わる名前を作れた。制御文字と見えない書式文字（U+0001–001F、U+007F–009F、U+00AD、U+061C、U+180E、U+200B–200F、U+2028–202E、U+2060–206F、U+FEFF、U+FFF9–FFFB）を拒否し、Unicode の空白（NBSP、U+2000–200A、U+3000 など）は 1 つの空白にまとめる。状態層の `cleanName` も同じ集合にした（ロケールの `\s` に頼らない）。
- **作成の再試行:** 応答を失った `lp_create` の再試行も毎回キーを確認していたため、その間にキーを交換したり回数制限に達したりすると、作れた部屋がエラーになった。本人が作った開いている部屋の再試行は、キーを確認せずにその部屋を返す。新しい部屋や他人の request は従来どおりキーが必要。
- 状態層: 名前の変更はロビー（準備中を含む）でだけ `canRename`。保存したキーは使う直前と消す直前に読み直し、別のタブが保存した新しいキーを古いキーの失敗で消さない。
- PGlite で修正前に失敗するテストを追加（見えない文字の拒否と空白のまとめ、キーの取り消し・回数制限の後の再試行）。PGlite 18 件成功。
- 実 DB: `list_migrations` に `20260926025335 lp_name_chars_create_retry`。`lp_*` の 22 関数すべての本体の md5 がローカルと一致。権限は変わらない。コミットしない取引で `authenticated` として、キーを取り消した後の同じ部屋の再試行は成功・新しい部屋は `host-key-invalid`、「もも」+U+200B と U+202E+「もも」は `invalid-name`、「も」+NBSP+「も」は `name-taken`、U+3000・U+2003・タブ・NBSP を含む「ゆ ず」は「ゆ ず」になることを確認。後で 6 テーブルとも 0 行。Advisors は上と同じ（performance 指摘なし、security は意図どおりの 3 種）。

## 追加の migration: 書式文字の全体と開封中の名前の変更

[`20260926031422_lp_name_cf_rename_idle.sql`](../supabase/migrations/20260926031422_lp_name_cf_rename_idle.sql)（PR #35 の Copilot の指摘への対応）。

- **Cc・Cf の全体:** 前の版は手で選んだ範囲だけだったため、U+0600（アラビア数字記号）などの書式文字を通した。Unicode の一般カテゴリ Cc と Cf のすべて（Unicode 17、234 コードポイント、23 範囲）を拒否する。状態層は `/[\p{Cc}\p{Cf}]/u`、SQL は同じ集合を `chr()` の範囲で書いた内部関数 `lp_name_forbidden()`（実行権限なし）。`scripts/shared-db.test.mjs` が U+0001–U+10FFFF のすべて（サロゲートを除く）で SQL と JS の集合が一致することを確かめる。Node の Unicode が新しくなり Cf が増えたら、このテストが失敗して知らせる。行・段落の区切り（U+2028・U+2029）は JS と同じく空白にまとめる。
- **開封中の名前の変更:** `lp_rename` は、ラウンドの `next_ready_at` までは `rename-locked`（「ニックネームは開封が終わってから、ロビーで変えられます。」）。保存済みの結果は開始時の名前のままなので、開封中に変えると同じ人に 2 つの名前が出るため。時刻を過ぎた予約はこの確認の前に始まる（`lp_fire_due`）ので、予約の時刻の後の変更も断る（取引ごと戻り、次の snapshot で開始する）。模擬サーバーも同じ。状態層の `rename` はロビーと準備中のほかはサーバーへ送らずに `rename-locked` を返す。
- **キーの保存（状態層）:** 作成・再開が成功しても、応答を待つ間に別のタブが別のキーを保存・削除していたら上書きしない（要求の開始時の値のままのときだけ書く compare-and-set）。
- PGlite で修正前に失敗するテストを追加（U+0600・U+200B・U+202E・U+FEFF・U+2060・U+E0001、全コードポイントの照合、開封中と予約の時刻の後の変更）。PGlite 20 件成功。
- 実 DB: `list_migrations` に `20260926031422 lp_name_cf_rename_idle`。`lp_*` の 23 関数すべての本体の md5 がローカルと一致（関数ごとの md5 をつないだ md5 `bf8b0f3c…` が同じ）。全コードポイントで `lp_name_forbidden()` に当たる数は 234 で、並びの md5 もローカルと同じ。`lp_name_forbidden` は `anon`・`authenticated` とも実行不可、`lp_rename` は `authenticated` だけ。コミットしない取引で `authenticated` として、上の 6 文字入りの名前は `invalid-name`、開封中はホスト・参加者とも `rename-locked`、開封の後は変更でき U+2028 は空白になることを確認。後で 6 テーブルとも 0 行。Advisors は上と同じ（performance 指摘なし、security は意図どおりの 3 種）。

## 未確認

- この作業環境からは `*.supabase.co` に HTTP で接続できず、匿名ログイン → `/rest/v1/rpc/lp_create` の経路（`hint` が supabase-js の `error.hint` に入ること、キーの失敗が `data.error` で返ること）は実際には確認していない。transport の単体テストでだけ確認した。
- 本物のキーは作っていない（取りまとめ役が上の手順で作る）。
- 同じ部屋への同時の参加（自動の名前の競合）は、部屋行のロックと一意インデックスの設計、PGlite での 99 回の逐次参加で確認しただけ。
- 画面（ホスト用リンクの経路、名前入力 `298:2709`・自動の名前 `298:2790`・名前の重複 `298:2867`・ホスト用リンクが無効 `292:2703`）は F05。
