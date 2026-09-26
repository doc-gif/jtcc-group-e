# 限定公開アプリのキャラクターの絵のアップロード手順（担当者向け）

限定公開アプリ（ホスト用リンク・招待リンクで入るルーム）の街・回す画面・結果カードに、キャラクターの絵を出すための手順です。方式は #144 の案 D（非公開バケット + RLS、実行時に本人のログインで読む）。絵は **担当者が Supabase の Dashboard から直接アップロード** します。リポジトリ・`public/`・確認用プレビュー・本番のビルドには入れません。

所要時間: 15 分ほど。

## しくみ（知っておくこと）

| 項目 | 内容 |
| --- | --- |
| 置き場所 | Supabase `lastpiece-pitch` の Storage の非公開バケット `pitch-characters`（PNG・WebP だけ・1 枚 300 KB まで。作るのは #150 の migration） |
| 見られる人 | **開いているルーム（2 時間の期限内）のホストと参加中の人だけ**（F15 の写真と同じ範囲）。ルームの外の人・一般公開アプリの入口・ログインしていない人は読めない |
| 読むとき | その端末に入ったルームの記録かホスト用キーがあるときに 1 回、ルームに入ったときに読めなかった分をもう 1 回。絵はメモリの中だけに持ち、端末に保存しない |
| 書き込み | アプリからはできない（読み取りのポリシーだけ）。Dashboard からだけ |
| 絵がないとき | 未アップロード・読めない・壊れた画像のときは **何も出さない**（枠や空の箱も出さない。画面の配置は変わらない）。エラーは出ない |
| 確認用プレビュー・E2E・端末内の模擬ルーム | 絵を読まない（何も出ないのが正しい動作） |
| 成果物の検査 | `pnpm build` の最後に `scripts/check-dist.mjs` が、`dist/` に `public/` の外の画像・内部素材の ID・Figma の URL・公開 URL と署名付き URL・大きな `data:image/` が無いことを確かめる。Quality gate・Preview build・本番公開の成果物が同じ検査を通る |

## 1. 絵を用意する（Figma から書き出す）

素材ライブラリ（内部検討用）`MYYMoB2wL7LvA2oXZ2gxpT` の原画像を使います。場所とファイルの対応はこの表にだけ書きます（素材の ID はビルドに入れないため、`src/app/pitchCharacters.ts` の `CHARACTER_SLOTS` には名前だけを持たせている）。

| アプリの場所（`CHARACTER_SLOTS`） | 素材 | 書き出す原画像の node | アップロードする名前 |
| --- | --- | --- | --- |
| 街のお店（`townShop`） | W001 | [`2:12`](https://www.figma.com/design/MYYMoB2wL7LvA2oXZ2gxpT?node-id=2-12)（`2:10` の中） | `chars/town-shop.png` |
| 街の家・左（`townHouseLeft`） | W070 | [`2:519`](https://www.figma.com/design/MYYMoB2wL7LvA2oXZ2gxpT?node-id=2-519) | `chars/town-house-left.png` |
| 街の家・右（`townHouseRight`） | W087 | [`2:644`](https://www.figma.com/design/MYYMoB2wL7LvA2oXZ2gxpT?node-id=2-644) | `chars/town-house-right.png` |
| 街の噴水（`townFountain`） | W019 | [`2:144`](https://www.figma.com/design/MYYMoB2wL7LvA2oXZ2gxpT?node-id=2-144) | `chars/town-fountain.png` |
| 回す画面の右上（`spinCorner`） | W019 | [`2:144`](https://www.figma.com/design/MYYMoB2wL7LvA2oXZ2gxpT?node-id=2-144) | `chars/spin-corner.png` |
| 結果カード（`resultNormal`） | W001 | [`2:12`](https://www.figma.com/design/MYYMoB2wL7LvA2oXZ2gxpT?node-id=2-12) | `chars/result.png` |
| 結果カード・目玉（`resultFeatured`） | W012 | [`2:91`](https://www.figma.com/design/MYYMoB2wL7LvA2oXZ2gxpT?node-id=2-91) | `chars/result-featured.png` |

1. 上の node のリンクを開き、原画像の四角だけを選ぶ。カード全体（説明文つき）を選ばない。
2. 右のパネルの「エクスポート」で **PNG**・大きさ **256w**（幅 256px）を選んで書き出す。透過のままにする。
3. 書き出したファイルの名前を表の「アップロードする名前」の `chars/` の後ろ（例 `town-shop.png`）に変える。同じ原画像を 2 つの名前で使う場所（W001・W019）は、ファイルを複製して名前を付ける。
4. 1 枚 **300 KB 以下**か確かめる。超えたら 200w で書き出し直す（画面では最大 72px ほどで出るので足りる）。
5. このファイルは **リポジトリのフォルダ（`jtcc-group-e` の中）に置かない**。デスクトップなど別の場所に置き、アップロード後に消してよい。

別のキャラクターに替えたいときは、ファイル名は同じまま中身だけを替えてください（コードの変更も公開も要りません）。

## 2. Supabase にアップロードする

バケットは #150 の migration で作ります（Dashboard でバケットを作らない）。

1. [Supabase Dashboard の Storage（`lastpiece-pitch`）](https://supabase.com/dashboard/project/vfwlulahhjtuqnrjjohd/storage/buckets) を開き、バケット **`pitch-characters`** を選ぶ。鍵のマーク（非公開）が付いていることを確かめる。**「Make public」にしない。**
2. 「Create folder」で **`chars`** を作り、開く。
3. 「Upload files」で 7 つのファイルをアップロードする。
4. 一覧に表の 7 つの名前が並ぶことを確かめる。PNG・WebP 以外や 300 KB を超えるファイルはバケットの設定で断られる。

「Get URL」「Copy URL」で作る署名付き URL は、ルームの外の人でも期限まで開けてしまいます。**作らない・人に送らない**でください（アプリは本人のログインで読むので不要です）。

## 3. 本番で確かめる

1. ホスト用リンク（担当者だけが持つリンク）でルームを作る。
2. 画面にキャラクターを置く作業（#146）の後、街・回す画面・結果カードに絵が出ることを確かめる。ほかの端末で招待リンクから入った人にも出る。
3. 絵が出ないときは、ファイル名（`chars/` の下・小文字・`.png`）と、その端末がルームに入っているか（ルームの外・期限切れの後は出ない）を確かめる。

## 4. ピッチが終わったら

- `pitch-characters` の 7 つのファイルを Dashboard で選んで **Delete** する。消すとアプリは自動で「何も出さない」に戻る（コードの変更・公開は要らない）。
- 書き出した原本を残したい場合は、リポジトリの外（担当者の private リポジトリなど）に置く。アプリ・CI からは読まない。

## やらないこと

- バケットを公開にする・ポリシーを足す（読み取りの条件は #150 の migration で決める。変えるときは新しい migration と `lock:supabase` の宣言が要る）。
- 絵を GitHub・PR・Issue・チャット・`public/`・確認用プレビュー・テストのフィクスチャに置く（テストは無地のダミー画像を `new Blob` で作る）。
- アプリのコードに素材の ID・Figma の URL・公開 URL・署名付き URL を書く（`scripts/governance.test.mjs` と `scripts/check-dist.mjs` が止める）。
