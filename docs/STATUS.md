# 開発進捗

最終更新: 2026-09-26 06:48 JST。今回の進捗ブランチは `docs/t10-room-design`、基点の `main` は [`1450a49`](https://github.com/doc-gif/jtcc-group-e/commit/1450a49bbbe48d0f813f5b1e6526b8ad632a89e7) です。`DONE` は各タスクの受け入れ条件を確認した意味で、アプリ全体の完成や本番公開を意味しません。Figma はライブ状態です。内部画像は公開リポジトリに置かず、AIレビューの変更前後画像を作業計画フォルダに保持します。

## 完了したタスク

| ID | 成果 | 検証と証拠 | 残課題 | 作業ブランチ・記録 |
| --- | --- | --- | --- | --- |
| T01 | 共有オープニングの未完成コードと DB 草案を棚卸し。 | Git の状態・差分・除外設定を確認。基点は [`ec7d159`](https://github.com/doc-gif/jtcc-group-e/commit/ec7d15958884508fdea2a82bb5e38b8e2da6112d)。以前の SQL・protocol テスト成功は実 DB や 40 人の検証ではない。 | `src/realtime/`、`supabase/` などの草案は未コミット・未レビュー。 | `feat/shared-opening`、T01 固有コミットなし。 |
| T02 | 確認用公開先と本番公開の境界を GitHub 実設定・成果物で確認。 | [確認記録](PREVIEW.md)。確認用 Pages は専用リポジトリ、成功済み成果物45ファイルに内部素材 ID・秘密の検査パターンなし。本番は手動実行のみ。 | 将来の画像追加・環境変数変更は出典と成果物を都度検査。利用者評価は未実施。 | `docs/t02-preview-boundary`、この PR の Git 履歴を参照。 |
| T03 | 40人共有オープニングの参加・抽選・再接続・ホスト交代・結果公開の契約を固定し、mock と real に共通 interface を設定。 | [操作と失敗応答の契約](SHARED_OPENING_CONTRACT.md)、型検査と PGlite/模擬 transport の40席・冪等性・遅延公開テストを確認。 | 実 Supabase への SQL 適用、40端末接続、UI 接続、対象利用者評価は未実施。元の `feat/shared-opening` 未コミット差分は保全。 | `feat/t03-shared-contract`、この PR の Git 履歴を参照。 |
| T04 | 現行 Figma と内部素材の所在を確認し、旧画面を履歴に整理。 | [Town v2 `134:2`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=134-2) の構造とスマホ画面を確認。[Guide `170:2`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=170-2) を作成。 | 現行の主要画面は AI 視覚レビューで再作業判定。内部素材の原本は GitHub に置かない。 | Figma 作業、`feat/shared-opening` に記録。固有コミットなし。 |
| T05 | 体験仕様を定義し、Figma Guide に判断材料を記録。 | [T05 カード `172:2`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=172-2) と 390×844 画面の AI レビュー。Town 5/12、Friend 7/12、Spin 5/10、Shelf 6/12 で再作業。 | `docs/EXPERIENCE_SPEC.md` はこの時点で未コミット。対象ユーザーの観察なし。T07–T11 で画面を見直す。 | `feat/shared-opening`、固有コミットなし。 |
| T06 | 44 変数、文字スタイル 5 種、Button・Badge・Navigation・Sheet を Figma に作成。 | [基礎ガイド `178:15`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=178-15)、[部品 `179:15`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=179-15)。Button 6 状態、48px、全 53 塗りの変数参照、コントラストを確認。部品に限る AI 視覚レビューは該当 4/4。 | 新しい緑の操作トークンはアプリ CSS に未反映（T24）。組み立て画面と対象ユーザーの評価は未実施。 | Figma 作業、`feat/shared-opening` に記録。固有コミットなし。 |
| T07 | Town Home v3を保持し、同じページの専用領域にHome・4W地図・開始・読み込み・動きを抑えた状態を作成。 | [Home `187:485`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=187-485)、[最終固定画像 `197:2338`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=197-2338)。1560×1560、48px標識、スキップと主ボタン計8個の遷移設定を確認。AI視覚レビュー5/12→10/12、[詳細](design-reviews/T07.md)。 | 実装・ブラウザ再生・対象ユーザー評価は未実施。所有と感情は各1/2。内部素材は公開不可。T11で統合・採用を判断。 | `docs/t07-town-progress`、このPRのGit履歴を参照。 |
| T08 | ガチャ一覧から詳細・9種の確率・支払い確認・3回転・3段階の開封・結果まで、390×844の13画面を専用領域に設計。売り切れとコイン不足も作成。 | [Catalog 204:2341](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=204-2341)、[確率 204:2411](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=204-2411)、[結果 204:2666](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=204-2666)、[Figma内の固定比較画像 202:2338](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=202-2338)。24件の遷移を設定値で確認。AI視覚レビュー10/12、[詳細](design-reviews/T08.md)。 | 実装・ブラウザ再生・対象ユーザー評価は未実施。500コインと9種は未マージの共有オープニング草案に合わせた設計値。写真は内部検討専用。T09で棚への接続を設計し、T11で統合・採用を判断。 | docs/t08-gacha-progress、このPRのGit履歴を参照。 |
| T09 | 9固定枠の空・所有済み棚、一覧、商品詳細とお気に入り、友だちからの見え方、友だちの棚・リアクション・不在状態を専用領域に12画面で設計。 | [所有棚 215:2624](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=215-2624)、[友だち棚 215:2969](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=215-2969)、[Figma内の固定比較画像 215:2531](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=215-2531)。所有・未入手を写真と文言で区別し、友だちの持ち物の境界を表示。AI視覚レビュー11/12、[詳細](design-reviews/T09.md)。 | 実装・ブラウザ再生・対象ユーザー評価は未実施。2/9の所有と友だちはデモ例。内部写真は公開不可。招待・共有範囲はT10、統合と採用はT11で判断。 | docs/t09-collection-progress、このPRのGit履歴を参照。 |
| T10 | 40人ルームの招待・待機・抽選/見守り・満席・同時開封・結果・復帰・ホスト交代・終了を390×844の15状態で設計。 | [T10専用領域 227:2702](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=227-2702)、[ロビー 227:2770](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=227-2770)、[結果 228:2833](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=228-2833)。41遷移設定を確認、AI視覚レビュー10/12で内部基準PASS。[詳細](design-reviews/T10.md)。 | 実装・実DB・40端末・320px/文字200%・対象ユーザー評価は未実施。内部商品写真はFigma限定。T11で統合・採用を判断。 | `docs/t10-room-design`、このPRのGit履歴を参照。 |
| T12 | 専用 Supabase プロジェクトの匿名ログインと保存済み制限を確認。 | 匿名ログイン 1 件を実行後サインアウト。Dashboard で 60 件/時/IP の保存状態を確認。管理画面へのアクセスが必要な証拠。 | 実 DB・40 人・負荷テストは未実施。T03 の契約確定後に検証する。 | 外部設定の読み取り、固有コミットなし。 |
| H01 | GitHub で読める進捗記録と、希望時だけ使う引き継ぎ手順を追加。 | このファイル、[引き継ぎ手順](HANDOFF.md)、README・AGENTS からの参照。コミットと push の結果は Git 履歴と作業報告で確認する。 | H01 の文書はアプリの実装・デプロイを変更しない。 | `docs/progress-handoff`、このファイルの Git 履歴を参照。 |

## 未完了と次の候補

残り 32 件: `T11`, `T13`–`T43`。現時点で前提がそろった候補は次のとおりです。ここに載せたことは自動割当ではありません。

| 候補 | 前提 | 次に確認する内容 |
| --- | --- | --- |
| T11 | T07–T10 | Town・ガチャ・コレクション・40人ルームの採用案を統合する。 |
| T13 | T03 | SQL のスキーマ・認可・原子性を本番適用前にレビューする。 |

`T11` と `T13` の前提はそろいました。後続の実装・検証・公開カードは前提完了後に選びます。通常依頼を優先し、引き継ぎは[担当者が明示的に希望した場合](HANDOFF.md)だけ開始します。

## 完了ごとの更新方法

担当タスクが終わったら、同じ PR のブランチでこのファイルの該当行を更新し、**成果・検証結果・Figma node/PR/commit の証拠・残課題・ブランチ・更新時刻・次候補**を記す。Figma だけの仕事も進捗更新用の小さな PR で記録する。最新 `origin/main` を取り込み、競合した場合は両方の成果を確認して行を統合する。`main` への直接 push や force push はしない。

更新をタスクのコミットまたは進捗専用コミットに含めて push し、PR の必須 CI と通常のマージ条件に従う。push できない場合は GitHub 反映済みと書かず、ローカルのブランチ・コミット ID・失敗理由を報告する。秘密鍵、認証情報、内部素材の原本、未検証の合格表現を記録しない。
