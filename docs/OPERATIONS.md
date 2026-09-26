# 運用: Issue・ラベル・マネージャー（定期実行）

複数のエージェントが同時に作業するための決まり。**タスクの状況は文書ではなく GitHub の Issue とラベルに置く**（AGENTS.md「情報の鮮度」）。仕様と経緯は `docs/HANDOFF.md` と各 Issue の本文に書く。

## ラベル（正は `.github/workflows/repo-labels.yml`）

| ラベル | 意味 | 付ける人 |
| --- | --- | --- |
| `todo` | 着手前 | Issue を作った人・マネージャー |
| `in-progress` | 着手中。着手コメントに**チャット名・ブランチ・触るファイル** | 作業者 |
| `review` | PR が Ready で CI・レビュー待ち | 作業者 |
| `blocked` | 他の Issue・人の操作待ち。理由をコメント | 作業者・マネージャー |
| `needs-owner` | 担当者（@doc-gif）の判断・操作待ち。質問をコメントに書く | 作業者・マネージャー |
| `ready-to-release` | マージ済みで本番公開待ち | Bot のマージ後に作業者 |
| `priority:high` | 急ぎ（ピッチ前に必要）。マネージャーが先に割り当てる | 担当者・マネージャー |
| `parallel-ok` | 他と同時に進められる | Issue を作った人 |
| `lock:supabase` / `lock:figma-master` | 共有資源を使用中。同時に1つだけ。終わったら Issue を閉じる | 作業者 |
| `scope:docs-only` | 文書だけの PR（軽い CI の対象） | 作業者 |
| `manager` | マネージャーの記録 | マネージャー |

状態の流れ: `todo` → `in-progress` → `review` → （マージで Issue が閉じる）→ `ready-to-release`（親 Issue かリリース Issue に付ける）→ 公開でラベルを外す。

## Issue と PR の結びつき

- PR 本文の先頭に **`Closes #N`**（その PR で Issue が終わる）か **`Refs #N`**（続きがある）。CI `PR links an Issue` が無いと落とす。
- `Closes #N` があれば、Bot のマージで Issue は自動で閉じる。手で閉じない。
- 1 Issue に PR が複数あるときは、最後の PR だけ `Closes`、それ以外は `Refs`。

## 作業者（各チャット）の手順

1. `gh issue view N` で本文と最新コメントを読む。`in-progress` が付いていたら手を出さない。
2. 着手コメント（`[チャット名] 着手します。ブランチ: …、触るファイル・資源: …`）→ `in-progress` を付け、`todo` を外す。
3. `origin/main` から専用ブランチ・worktree。Draft PR を開き、本文の先頭に `Closes #N`。
4. 共有資源は `lock:*` の Issue を立ててから。開いているロックがあれば待ち、他の部分を先に進める。
5. 区切りごとに1行の途中経過。質問は `needs-owner` を付けて @doc-gif に。
6. Ready にしたら `review`。Bot のマージまで見届け、マージされたら Issue に結果を1行、親 Issue（#53）の表を更新、`ready-to-release` を付ける。**本番公開はしない。**

## マネージャー（定期実行）の1回の手順

マネージャーは実装しない。1時間ごとに次を行い、結果を **#53 に1コメント**（`[manager] HH:MM UTC` で始める。変化がなければコメントしない）。

1. **実態を見る**: `node scripts/live-state.mjs`、`gh issue list --state open`、`gh pr list --state open`、ラベル。
2. **止まっているものを見つける**
   - `in-progress` なのに 2 時間以上コメントも push もない → Issue に `[manager] 進捗を教えてください。止まっていれば in-progress を外します` とコメント。さらに 2 時間動かなければ `in-progress` を外して `todo` に戻す（作業者のブランチは消さない）。
   - `review` なのに CI が赤・Copilot の指摘が未解決・main の取り込み待ち → Issue にコメントして作業者へ。
   - `blocked` の理由が解消している（依存の Issue が閉じた・ロックが空いた）→ `blocked` を外して `todo` に。
   - `lock:*` の Issue の PR がマージ済みなのに開いている → 閉じる。
3. **割り当てる**: `todo` のうち依存が解けているものを、`priority:high` → 親 Issue の表の順に選び、Issue に `[manager] 次に着手できます。依存: なし／ロック: 空き` とコメント。**新しいチャットを起動するのは担当者**（マネージャーは Issue にマークして、#53 のコメントに「起動してほしい Issue」を列挙する）。
4. **本番公開**: `ready-to-release` が付いた Issue があり、`live-state.mjs` で実行中の公開がなく、main の CI が緑なら、`docs/DEPLOYMENT.md` の手順で公開する（版は最新タグの patch +1。version の入力欄に書く）。成功したら Release の SHA と `deployment.json` を確かめ、URL と QR を #53 のコメントに貼り、`ready-to-release` を外す。失敗したら原因を Issue に書き、`needs-owner` を付ける。
5. **担当者への呼びかけ**: `needs-owner` の Issue を #53 のコメントの末尾に「判断待ち」として列挙する。
6. **やってはいけないこと**: 実装・push・main の保護設定の変更・ロックの横取り・作業者のブランチの操作・Figma・Supabase の変更。

## マネージャーの起動（Claude Code）

- **クラウド**: このリポジトリの環境で Routine（1時間ごと）を作り、固定の1セッションへ次の指示を送る（`docs/OPERATIONS.md` のマネージャーの手順を実行して）。エージェント定義は `.claude/agents/manager.md`。
- **ローカル**: 1つのチャットで `/loop 1h docs/OPERATIONS.md のマネージャーの1回の手順を実行して` と打つ。PC を閉じると止まるので、クラウドの Routine が主。
- 同時に2つ動かさない（同じ Issue に二重にコメントする）。どちらか1つにする。
