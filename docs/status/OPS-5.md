# OPS-5 マージのキュー: Bot の取り込み push の承認待ちの CI を承認する（Issue #147）

## 成果

OPS-4（#90）のキューは、main を取り込んだ後の CI を `workflow_dispatch` で起動していた。実際には Bot（GITHUB_TOKEN）の push でも PR の `pull_request` の run が作られ、承認待ち（`action_required`）で残る。Actions の承認方針が first-time contributors で、Bot の push がそれに当たるため。保護ルールはその suite を「必須チェックが未報告」と見るので、`workflow_dispatch` の緑があってもマージが `2 of 2 required status checks are expected` で止まった（#65 で発見）。

- キューが、取り込んだ push の承認待ちの run（CI・Preview build・PR links an Issue）を API で承認する。承認するのは Bot が actor で、キューに並ぶ PR（同じリポジトリ・Ready・Bot 以外が作者）の今の head の SHA とブランチの run だけ。
- run はマージの数秒後に作られるので、取り込んだ回に最大1分待ち、間に合わなければ次の見回りで承認する。
- `workflow_dispatch` の CI は起動しない。`autoMerge` も `pull_request` の CI だけを使い、run のブランチが PR のブランチと同じことを確かめる。
- 承認できなかった PR には、手での承認のしかたを1回だけコメントする。
- 手順と手での回避は docs/DEVELOPMENT.md「マージのキュー」「キューが動かないように見えるとき」。
- 追加（2つ目の PR）: #154 のマージ後、承認そのものは GITHUB_TOKEN で通った（run 36261111160 が #153 の run 3 件を承認）。一方、Bot が承認した CI は完了しても `workflow_run` を起こさず、`schedule` もほとんど動かないため、キューが次のイベントまで止まった。そこで見回りがキューの CI の完了を最大25分待ってマージし、キューを進めた回は次の見回りを `workflow_dispatch` で自分で起動するようにした（auto-merge.yml の `timeout-minutes` を 5→30）。`ci.yml` の古いコメントもこの PR で「手での確認用」に直した。

## 検証と証拠

- `scripts/merge-queue.test.mjs` で次を確かめた。
  - 取り込んだ SHA の承認待ちの run を承認し、`workflow_dispatch` はしない。
  - run が遅れて現れたら次の見回りで承認する。
  - フォーク・Draft・人の push・古い SHA・別ブランチ・push イベントの run は承認しない。
  - 承認できないときは1回だけ知らせ、ほかの PR は進める。
  - キューの CI の間は待つ（作業者の push の CI では待たない）。
  - `workflow_dispatch` の CI の成功ではマージしない。
  - 承認した CI の完了を待ってマージし、次の見回りを起動する。25分で終わらなければ引き継ぐ。CI の失敗は PR に知らせ、次の回は空回りしない。
- 実際の GitHub での確認（遅れた PR が人の手なしでマージされる）は、マージ後に Issue #147 に run の URL を記録する。

## 残課題

- main の `.github/workflows` が変わった後は、Bot が取り込めない（OPS-4 と同じ）。
- `ci.yml` の `workflow_dispatch`（`queue_base`）の入力は、手での確認用として残した（キューは使わない。コメントは直した）。
- `auto-merge.yml` の `workflow_run` の条件に残る `workflow_dispatch` は害がない（`autoMerge` が skip する）ので残した。
- 見回りが CI を待つ間（最大25分）は `merge-main` の concurrency で他の見回りが待つ。待ちの間に来たイベントは最新の1つだけ残るが、毎回すべての PR を見直すので落ちない。
- 担当者の判断待ち（needs-owner、#147）: この「待って自分で次を起動する」方式でよいか。代案は PAT での承認（秘密の追加）。

## ブランチ・記録

`claude/merge-queue-approve`（#154）と `claude/merge-queue-follow-ci`、各 PR の Git 履歴を参照。
