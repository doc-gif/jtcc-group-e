# PR と複数作業者の開発フロー

## 1タスク・1ブランチ・1worktree

作業前に GitHub の未完了 PR を確認し、担当範囲を PR の Draft に書く。既存の作業ブランチや同じ作業ディレクトリを複数の作業者で共有しない。

```bash
git fetch origin
git worktree add ../jtcc-group-e-my-task -b feat/my-task origin/main
cd ../jtcc-group-e-my-task
pnpm install --frozen-lockfile
```

共通設定、依存関係、ロックファイルを変更するときは、同時に触る PR がないか確認する。PR を小さく分割する。worktree は物理的な上書きを防ぐが、同じ箇所への別々の変更を自動的に意味のある形へ統合するものではない。

## マージ条件

通常の依頼の完了地点は、検証・Draft 解除・Bot によるマージ完了・[確認用プレビュー](PREVIEW.md)の動作確認と URL 案内まで。マージの許可や確認用サイトの公開指示を毎回求めない。作業中は Draft とし、検証完了後は作業者自身が `gh pr ready <番号>` または GitHub API で解除する。利用者が停止地点を指定した場合はそれを優先する。本番公開は別の明示指示が必要。

- `Quality gate`: strict 型チェック、lint、Vitest とカバレッジ、ビルド、Playwright の回帰テスト。
- `UI/UX gate`: [UI/UX 基準](UI_UX_STANDARDS.md)のブラウザテストと、現在の UI に対応するレビュー記録。
- `main` の最新状態を含んでいること。競合・未解決会話がないこと。
- Draft ではなく、同一リポジトリの PR であること。

成功した CI の現在の head SHA に対して GitHub Actions Bot が APPROVE を記録し、同じ SHA を指定して squash merge する。`main` の保護ルールは管理者にも適用される。テスト後にコードが増えた場合、以前の結果で新しいコミットを承認しない。PR 作成には作業者自身の認証を使う（Bot は自分の PR を承認できない）。

`workflow_run` の承認ジョブは `main` のスクリプトだけを実行し、PR のコードや成果物を実行しない。フォークからの PR は自動承認の対象外。進行中の修正は Draft のままにする。

## main が進んだとき

```bash
git fetch origin
git merge origin/main
# 競合があれば意図を確認して解消し、commit する
pnpm verify
git push
```

再度 CI に成功すると自動承認の対象になる。共有ブランチへの force push や、保護ルールを外した直接マージは行わない。

同時マージは直列化する。GitHub concurrency では待機中ジョブが新しい実行で置き換わる場合がある。成功済みなのに処理されないときは、Actions の「Approve and merge tested PR」を、該当 CI の run ID を入力して再実行する。実行時にも最新 SHA とゲートを検証する。

## 初期構築だけの例外

空リポジトリには PR のベースがないため、検証済みの初期構成を最初の `main` として登録した。承認ワークフローがまだ `main` にない初回の導入 PR は、必須テスト成功を確認してセットアップ担当エージェントがマージし、その後 1 件の Bot 承認を必須にする。通常開発にはこの例外を使わない。
