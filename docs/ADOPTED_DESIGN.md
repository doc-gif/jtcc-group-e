# ラストピース デザインマスター（T11）

作成日: 2026-09-26。管理先は指定 Figma の [マスターページ `Lastpiece / Master · T11`（`267:8198`）](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8198)。担当者の指示（2026-09-26）により、**正はピンク基調（さくらミルク）**の T07–T10 画面とし、[作業ページ Town v2 `134:2`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=134-2) の最上位にある 390×844 の **45 画面**と、街マップ・ガチャ筐体の **部品 2 点**を複製した。以下の `マスター node` とこの文書の Git commit を実装の基準にする。

- 元の `134:2` は編集を続けられる作業領域で、マスターではない。後続の改訂は `task/<branch>` の領域で行い、採用する時に別 PR でマスターを更新するか新版ページを作る。
- **不採用:** [`Archive / Adopted Snapshot v1 · T11 (rejected: green accent)`（`252:2`）](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=252-2)。前のエージェントが主操作を緑 `#16634D` に塗り替えた版。削除せず履歴として残し、ページ上に不採用の注記を置いた。実装・マスターの元にしない。
- `task/T08`・`task/T09` 内の `Frozen 旧/新 …` の矩形は変更前後の比較証拠で、マスターに含めない。

## 複製で確認したこと

- 45 画面すべて 390×844。T07 5・T08 13・T09 12・T10 15。
- 街マップ `187:28` とガチャ筐体 `203:2338` はページ内ローカル部品なので、マスター側に部品を複製し、複製した画面のインスタンス 10 件（マップ 5、筐体 5）をマスターの部品へ差し替えた。Button・Navigation などの共通部品（`179:19`、`180:15`、Town v2 内）は差し替えずに参照している。
- プロトタイプ遷移 149 件をすべてマスター内の画面へ張り替えた。複製後に元ページを指す遷移は 0 件。T10 再接続（`267:9455`）の操作は最新ロビー（`267:8993`）へ戻る。
- **色の監査（塗り・線 5,370 件）:** 緑アクセント `#16634D` は 0 件。濃い緑の塗りも 0 件。残る緑系は次の淡い色だけで、主操作・数字・強調文字はワインローズのピンクで統一されている。
  - T07 の街マップ・木・植栽のイラスト（`#93B9A1` など）。
  - 淡いミント `#E3F1E7`: 下部タブの選択中の背景（T07–T09 の 19 画面）、デモコインの札、T10 の舞台・注意書きの背景（T10 は 91 件）。
  - T08 筐体・T10 アバターの淡い緑のイラスト。
- 淡いミントは担当者が正とした TASK7・8・9 にも含まれるため、今回は変更していない。「さくらミルク」（`src/index.css`）にはない色なので、Web 実装時に残すかピンクへ寄せるかは未決（[PRODUCT.md](PRODUCT.md) の未決事項）。

Figma の複製は**視覚と状態の参照**であり、現行 Web の実装済み状態を示さない。内部の商品・キャラクター写真を含むため、画面画像は公開リポジトリ・PR に置かない（Figma 内だけで参照する）。今回の環境からは Figma の画像 URL を取得できず、内部保存画像と SHA-256 一覧は作成していない。

## 実装画面と状態

リンクはマスターページ内の node。`元 node` は Town v2 の出典。各行は実装時に照合する画面または状態で、現行 Web に実装済みという意味ではない。

