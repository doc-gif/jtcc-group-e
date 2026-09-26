# PR と複数作業者の開発フロー

## 1タスク・1ブランチ・1worktree

作業前に `node scripts/live-state.mjs` で main・本番・開いている PR・PR のない最近のブランチ・main にない migration を確認し、担当範囲を PR の Draft に書く。文書に書かれた状態より、この結果を正とする（[AGENTS.md の「情報の鮮度」](../AGENTS.md)）。既存の作業ブランチや同じ作業ディレクトリを複数の作業者で共有しない。

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

文書だけの PR は、2つのゲートを軽い CI（スクリプトのテストとレビュー記録の検査）で報告する。判定の範囲と安全策は [FAST_FEEDBACK.md の「文書だけの PR は軽い CI」](FAST_FEEDBACK.md#文書だけの-pr-は軽い-ci)。

成功した CI の現在の head SHA に対して GitHub Actions Bot が APPROVE を記録し、同じ SHA を指定して squash merge する。`main` の保護ルールは管理者にも適用される。テスト後にコードが増えた場合、以前の結果で新しいコミットを承認しない。PR 作成には作業者自身の認証を使う（Bot は自分の PR を承認できない）。

`workflow_run` の承認ジョブは `main` のスクリプトだけを実行し、PR のコードや成果物を実行しない。フォークからの PR は自動承認の対象外。進行中の修正は Draft のままにする。

## マージのキュー（main が進んだとき）

main は「最新の main を含むこと」を必須にしている（strict）。そのため、ほかの PR が先にマージされると、CI が成功した PR も main より遅れてマージできない。以前は各エージェントが手で main を取り込み、CI をやり直していた。いまは **Bot がキューとして1本ずつ行う**（`scripts/auto-merge.mjs` の `advanceQueue`、[HANDOFF の 6](HANDOFF.md) の 1）。

- 対象は、Ready で、head の最新の CI が成功した、同じリポジトリの PR。**番号の小さい順に1本ずつ**処理する。
- main より遅れていれば、Bot が main を PR のブランチへマージする。その push でも PR のいつもの `pull_request` の run（CI・Preview build・PR links an Issue）は作られるが、**承認待ち（`action_required`）で止まる**。Actions の承認方針が「first-time contributors」で、Bot（GITHUB_TOKEN）の push がそれに当たるため（#147）。保護ルールはこの承認待ちの suite を「必須チェックが未報告」と見るので、別に `workflow_dispatch` で CI を回してもマージできない。
  - そこでキューが、その push の承認待ちの run を API（`POST /actions/runs/{id}/approve`、`actions: write`）で承認する。承認するのは、Bot が actor で、キューに並ぶ PR（同じリポジトリ・Ready・Bot 以外が作者）の今の head の SHA とブランチの、決まった3つの workflow（`ci.yml`・`preview-build.yml`・`pr-issue-link.yml`）の run だけ。PR が足した workflow は Bot は承認しない（`pull_request` の workflow を増やしたら `scripts/auto-merge.mjs` の `queueWorkflows` にも足す）。run はマージの数秒後に作られるので、取り込んだ回に最大1分待ち、間に合わなければ次の見回りで承認する。
  - 承認された CI は通常の PR の CI なので、結果は PR の head の SHA に付き、必須チェックになる。`workflow_dispatch` の CI はもう起動しない（二重に回さない）。
  - キューの CI（Bot の push の run）が動いている間は、次の PR に手を付けない。
- 成功したら、いつもどおり Bot が承認してマージし、次の PR へ進む。キューを動かす時機は3つ: CI の完了、Ready、10分ごとの見回り（`schedule`）。どれも毎回すべての PR を見直すので、イベントが落ちても次の見回りで進む。
- **作業者が手で main を取り込む必要はない。** Ready にして CI が成功したら、待つだけでよい。
- **キューから外れる**のは次の3つ。どちらも Bot が PR にコメントするので、直して push する。CI が成功すればキューに戻る。
  - 取り込めない: 競合するとき、または main が `.github/workflows` を変えたとき（GITHUB_TOKEN はワークフローを書き換えるコミットを push できない）。作業者が `git merge origin/main` で取り込む。
  - 取り込んだ後の CI が失敗した: よくあるのは、**UI の変更が main と重なったとき**。UI の digest がどちらの記録とも合わなくなるため、今の UI を確かめて記録を作り直す（`pnpm ux:digest` → `docs/ux-reviews/`）。UI を変えない PR、または main 側に UI の変更がないときは、digest がどちらかの記録と一致するので作り直しは要らない。
  - 承認できない: Bot が承認待ちの run を承認できなかったとき（権限など）。Bot が手での承認のしかたを PR にコメントする（下の「キューが動かないように見えるとき」）。
- 品質の門は変えていない。キューの CI も `Quality gate`・`UI/UX gate`・全5構成を通す。main の保護設定も変えていない。GitHub の merge queue は、個人アカウントのリポジトリでは使えないため使っていない。

手で取り込むときは次のとおり。

```bash
git fetch origin
git merge origin/main
# 競合があれば意図を確認して解消し、commit する
pnpm verify
git push
```

共有ブランチへの force push や、保護ルールを外した直接マージは行わない。

### キューが動かないように見えるとき

- Actions の「Approve and merge tested PR」を run ID なしで手動実行する（キューだけ進める。承認待ちの run の承認もここで行う）。run ID を入れると、その CI の結果でマージを試す。どちらも実行時に最新 SHA とゲートを検証する。
- PR の head の SHA に承認待ち（`action_required`）の run が残っているなら、手で承認する。承認すると通常の `pull_request` の CI が走り、緑になれば Bot がマージする。

  ```bash
  gh run list --commit <head の SHA> --json databaseId,name,conclusion
  gh api -X POST repos/doc-gif/jtcc-group-e/actions/runs/<run_id>/approve
  ```

  承認するのは、この PR のブランチへの Bot（`github-actions[bot]`）の取り込みの push の run だけにする。知らない人の push の run は中身を読むまで承認しない。

## 初期構築だけの例外

空リポジトリには PR のベースがないため、検証済みの初期構成を最初の `main` として登録した。承認ワークフローがまだ `main` にない初回の導入 PR は、必須テスト成功を確認してセットアップ担当エージェントがマージし、その後 1 件の Bot 承認を必須にする。通常開発にはこの例外を使わない。
