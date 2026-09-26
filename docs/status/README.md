# タスクごとの完了の記録

1 タスク 1 ファイル（`docs/status/<ID>.md`）。複数の PR が [STATUS.md](../STATUS.md) の同じ表に行を足すと毎回衝突するので、2026-09-26 の OPS-2 より後はここに書く（[AGENTS.md の「共有資源のロックと担当の宣言」](../../AGENTS.md)）。一覧はこのフォルダのファイル一覧と、各ファイルの1行目。

- ファイル名は ID（英大文字で始まり、英数字と `-`。例 `F16.md`、`OPS-2.md`）。1行目は `# <ID> <短い題>`。
- 次の4つの節を必ず書く（`scripts/shared-resources.test.mjs` が検査する）。

```markdown
# F16 ホーム画面から全画面で開く

## 成果
何が変わったか。担当者の依頼・決定（日付）。

## 検証と証拠
テスト・実測・PR・commit・Figma node・確認用 URL。未確認は未確認と書く。

## 残課題
残ったこと・担当者の判断待ち・次の候補。

## ブランチ・記録
`claude/f16-standalone`、#62。
```

- 変わる事実（今の main の SHA・本番の版・PR の状態）は書き写さない（AGENTS.md「情報の鮮度」。`scripts/live-state.test.mjs` が検査する）。時点の事実は UTC の時刻を付ける。
- 秘密（ホスト用キーの本体・secret キー・トークン）を書かない（`scripts/governance.test.mjs` が検査する）。
