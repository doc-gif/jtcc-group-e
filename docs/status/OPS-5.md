# OPS-5 マージのキュー: Bot の取り込み push の承認待ちの CI を承認する（Issue #147）

## 成果

OPS-4（#90）のキューは、main を取り込んだ後の CI を `workflow_dispatch` で起動していた。実際には Bot（GITHUB_TOKEN）の push でも PR の `pull_request` の run が作られ、承認待ち（`action_required`）で残る。Actions の承認方針が first-time contributors で、Bot の push がそれに当たるため。保護ルールはその suite を「必須チェックが未報告」と見るので、`workflow_dispatch` の緑があってもマージが `2 of 2 required status checks are expected` で止まった（#65 で発見）。

- キューが、取り込んだ push の承認待ちの run（CI・Preview build・PR links an Issue）を API で承認する。承認するのは Bot が actor で、キューに並ぶ PR（同じリポジトリ・Ready・Bot 以外が作者）の今の head の SHA とブランチの run だけ。
- run はマージの数秒後に作られるので、取り込んだ回に最大1分待ち、間に合わなければ次の見回りで承認する。
- `workflow_dispatch` の CI は起動しない。`autoMerge` も `pull_request` の CI だけを使い、run のブランチが PR のブランチと同じことを確かめる。
- 承認できなかった PR には、手での承認のしかたを1回だけコメントする。
- 手順と手での回避は docs/DEVELOPMENT.md「マージのキュー」「キューが動かないように見えるとき」。

## 検証と証拠

- `scripts/merge-queue.test.mjs` で次を確かめた。
  - 取り込んだ SHA の承認待ちの run を承認し、`workflow_dispatch` はしない。
  - run が遅れて現れたら次の見回りで承認する。
  - フォーク・Draft・人の push・古い SHA・別ブランチ・push イベントの run は承認しない。
  - 承認できないときは1回だけ知らせ、ほかの PR は進める。
  - キューの CI の間は待つ（作業者の push の CI では待たない）。
  - `workflow_dispatch` の CI の成功ではマージしない。
- 実際の GitHub での確認（遅れた PR が人の手なしでマージされる）は、マージ後に Issue #147 に run の URL を記録する。

## 残課題

- main の `.github/workflows` が変わった後は、Bot が取り込めない（OPS-4 と同じ）。
- `ci.yml` の `workflow_dispatch`（`queue_base`）の入力と「キューが起動する」というコメントは古いが、この PR では変えていない。workflow を変えると、マージ直後に他の Ready の PR へ Bot が取り込めなくなり、この修正の実地確認も遅れるため。次に workflow を変える PR で、入力を外すかコメントを「手での確認用」に直す。
- `auto-merge.yml` の `workflow_run` の条件に残る `workflow_dispatch` も同じ（`autoMerge` が skip するので害はない）。

## ブランチ・記録

`claude/merge-queue-approve`、この PR の Git 履歴を参照。
