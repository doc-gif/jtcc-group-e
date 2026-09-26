# GitHub Pages の公開と過去版

この文書は本番公開の手順。本番は利用者から明示指示を受けた時に公開し、PR のマージだけでは更新しない。確認用サイトは [自動プレビュー](PREVIEW.md) の別フローで配布する。

## 通常の公開手順

1. 対象変更が PR で `main` に入り、Quality gate と UI/UX gate が成功していることを確認する。
2. `node scripts/live-state.mjs` で本番の版と「本番公開の実行（待機中・実行中）」を確認する。**今の main を公開する実行**が待機中・実行中なら新しく依頼せず、その実行を追う。
3. `main` から次を実行する（PowerShell、既存 Git Credential Manager または GH_TOKEN 認証）。版は省く（下の「公開のキュー」が決める）。

```powershell
./scripts/request-release.ps1
```

GitHub CLI がある環境では次でも実行できる。

```bash
gh workflow run release-pages.yml --repo doc-gif/jtcc-group-e --ref main
```

担当者が版を指定したとき（minor・major を上げるなど）だけ `-Version v0.5.0`（`-f version=v0.5.0`）を付ける。最新の版より大きく、未使用であること。

4. [Release GitHub Pages](https://github.com/doc-gif/jtcc-group-e/actions/workflows/release-pages.yml) が完了するまで確認する。ジョブ起動だけで公開完了と報告しない。`validate` の概要が「Skip: この SHA は vX.Y.Z で公開済み」なら、公開は増えていない（その版を報告する）。
5. 最後の `Confirm published release` が、Pages の反映を待ってから次の4つを照合する。
   - 最新 URL の `deployment.json` の版と SHA
   - 固定 URL が 200 を返すこと
   - タグの commit
   - 結果の概要に URL を書き、固定 URL の QR を成果物 `release-qr` に置く

   このジョブの成功を確かめたうえで、最新 URL と固定 URL をブラウザで開いて報告する。最後の報告には確認済みリンクと、同じ URL の QR コード画像を併記する（成果物の画像、または `pnpm qr <HTTPS-URL> <出力先.png>`）。

## 公開のキュー

複数のエージェントが同時に公開を頼んでも、消えたり版が重なったりしないようにする（[HANDOFF の 6](HANDOFF.md) の 2）。

- **依頼は「今の main を公開する」**。実行は依頼した時点の main の SHA を公開する。
- **版は workflow が決める。** `validate`（`scripts/release-plan.mjs`）が、入力がなければ最新のタグの patch + 1 にする。公開は `concurrency: pages-release` で1本ずつ動くので、前の公開が作ったタグを見てから決まり、版は重ならない。
- **同じ SHA は二重に公開しない。** 公開済みの SHA への依頼は、何もせず成功で終える。GitHub は待機中の実行を新しい実行で置き換えることがあるが、新しい依頼は同じかより新しい main を公開するので、置き換えられた依頼の中身は失われない。
- **巻き戻さない。** 最新の版の commit を含まない SHA（古い実行の再実行など）は `validate` で止める。
- 公開後の確認は `confirm` ジョブが自動で行う（上の 5）。

## 公開後の URL

| 用途 | URL（初回公開後に利用可能） |
| --- | --- |
| 最新版 | `https://doc-gif.github.io/jtcc-group-e/` |
| 全バージョン | `https://doc-gif.github.io/jtcc-group-e/versions/` |
| 固定バージョン | `https://doc-gif.github.io/jtcc-group-e/versions/v0.1.0/` |
| タグ・変更内容・ビルド ZIP | `https://github.com/doc-gif/jtcc-group-e/releases/tag/v0.1.0` |

## 仕組み

手動実行で選ばれた `main` の SHA を再テストし、そのテストで使ったビルドを配布する。Vite の相対 base により同じビルドを最新 URL と版ごとのディレクトリに置ける。

`pages-history` ブランチの `site/versions/vX.Y.Z/` に元のビルドを保持し、manifest に SHA・日付・ビルドのハッシュを記録する。毎回、保存済み版のハッシュを照合する。履歴全体と最新版を公式 Pages Actions で一緒に公開し、成功後にタグ・Release・ビルド ZIP を作る。過去版を現在の依存関係で再ビルドしない。タグの更新・削除は ruleset で禁止する。

## 失敗と復旧

- テスト失敗: 公開されない。PR で原因を直す。
- アーカイブ保存後、Pages 公開や Release 作成に失敗: 同じ workflow run の失敗ジョブを再実行する。同じ SHA・ビルドなら再実行できる。別 SHA で同名の版を上書きしない。
- 新しい版が公開済み: 古い run を再実行して最新版を巻き戻さない。修正／revert PR を `main` にマージし、新しいバージョン番号で公開する。
- 同時実行: 公開は直列化する。待機中の実行が新しい実行に置き換えられても、新しい方が同じかより新しい main を公開する（「公開のキュー」）。置き換えられた実行の版の指定は使われないので、版を指定したときは結果の版を確かめる。
- 公開後の確認（`confirm`）の失敗: Pages の反映が遅い・固定 URL がない・タグが違う。公開をやり直さず、概要の理由を確かめてから `confirm` だけを再実行する。
- `pages-history` は生成物専用。手動編集・削除・force push をしない。サイズが 900 MiB を超える場合は公開を止め、履歴の保存先を計画的に移行する。既存 URL を無断で削除しない。

## GitHub 側の初期設定

管理者が `./scripts/configure-github.ps1` で設定内容を確認し、`-Apply` を付けて適用できる。PR 必須チェック、承認数、Actions の承認権限、Pages の Actions ソース、`github-pages` の main 限定、v* タグ保護を設定する。この操作は公開ワークフローを開始しない。トークンはファイルやログへ出さない。

## 制約

過去版は当時のフロントエンドを保存する。将来外部 API を接続した場合、サーバーのデータ・仕様まで固定されるわけではない。振り返り用に読み取り専用または固定データで動くモードを設計する。GitHub Pages はサーバー処理を実行しない。

ルーティングを追加する場合は hash routing を基本とする。history routing を採用するときは固定版 URL の再読み込みと 404 を設計・テストする。Service Worker を追加する場合は版ごとにスコープ・キャッシュ・保存キーを分離し、最新版が過去版を置き換えないようにする。

## 公式資料

- [GitHub Pages の custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GITHUB_TOKEN によるイベントの制限](https://docs.github.com/en/actions/concepts/security/github_token): Bot のマージで push workflow が再発火しないため、公開は明示した workflow_dispatch で行う。
- [GitHub Pages の容量制限](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Vite の相対 base](https://vite.dev/guide/build.html#relative-base)
