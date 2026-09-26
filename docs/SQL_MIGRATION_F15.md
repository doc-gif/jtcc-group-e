# F15: 限定公開アプリの実物グッズ写真の migration と実 Supabase での確認

2026-09-26。担当者の許諾（ピッチ・関係者だけ、実物グッズの写真だけ）で、ルームの結果画面に実物グッズの写真を出すための非公開の置き場所を、専用プロジェクト `lastpiece-pitch`（ref `vfwlulahhjtuqnrjjohd`）に作った。アップロードの手順は [PITCH_PHOTOS.md](PITCH_PHOTOS.md)。作業の宣言は Issue #51（`lock:supabase`）。

## 経緯

migration はクラウドの作業で先に実プロジェクトへ適用され（version `20260926052120`）、ファイルは WIP のブランチ `claude/f15-pitch-photos`（`636add7`）にだけあった（DB がリポジトリより先に進んでいた）。ローカルで引き継ぎ、ファイル名・中身を変えずに main へ入れる。適用済みの migration は変更していない。

## 変更

[`supabase/migrations/20260926052120_lp_pitch_goods_photos.sql`](../supabase/migrations/20260926052120_lp_pitch_goods_photos.sql)。

| 対象 | 内容 |
| --- | --- |
| バケット `pitch-goods` | 非公開（`public = false`）、1 枚 1 MiB（1048576）まで、`image/jpeg` だけ |
| 関数 `public.lp_can_view_photos()` | 本人（`auth.uid()`）が、期限内（`expires_at > now()`）のルームのホストか、active なメンバーなら true。SECURITY DEFINER・`search_path=''`（`lp_*` の表には直接の権限がないため）。`public`・`anon` から実行権限を外し、`authenticated` だけ |
| ポリシー `lp_pitch_goods_read`（`storage.objects`） | `authenticated` の SELECT だけ。`bucket_id = 'pitch-goods' and (select public.lp_can_view_photos())`（副問い合わせで文ごとに1回だけ評価）。INSERT・UPDATE・DELETE のポリシーはない（アップロードは Dashboard だけ） |

アプリ（`src/realtime/photos.ts`）は、ルームの transport が匿名ログインした本人のセッションで `download` し、Blob から object URL を作る。公開 URL・署名付き URL は作らない。セッションがなければ取りに行かない（写真のために匿名ログインしない）。

## 実 DB で確認したこと

| 確認 | 結果 |
| --- | --- |
| 記録 | `list_migrations` の最後が `20260926052120 lp_pitch_goods_photos`。ファイル名と同じ |
| 適用内容 | バケット `pitch-goods`: `public=false`・`file_size_limit=1048576`・`allowed_mime_types={image/jpeg}`・オブジェクト 0 件。関数の本体の md5 `4eeedbed6316ec8a6e1e5c64175d0625`（ファイルの本体と同じ）、`search_path=""`、実行権限は `postgres`・`authenticated`・`service_role` だけ。`storage.objects` のポリシーは `lp_pitch_goods_read` の1つ（SELECT・`authenticated`） |
| 確認前 | `lp_rooms` 5・`lp_members` 15（担当者の確認で閉じたルーム。開いているルーム 0）、`pitch-goods` のオブジェクト 0 |
| 読み取りの動作（最後に例外で取り消す 1 つの DO ブロック。ルーム・メンバー・ダミーのオブジェクト2件は所有者として入れ、以降は `authenticated` と JWT の `sub` で読んだ） | 開いているルームのホストと active なメンバーは 2 件読める（関数は true）。退室した（`active=false`）メンバー・招待のない人・期限切れのルームのメンバーとホストは 0 件（false）。メンバーの INSERT・DELETE は `42501`、UPDATE は 0 行。`anon` の SELECT は 0 件、関数の実行は `42501` |
| 後片付け | 確認後、`lp_rooms` 5・`lp_members` 15・`pitch-goods` のオブジェクト 0（確認前と同じ）。`lp_host_keys` は読み書きしていない（件数だけ確認） |
| Advisors | performance: 指摘なし。security: 以前の 3 種（RLS Enabled No Policy 6 テーブル、Signed-In Users Can Execute SECURITY DEFINER Function、Leaked Password Protection Disabled）に、次の 2 つが加わった。どちらも意図どおり: ① SECURITY DEFINER の一覧に `lp_can_view_photos`（12 関数目。本人についての true/false だけを返し、ほかの人の情報を返さない。REST の `/rpc/lp_can_view_photos` から呼べても害はない）。② Anonymous Access Policies（`storage.objects` の `lp_pitch_goods_read`）。ルームの参加者は匿名ログインなので、匿名の本人が読めるのが目的どおり。条件はルームへの参加 |

## ローカル（PGlite）

`scripts/shared-db.test.mjs` に migration を順に適用する（Storage の小さな代役の `storage.buckets`・`storage.objects` を先に作る）。写真の 3 件: バケットの設定、参加者・ホストは読めて部外者・退室・期限切れは読めない、書き込み（INSERT・UPDATE・DELETE）は RLS で断られ、`anon` は関数を実行できない。

## 画面・状態層

- `src/app/pitchPhotos.ts`: 賞品と素材ライブラリ（L001・L015・L011）・バケットの中の名前・権利表記の対応。`usePitchPhoto` は自分の賞品が決まってから1枚だけ読み、賞品が変わる・ルームを離れる・画面を閉じると object URL を取り消す。
- `src/components/Room.tsx`: 結果の舞台（`267:9379` の Prize hero の位置）で写真を出し、壊れた画像はイラストに戻す。写真を出しているときだけ舞台の下端に権利表記の1行（**Figma 修正待ち**: マスターへの反映は マスターのロック（#71）が空いた後。提案は Town v2 の `task/claude/f15-pitch-photos` `369:8216`）。
- `src/app/sharedRoom.ts`: Supabase につないだセッションだけに写真の取得元を渡す。端末内の模擬ルームでは渡されても使わない。

## 未確認

- 本物の写真のアップロードと、スマホでの表示（担当者が [PITCH_PHOTOS.md](PITCH_PHOTOS.md) の 3 で確かめる）。ブラウザからの `download` の実通信は、写真が 0 件のため「読めないときはイラストのまま」の経路だけが本番で起きる状態。
- HANDOFF の 7（誰でも入れる一般公開アプリのルーム）を作っても、`lp_can_view_photos` を限定公開アプリの部屋（`kind = 'pitch'`）だけに絞る必要はない。担当者の決定（2026-09-26、#135）で一般公開アプリでも実写真のサンリオ商品画像だけは出せるので、開いている部屋の参加者が読める今の条件のままでよい（画面で出すのは #119）。
