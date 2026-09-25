# GitHub Pages の公開と過去版

初回公開は、利用者から公開指示を受けた時に行う。PR のマージだけでは公開しない。

## 通常の公開手順

1. 対象変更が PR で `main` に入り、Quality gate と UI/UX gate が成功していることを確認する。
2. [Releases](https://github.com/doc-gif/jtcc-group-e/releases) を確認し、未使用の `vMAJOR.MINOR.PATCH` を決める。初回は `v0.1.0`。バージョンは以前より大きくする。
3. `main` から次を実行する（PowerShell、既存 Git Credential Manager または GH_TOKEN 認証）。

```powershell
./scripts/request-release.ps1 -Version v0.1.0
```

GitHub CLI がある環境では次でも実行できる。

```bash
gh workflow run release-pages.yml --repo doc-gif/jtcc-group-e --ref main -f version=v0.1.0
```

4. [Release GitHub Pages](https://github.com/doc-gif/jtcc-group-e/actions/workflows/release-pages.yml) が完了するまで確認する。ジョブ起動だけで公開完了と報告しない。
5. 最新 URL と固定 URL をブラウザで開き、Release の commit SHA と公開先の `deployment.json` を確認して報告する。

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
- 同時実行: 公開は直列化するが、GitHub は待機中の実行を新しい実行で置き換えることがある。消えた実行は状態を確認して再要求する。
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