| 群 | 画面・状態 / 表示条件 | 元 node | マスター node |
| --- | --- | --- | --- |
| T07 | 街ホーム / 探索、棚 2/9 はデモ例 | `187:485` | [`267:8203`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8203) |
| T07 | 導入 0–1.2 秒 / スキップ可能 | `190:499` | [`267:8224`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8224) |
| T07 | 導入 1.2–3 秒 / スキップ可能 | `190:967` | [`267:8234`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8234) |
| T07 | 読込中 / 状態を文字でも示す | `190:1435` | [`267:8244`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8244) |
| T07 | 動きを抑える設定 / 導入を短縮 | `190:1903` | [`267:8254`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8254) |
| T07 | 街マップ（部品）/ ドラッグ・焦点移動の参照、1560×1560 | `187:28` | [`267:10063`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-10063) |
| T08 | ガチャ一覧 / 商品選択 | `204:2341` | [`267:8266`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8266) |
| T08 | 商品詳細 / 商品・参考価格・初期参考確率は説明例 | `204:2372` | [`267:8279`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8279) |
| T08 | 確率一覧 / 当時の在庫で再計算する実装条件 | `204:2411` | [`267:8299`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8299) |
| T08 | 回す前 / 金額・取消・確定を区別 | `204:2465` | [`267:8335`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8335) |
| T08 | ハンドル 1 回転目 / 代替タップあり | `204:2516` | [`267:8348`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8348) |
| T08 | ハンドル 2 回転目 / 代替タップあり | `204:2549` | [`267:8361`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8361) |
| T08 | ハンドル 3 回転目 / 代替タップあり | `204:2582` | [`267:8374`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8374) |
| T08 | カプセル開封 1 / 動き低減時も進行 | `204:2615` | [`267:8387`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8387) |
| T08 | カプセル開封 2 / 動き低減時も進行 | `204:2632` | [`267:8404`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8404) |
| T08 | カプセル開封 3 / 動き低減時も進行 | `204:2649` | [`267:8421`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8421) |
| T08 | 結果例 / 確定した自己結果のみ表示 | `204:2666` | [`267:8438`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8438) |
| T08 | 売り切れ / 回す操作を止める | `204:2680` | [`267:8450`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8450) |
| T08 | コイン不足 / 支払い不可を説明 | `204:2729` | [`267:8461`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8461) |
| T08 | ガチャ筐体（部品）/ 視覚のみ | `203:2338` | [`267:10520`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-10520) |
| T09 | 自分の棚・空 / 未入手の枠と次の操作 | `215:2532` | [`267:8476`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8476) |
| T09 | 自分の棚・2/9 所有 / 数字はデモ例 | `215:2624` | [`267:8550`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8550) |
| T09 | 自分の所有品一覧 / 所有記録のみ | `215:2714` | [`267:8623`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8623) |
| T09 | 自分の品の詳細 / 所有者を明示 | `215:2777` | [`267:8668`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8668) |
| T09 | 自分の品・お気に入り済み / 取消可能 | `215:2808` | [`267:8681`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8681) |
| T09 | 自分の棚・共有前プレビュー / 公開範囲を確認 | `215:2839` | [`267:8694`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8694) |
| T09 | フレンド入口 / 友だちはデモ例 | `215:2929` | [`267:8766`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8766) |
| T09 | ゆいの棚 / 閲覧先が自分の棚でないと示す | `215:2969` | [`267:8786`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8786) |
| T09 | ゆいの品・詳細 / 他人の所有物として表示 | `215:3059` | [`267:8858`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8858) |
| T09 | ゆいの品・反応済み / 二重送信を避ける | `215:3090` | [`267:8871`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8871) |
| T09 | フレンドなし / 空状態から戻れる | `215:3121` | [`267:8884`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8884) |
| T09 | 友だちの棚を見られない / 理由と戻り先 | `215:3154` | [`267:8899`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8899) |
| T10 | 招待 / リンクを知る人だけ参加 | `227:2705` | [`267:8917`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8917) |
| T10 | ロビー / 40席・オンライン・準備の区別 | `227:2770` | [`267:8993`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8993) |
| T10 | 自分が準備完了 / 取消可能 | `227:2835` | [`267:9069`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-9069) |
| T10 | 満席 / 新規参加を拒否、既存 ID の復帰は許す | `227:2900` | [`267:9144`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-9144) |
| T10 | カウントダウン / `serverTime` と `startsAt` に同期 | `228:2706` | [`267:9220`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-9220) |
| T10 | 同時開封 / `startsAt` まで結果・賞品別在庫を隠す | `228:2771` | [`267:9299`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-9299) |
| T10 | 自分の結果 / 保存済み自己結果が公開された後 | `228:2833` | [`267:9379`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-9379) |
| T10 | 再接続中 / まず最新ロビーへ復帰 | `228:2895` | [`267:9455`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-9455) |
| T10 | 復帰後の結果回収 / 開封済み `myResults` がある場合のみ | `228:2960` | [`267:9530`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-9530) |
| T10 | ホスト不在 / 45秒はサーバーで判定 | `228:3022` | [`267:9603`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-9603) |
| T10 | ホスト交代 / サーバーが先着1人を確定 | `228:3087` | [`267:9678`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-9678) |
| T10 | ルーム期限切れ / 再参加できない説明 | `228:3152` | [`267:9754`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-9754) |
| T10 | 見守り参加 / 抽選・請求の対象外 | `237:2714` | [`267:9830`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-9830) |
| T10 | みんなの結果 / `startsAt` 後の保存済み結果だけ | `238:2775` | [`267:9906`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-9906) |
| T10 | ホスト開始 / オンライン準備完了者がホスト以外に1人以上 | `238:2845` | [`267:9987`](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-9987) |

## 実装時の境界

- 配色はピンク基調の「さくらミルク」。主操作はワインローズの塗り、補助操作は白地にピンクの枠。見出し、戻る位置、免責文言「提案モック・公式サービスではありません」を群をまたいで揃える。`design-system/tokens.css` と `figma-manifest.json` は JTCC App 初版の緑系のままで、ラストピースのピンク系トークンへの整理は後続タスク（T24 以降）。
- T08/T09 の 500 コイン・9 種・棚 2/9・友だち・商品写真は説明用。T10 の 40 席はホスト込み。現行 Web の端末内 4 人デモと混同しない。
- T03 の [共有契約](SHARED_OPENING_CONTRACT.md)を真実の状態とする。結果は `startsAt` 前は全員非公開。公開後は保存済みの同じ結果を返す。見守り、満席復帰、ホスト交代、二重請求防止はサーバー判定。Figma の時間遷移は説明用で、実装タイマーの根拠にしない。
- 再接続の画面操作は最新ロビーへ戻す。開封後の自分の結果がサーバーの `myResults` にあるときだけ結果回収へ遷移する。「みんなの結果を見る」は結果公開後にだけ出す。
- 商品・キャラクター参照写真は内部 Figma のみに置く。公開コード、PR、プレビュー、Release に複製しない。権利者との関係、商品在庫、価格、当選保証、決済や発送を実サービスの事実として書かない。
- 実装時は 320px、文字200%、キーボード、Reduce Motion、実機セーフエリア、画面の待機・空・失敗・復帰を別途検証する。今回のマスター作成はその検証の代わりではない。

[T11 統合レビュー](design-reviews/T11.md)に判断と未確認事項を記録する。
