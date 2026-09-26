# OPS-2 共有資源のロックと担当の宣言を AGENTS.md に入れる

## 成果

担当者の依頼（2026-09-26）で、[HANDOFF の 6](../HANDOFF.md) の 3・4（共有資源のロック・担当の宣言）を AGENTS.md の規則にした（Issue #54）。

- すでに使われていた運用（親 Issue #53 の「着手します」のコメントと `in-progress`、ロックの Issue #50・#51）を正式な規則にした。
- 同時にロックを立てたときの決め方（番号の小さい Issue が持つ）を足した。
- `node scripts/live-state.mjs` に「共有資源のロック」を足した。開いている Issue・PR の `lock:supabase`・`lock:figma-master` から持ち主を出し、重なっていれば注意を出す。一覧は最後のページまで読む（100 件で止めると古いロックを見落とす。Copilot の指摘）。
- 進め方（着手コメント・ラベル・作業者の手順）の正は #73 で入った `docs/OPERATIONS.md`。AGENTS.md の節は資源と決まり（ロックの対象と期間、migration の順番、完了の記録の置き場所）を持ち、OPERATIONS.md を参照する。ロックの期限・延長・引き継ぎは #133（PR #134）で OPERATIONS.md に入る。
- migration の検査を CI に足した（`scripts/shared-resources.test.mjs`）。
  - ファイル名の形と version の重複を見る。
  - main にある migration の書き換え・削除・改名を止める。
  - main の最新より前の version を止める。
- 完了の記録を `docs/status/<ID>.md`（1タスク1ファイル）に分けた。STATUS.md の表はそれより前の記録として残す。

## 検証と証拠

- `scripts/live-state.test.mjs` に、ロックの持ち主・重なり・未確認の3つのテストを足した。
- `scripts/shared-resources.test.mjs` を足した。対象は migration の名前・順番・変更の禁止、`docs/status/` の形、AGENTS.md の案内。main 側の一覧が空なら失敗にする（検査が黙って効かなくなるのを防ぐ）。PR の CI と Preview build の checkout は `fetch-depth: 2`（HEAD^1 が要る）。
- 実際の GitHub での `live-state.mjs` の確認（2026-09-26 07:07 UTC 時点）:
  - `lock:supabase` の持ち主として #51 を出した。
  - `lock:figma-master` の持ち主として #50 を出した。同じラベルが付いた #61 には重なりの注意を出した。

## 残課題

- マージのキュー（HANDOFF 6 の 1）は #90 でマージ。リリースのキュー（6 の 2）は PR #65（`claude/ops-release`）。
- STATUS.md の表の既存の行は移していない。移すかどうかは各タスクの担当が決める。

## ブランチ・記録

`claude/ops-locks`、この PR の Git 履歴を参照。文書だけの PR の軽い CI は OPS-1（`claude/ops-queue`、#52）。
