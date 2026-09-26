# #144 案 D: 限定公開アプリのキャラクター素材の非公開バケットと実 Supabase での確認

2026-09-26（UTC）。#144 の設計（案 D、2-1）のうち、置き場と読み取りの権限を専用プロジェクト `lastpiece-pitch`（ref `vfwlulahhjtuqnrjjohd`）に作った（Issue #150、ロック #151）。形は F15 の写真（[SQL_MIGRATION_F15.md](SQL_MIGRATION_F15.md)）と同じ。素材のアップロードは担当者が #144 の 2-6・2-7 の手順で行う（作業者はしない）。

## 変更

[`supabase/migrations/20260926172325_lp_pitch_characters.sql`](../supabase/migrations/20260926172325_lp_pitch_characters.sql)。追加だけで、既存の表・バケット・ポリシー・関数と `lp_host_keys` は変えていない。ファイル名の日時は `list_migrations` に記録された version と同じ。テストが #68 以後の migration を当て直すので、再実行しても同じ結果になる形にした（バケットは `on conflict do nothing`、関数は `create or replace`、ポリシーは無いときだけ作る）。

| 対象 | 内容 |
| --- | --- |
| バケット `pitch-characters` | 非公開（`public = false`）、1 枚 300 KB（307200）まで、`image/png`・`image/webp` だけ |
| 関数 `public.lp_can_view_characters()` | 本人（`auth.uid()`）が、期限内（`expires_at > now()`）のルームのホストか active なメンバーなら true。今は `lp_can_view_photos()` と同じ中身。SECURITY DEFINER・`search_path=''`。`public`・`anon` から実行権限を外し、`authenticated` だけ |
| ポリシー `lp_pitch_characters_read`（`storage.objects`） | `authenticated` の SELECT だけ。`bucket_id = 'pitch-characters' and (select public.lp_can_view_characters())`。INSERT・UPDATE・DELETE のポリシーはない（アップロードは Dashboard だけ） |

関数を写真と分けたのは、#58 で一般公開アプリの部屋（`kind='demo'`）ができたとき、キャラの方だけ `kind='pitch'` に絞るため（写真は一般公開アプリでも可、キャラは不可）。

### 先に DB に入っていた `lp_open_self_paced` のファイル

この migration より前に、#88 の `20260926133919_lp_open_self_paced`（ロック #129）が DB に適用済みで、ファイルは PR #130 のブランチにだけあった（2026-09-26 17:35 UTC 時点。#130 は main との競合で止まっている）。この PR だけを先にマージすると main の最新が `20260926172325` になり、#130 が後から足す `20260926133919` が順番の検査（`scripts/shared-resources.test.mjs`）で落ちる。そこで #130 のブランチのファイルを**1 バイトも変えずに**この PR に入れた（中身の md5 `a773a770f696d9b1e70b6047b5cf92df` は DB の `supabase_migrations.schema_migrations` に記録された本文と同じ）。#130 が main を取り込むときは同じ中身のファイルなので競合しない。`scripts/shared-db.test.mjs` の適用の一覧には入れていない（#130 がアプリ・テストの変更と一緒に足す）。

## 名前とパスの規則（アプリ側 #149 向け）

- バケット名 `pitch-characters`。オブジェクトは `chars/` の下に置く（`chars/town-shop.png`・`chars/town-house-left.png`・`chars/town-house-right.png`・`chars/town-fountain.png`・`chars/spin-corner.png`・`chars/result.png`・`chars/result-featured.png`。対応は #144 の 2-2）。
- 読むのは匿名ログインした本人のセッションの `download` だけ。公開 URL・署名付き URL は作らない。

## 読める人の範囲

素材はルームごとに分かれていない（全ルーム共通）ので、読めるのは「どこかの開いているルームのホストか active な参加者」。別の開いているルームの参加者も読める（写真と同じ）。限定公開アプリのルームの参加者はみなピッチの関係者なので、公開の範囲は変わらない。ルームごとに絞る必要が出たら新しい migration で絞る（#150 で担当者に確認中）。

## ローカル（PGlite）

`scripts/shared-db.test.mjs` に 3 件（全 33 件成功）: バケットの設定。開いているルームのホストと active な参加者は読め、退室した人（再入室で戻る）・期限切れのルームのホストと参加者・期限切れのルームにだけ入っていた人・招待のない人・ログインなし・`anon` は読めない。ホストは席を離れても開いているルームのホストの間は読める。書き込み（INSERT・UPDATE・DELETE）は RLS で断られ、`anon` は関数を実行できない。関数は SECURITY DEFINER・`search_path=""`、ポリシーは SELECT・`authenticated` の 1 つ。

## 実 DB で確認したこと

| 確認 | 結果 |
| --- | --- |
| 適用前（2026-09-26 17:22 UTC 時点） | 開いているルーム 0、ルーム 8・会員 23。`pitch-characters` も関数も無し。`storage.objects` のポリシーは `lp_pitch_goods_read` の 1 つ |
| 記録 | `list_migrations` の最後が `20260926172325 lp_pitch_characters`。ファイル名と同じ |
| 適用内容 | バケット `pitch-characters`: `public=false`・`file_size_limit=307200`・`allowed_mime_types={image/png,image/webp}`・オブジェクト 0 件。関数の本体の md5 `4eeedbed6316ec8a6e1e5c64175d0625`（ファイルの本体と同じ。今は `lp_can_view_photos` と同じ本体なので md5 も同じ）、`search_path=""`、実行権限は `postgres`・`authenticated`・`service_role` だけ。`storage.objects` のポリシーは `lp_pitch_goods_read` と `lp_pitch_characters_read`（SELECT・`authenticated`） |
| 読み取りの動作（最後に例外で取り消す 1 つの DO ブロック。ルーム・メンバー・ダミーのオブジェクト 2 件は所有者として入れ、以降は `authenticated` と JWT の `sub` で読んだ） | 開いているルームのホストと active なメンバーは 2 件読める（関数は true）。退室した（`active=false`）メンバー・招待のない人・期限切れのルームのメンバーとホストは 0 件（false）。メンバーの INSERT・DELETE は `42501`、UPDATE は 0 行。`anon` の SELECT は 0 件、関数の実行は `42501` |
| 後片付け | 確認後、ルーム 8・会員 23・`pitch-characters` のオブジェクト 0（確認前と同じ）。`lp_host_keys` は読み書きしていない |
| Advisors | performance: 指摘なし。security: これまでと同じ種類だけ。意図どおりの追加が 2 つ: ① SECURITY DEFINER の一覧に `lp_can_view_characters`（本人についての true/false だけを返す）。② Anonymous Access Policies（`storage.objects`）に `lp_pitch_characters_read`（ルームの参加者は匿名ログインなので、匿名の本人が読めるのが目的どおり。条件はルームへの参加） |

## 未確認

- 本物の素材のアップロードと、アプリからの `download`（アプリ側は #149、画面は #146）。
- #58 で `kind` を足すときに `lp_can_view_characters` を `kind='pitch'` に絞る migration（#58 の作業）。
