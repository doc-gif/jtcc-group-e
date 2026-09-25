# 開発進捗

最終更新: 2026-09-26 03:44 JST。共有オープニングの作業先は `feat/shared-opening`。この文書の導入ブランチは `docs/progress-handoff`。基点の `main` は [`ec7d159`](https://github.com/doc-gif/jtcc-group-e/commit/ec7d15958884508fdea2a82bb5e38b8e2da6112d) です。`DONE` はそのタスクの受け入れ条件を確認した意味で、アプリ全体の完成や本番公開を意味しません。Figma のリンクはライブ状態です。過去状態は PR の画像・コミットで固定してください。

## 完了したタスク

| ID | 成果 | 検証と証拠 | 残課題 | 作業ブランチ・記録 |
| --- | --- | --- | --- | --- |
| T01 | 共有オープニングの未完成コードと DB 草案を棚卸し。 | Git の状態・差分・除外設定を確認。基点は [`ec7d159`](https://github.com/doc-gif/jtcc-group-e/commit/ec7d15958884508fdea2a82bb5e38b8e2da6112d)。以前の SQL・protocol テスト成功は実 DB や 40 人の検証ではない。 | `src/realtime/`、`supabase/` などの草案は未コミット・未レビュー。 | `feat/shared-opening`、T01 固有コミットなし。 |
| T04 | 現行 Figma と内部素材の所在を確認し、旧画面を履歴に整理。 | [Town v2 `134:2`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=134-2) の構造とスマホ画面を確認。[Guide `170:2`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=170-2) を作成。 | 現行の主要画面は AI 視覚レビューで再作業判定。内部素材の原本は GitHub に置かない。 | Figma 作業、`feat/shared-opening` に記録。固有コミットなし。 |
| T05 | 体験仕様を定義し、Figma Guide に判断材料を記録。 | [T05 カード `172:2`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=172-2) と 390×844 画面の AI レビュー。Town 5/12、Friend 7/12、Spin 5/10、Shelf 6/12 で再作業。 | `docs/EXPERIENCE_SPEC.md` はこの時点で未コミット。対象ユーザーの観察なし。T07–T11 で画面を見直す。 | `feat/shared-opening`、固有コミットなし。 |
| T06 | 44 変数、文字スタイル 5 種、Button・Badge・Navigation・Sheet を Figma に作成。 | [基礎ガイド `178:15`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=178-15)、[部品 `179:15`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=179-15)。Button 6 状態、48px、全 53 塗りの変数参照、コントラストを確認。部品に限る AI 視覚レビューは該当 4/4。 | 新しい緑の操作トークンはアプリ CSS に未反映（T24）。組み立て画面と対象ユーザーの評価は未実施。 | Figma 作業、`feat/shared-opening` に記録。固有コミットなし。 |
| T12 | 専用 Supabase プロジェクトの匿名ログインと保存済み制限を確認。 | 匿名ログイン 1 件を実行後サインアウト。Dashboard で 60 件/時/IP の保存状態を確認。管理画面へのアクセスが必要な証拠。 | 実 DB・40 人・負荷テストは未実施。T03 の契約確定後に検証する。 | 外部設定の読み取り、固有コミットなし。 |
| H01 | GitHub で読める進捗記録と、希望時だけ使う引き継ぎ手順を追加。 | このファイル、[引き継ぎ手順](HANDOFF.md)、README・AGENTS からの参照。コミットと push の結果は Git 履歴と作業報告で確認する。 | H01 の文書はアプリの実装・デプロイを変更しない。 | `docs/progress-handoff`、このファイルの Git 履歴を参照。 |

## 未完了と次の候補

残り 38 件: `T02`, `T03`, `T07`–`T11`, `T13`–`T43`。現時点で前提がそろった候補は次のとおりです。ここに載せたことは自動割当ではありません。

| 候補 | 前提 | 次に確認する内容 |
| --- | --- | --- |
| T02 | T01 | プレビュー専用と本番公開の境界を確認する。 |
| T03 | T01 | 40 人共有オープニングの状態・操作・権限の契約を固定する。 |
| T07 | T06 | [Town Home v3 `164:64`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=164-64) の世界・商品焦点・地図密度を改修し、390px で再評価する。T05 の最初の視覚修正候補。 |
| T08 | T06 | ガチャの操作・期待・結果を Figma でつなぎ、再評価する。 |
| T09 | T06 | コレクションと友だちの所有・閲覧を Figma でつなぎ、再評価する。 |

`T10` は T03 と T06、`T13` は T03、`T11` は T07–T10 を待ちます。後続の実装・検証・公開カードは前提完了後に選びます。通常依頼を優先し、引き継ぎは[担当者が明示的に希望した場合](HANDOFF.md)だけ開始します。

## 完了ごとの更新方法

担当タスクが終わったら、同じ PR のブランチでこのファイルの該当行を更新し、**成果・検証結果・Figma node/PR/commit の証拠・残課題・ブランチ・更新時刻・次候補**を記す。Figma だけの仕事も進捗更新用の小さな PR で記録する。最新 `origin/main` を取り込み、競合した場合は両方の成果を確認して行を統合する。`main` への直接 push や force push はしない。

更新をタスクのコミットまたは進捗専用コミットに含めて push し、PR の必須 CI と通常のマージ条件に従う。push できない場合は GitHub 反映済みと書かず、ローカルのブランチ・コミット ID・失敗理由を報告する。秘密鍵、認証情報、内部素材の原本、未検証の合格表現を記録しない。
