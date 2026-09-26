# OPS-4 マージのキュー（Bot が1本ずつ main を取り込み、CI を回してマージする）

## 成果

[HANDOFF の 6](../HANDOFF.md) の 1（候補B）に対応した（Issue #54）。GitHub の merge queue は個人アカウントのリポジトリでは使えないため、使っていない。

- CI が成功した Ready の PR が main より遅れていたら、Bot が main をブランチへマージし、そのブランチの CI を `workflow_dispatch` で起動する。
  - 番号の小さい順に1本ずつ。キューの CI の間は次の PR に手を付けない。
  - CI が成功すれば、いつもどおり承認してマージする。
- キューを動かす時機は3つ: CI の完了、Ready、10分ごとの見回り。毎回すべての PR を見直すので、落ちたイベントも拾う。
- 取り込めない PR（競合・main のワークフローの変更）と、キューの CI が失敗した PR（UI の変更が重なり digest の作り直しが要る、など）には、1回だけ直し方をコメントする。
- CI（`ci.yml`）は、キューの実行では取り込んだ main の SHA と比べて文書だけの PR を判定する。
- 手順は docs/DEVELOPMENT.md「マージのキュー」。

## 検証と証拠

- `scripts/merge-queue.test.mjs`（8件）で次を確かめた。
  - 古い順に1本だけ取り込み、CI を起動する。
  - キューの CI の間は待つ。
  - Draft・フォーク・Bot の PR・緑でない PR は対象にしない。
  - 遅れていない緑の PR はそのままマージする。
  - 取り込めない PR には1回だけ知らせ、次の PR へ進む。
  - キューの CI の成功ではマージし、別のブランチの成功は使わない。
  - キューの CI の失敗は1回だけ知らせる。
- `scripts/auto-merge.test.mjs`・`scripts/ready-run.test.mjs` は既存のまま成功した（遅れた PR の応答の文言と CI の種類を更新した）。
- 実際の GitHub での動作は、この PR のマージ後に、最初に遅れた PR で確かめる（未確認）。未確認の点は2つ。
  - キューが起動した CI の完了で `workflow_run` が届くか。届かなくても10分ごとの見回りで進む。
  - `repos.merge` の権限。

## 残課題

- main の `.github/workflows` が変わった後は、Bot が取り込めない。その間の PR は作業者が手で取り込む（コメントで案内する）。

## ブランチ・記録

`claude/ops-merge-queue`、この PR の Git 履歴を参照。
