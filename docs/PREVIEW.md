# 確認用プレビュー

通常の修正は、検証・PR の Ready 化・自動マージ・プレビューの動作確認までを作業者が行う。利用者は確認用 URL をスマートフォンで開いて確認できる。本番公開は別の明示指示で行う。

## 構成

確認用サイトは `doc-gif/jtcc-group-e-preview` の GitHub Pages。本番 `doc-gif/jtcc-group-e` の Pages・Release・履歴ブランチを更新しない。プレビューは公開 URL なので秘密情報や実ユーザーのデータを含めない。

## 利用者に渡すもの

- PR の Bot コメントに「この変更をスマートフォンで開く」というリンクを掲載する。
- 固定 URL: `https://doc-gif.github.io/jtcc-group-e-preview/pr-<PR番号>/runs/<CI実行ID>/`
- 最新画面への入口: `https://doc-gif.github.io/jtcc-group-e-preview/pr-<PR番号>/`
- 変更内容と試してほしい操作を短く説明する。利用者に Git やビルド操作を求めない。

Draft でも CI に通れば確認できる。通常は返答待ちを理由に Draft のまま止めず、マージまで進める。「確認するまでマージしない」「モックだけ」などの明示指示は優先する。

## 自動化

`CI` 完了 → `Publish PR preview` → 専用リポジトリにビルド成果物を配置 → Pages 応答確認 → PR コメント更新。

- 同一リポジトリの main 向け PR の最新 commit で `Quality gate` と `UI/UX gate` が成功した `web-dist` だけを配布する。外部 fork、失敗、古い commit、未マージで閉じた PR は対象外。
- 途中で Bot がマージしても配布できる。配布直前・コメント前にも対象 PR を再確認する。
- 配布スクリプトは main から読み、PR のコードを鍵のあるジョブで実行しない。成果物の名前・容量・リンクを検査する。
- `preview-publish` Environment の実行元を main に限定する。`PREVIEW_DEPLOY_KEY` は確認用リポジトリだけに書き込める SSH deploy key。
- 本番の `release-pages.yml`、タグ、Release、`pages-history` は変更しない。

## 保存期間とデータ

固定 URL の内容は上書きせず、マージ後も閲覧できる。原則30日・PRごと最新3ビルドを保持し、次の配布で超過分を削除する。期限ぴったりに削除するタイマーではない。正式版の永続保存は本番のバージョン公開を明示指示する。

1ビルド50MiB・配布対象全体700MiBを上限とし、超過時は停止する。削除済みデータは Git 履歴に残り得る。公開リポジトリに秘密情報や実ユーザーのデータを入れない。

画面には確認用と表示する。コイン・ニックネームなどの保存データは PR・CI 実行ごとに分ける。ただし本番と同じ `doc-gif.github.io` origin なのでセキュリティ上の隔離ではない。将来 API・認証を追加する際は確認用の接続先・認証設定も別途設計する。

## 接続設定

1. 公開リポジトリ `doc-gif/jtcc-group-e-preview` の main に `.preview-site.json`（`{"repository":"doc-gif/jtcc-group-e-preview"}`）、`.nojekyll`、待機用 `index.html` を配置する。
2. 確認用リポジトリの Pages を main の `/` から公開する。
3. 専用 SSH deploy key の公開鍵を確認用リポジトリに書込権限付きで登録する。秘密鍵はソースリポジトリの `preview-publish` Environment の secret `PREVIEW_DEPLOY_KEY` に登録する。鍵をコードやログに貼らない。
4. `preview-publish` の deployment branch policy を main のみにする。
5. ワークフローを main にマージする。`workflow_run` は main に存在してから動くため、初回だけ成功済み PR CI の実行 ID で下記の再実行を行う。

接続設定や実際の URL 確認が未完了なら「有効化済み」と報告しない。

## 完了確認・復旧

1. `pnpm verify` と push 後の必須 CI を確認する。
2. 完了したら `gh pr ready <番号>` または GitHub API で Draft を解除する。Bot のマージ完了まで確認し、保護ルールは迂回しない。
3. 確認用リンク・対象 SHA の `preview.json`・変更した操作を確認し、利用者に URL を渡す。
4. プレビューだけが失敗したら `Publish PR preview` のログで原因を調べる。本番デプロイで代用しない。

同時配布は直列化する。GitHub の concurrency で待機中の実行が置き換わった場合や接続後の再試行は次を使う。

```sh
gh workflow run preview.yml --ref main -f run_id=<成功した最新PRのCI実行ID>
```

Actions 画面の Run workflow でも同じ ID を指定できる。再実行でも対象・CI・SHA の検証を省略しない。同じ URL の内容は変えられないので修正後は新しい CI 実行を使う。Pages の反映確認は最大約10分。遅延時は応答を確認してから再実行する。

## 参考

- [workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
- [Pages の公開元](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
