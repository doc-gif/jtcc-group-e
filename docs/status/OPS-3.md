# OPS-3 本番公開のキュー（版の自動決定・二重公開の防止・公開後の自動確認）

## 成果

[HANDOFF の 6](../HANDOFF.md) の 2 に対応した（Issue #54）。本番公開を複数のエージェントが同時に頼んでも、消えたり版が重なったりしないようにした。

- `Release GitHub Pages` の版の入力は任意にした。
  - 省くと、`validate`（`scripts/release-plan.mjs`）が最新のタグの patch + 1 に決める。公開は1本ずつ動くので、前の公開のタグを見てから決まる。
  - 公開済みの SHA への依頼は何もしない。待機中の実行が新しい依頼に置き換えられても、新しい方が同じかより新しい main を公開する。
  - 最新の版を含まない SHA（巻き戻し）は止める。
- 最後に `Confirm published release`（`scripts/release-confirm.mjs`）を追加した。
  - Pages の反映を待ち、最新 URL の `deployment.json`（版・SHA）、固定 URL の 200、タグの commit を照合する。
  - URL を概要に書き、固定 URL の QR を成果物 `release-qr` に置く。
- `scripts/request-release.ps1` の `-Version` を任意にした。DEPLOYMENT.md と AGENTS.md の公開手順も合わせた。

## 検証と証拠

- `scripts/release-queue.test.mjs`（9件）で次を確かめた。
  - 版の決め方: 数値で比べた最新のタグの patch + 1。最初の版と、入力した版の検査も含む。
  - 公開済みの SHA は公開しない。公開済みとみなすのはタグ・Release・`web-app.zip` がそろったときだけで、タグだけなら途中で失敗した公開として `validate` を失敗にし、元の実行の再実行を案内する（Copilot の指摘）。
  - 巻き戻しは止める。
  - 反映待ちでは、古い deployment.json・503 の間は待ち続ける。
  - 時間切れ、固定 URL の 404、タグの SHA の違いは失敗にする。
- 実際の公開での動作は、この PR のマージ後に担当者の指示で最初に公開するときに確かめる（未確認）。

## 残課題

- マージのキュー（HANDOFF 6 の 1）は #90 でマージ。ロックと担当の宣言（6 の 3・4）は PR #79。
- 公開の依頼のしかたは変わらない: 担当者の明示の指示があるときだけ、`docs/OPERATIONS.md` のマネージャーの手順 4 または `docs/DEPLOYMENT.md` に従って依頼する。この PR では本番公開をしていない。
- 確認の QR は成果物に置く。本番のサイトに `qr.png` を置く変更は `scripts/release-lib.mjs` に入るので、UI の digest が変わる。そのため今回は行っていない。

## ブランチ・記録

`claude/ops-release`、この PR の Git 履歴を参照。
