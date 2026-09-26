# Figma とデザインシステム

アプリの画面・状態・共通部品は、次の Figma ファイルで管理する。既存の `Page 1` と `経営レビュー案（承認前）` はピッチ資料として保持する。提案中の事業仮説から業務要件を自動的に確定しない。

## 管理先

| ページ | 用途 |
| --- | --- |
| [00 Cover](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=72-2) | システムの入口・設計原則 |
| [01 Getting Started](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=72-3) | 変更・レビュー・履歴のルール |
| [02 Foundations](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=72-4) | 色・文字・余白・形・影 |
| [10 Button](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=76-32) | Primary / Secondary × 6状態 |
| [11 Input](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=78-2) | Default / Focus / Filled / Error / Disabled |
| [12 Card](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=79-2) | Standard / Subtle |
| [90 Screens（旧版）](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=72-10) | 初期画面の履歴 |
| [Lastpiece / Town v2（作業領域）](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=134-2) | T07–T10 の編集元。`task/<branch>` ごとの領域 |
| [Lastpiece / Master · T11](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8198) | **ラストピースの画面の正**。ピンク基調の64画面と部品2点。実装対応は [node/状態一覧](ADOPTED_DESIGN.md) |
| [Archive / Adopted Snapshot v1 · T11 (rejected: green accent)](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=252-2) | 不採用。主操作を緑に塗り替えた版。元にしない |
| [320px 幅の部品確認](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=80-2) | 長文・エラー説明・折返しのインスタンス見本 |

## トークンの範囲

ラストピースの画面は、2026-09-26 の担当者の指示によりピンク基調の「さくらミルク」を正とし、緑の主操作は採用しない（[デザインマスター](ADOPTED_DESIGN.md)）。`design-system/` はマスターが参照する Figma 変数の記録で、2026-09-26 に v0.2 としてピンク系へ整理した。ピッチ資料のコーラル・ラベンダーとは別の用途として管理する。

- 変数: `Lastpiece v2 / Primitives`（`177:15`、14変数）、`Lastpiece v2 / Tokens`（`177:16`、30変数、mode Light）、`Lastpiece v2 / Sanrio World (F14)`（`323:3784`、11色、2026-09-26 の F14 で採用）。マスター `267:8198` の変数結合はすべてこの3つ。F14 の色は空色・クリーム・ラベンダーの地とリボン・キャラクターの色で、文字に使えるのは `sanrio/kuromi-ink` と `sanrio/cocoa` だけ。
- 世界観（F14、2026-09-26）: 画面の見出しは Zen Maru Gothic Bold（文字スタイルなし）。キャラクターの絵と © 表記の札は内部検討用で Figma だけに置き、アプリ・公開リポジトリ・プレビューに入れない（[ADOPTED_DESIGN.md の実装時の境界](ADOPTED_DESIGN.md#実装時の境界)）。
- 部品: `LP v2 / Button`（`179:34`、説明 `179:19`）Primary / Outline × Default / Focus / Disabled = 6、高さ48px。`LP v2 / Navigation Item`（`180:27`）Selected / Default / Focus、`LP v2 / Bottom Navigation`（`180:28`）。本体は Town v2 `134:2` にあり、マスターが live 参照する。
- 文字スタイル: `Lastpiece v2/` の Display 32/44（Shippori Mincho Bold）、Title 24/32、Body 17/29、Label 16/24、**Button 19/28（Bold）**、Caption 14/22（サイズ/行高、px。Noto Sans JP）の6種。Button は 2026-09-26 に追加し、Button 部品の6状態に適用した（マスター内 90 か所）。
- 色の使い分け（担当者の判断、2026-09-26。Figma を先に直し、F06 で Web に反映）: `color/action/primary` `#be6482` は主ボタンの塗りと、枠ボタンの文字・枠だけに使う。ボタンの文字は 19px 太字で WCAG の「大きい文字」（18.66px 以上の太字）に当たるので、白/`#be6482` の 3.94:1 が 3:1 の基準を満たす。基準は下げていない。19px 太字より小さいピンクの文字はすべて `color/accent/wine` `#a94a68`。下のタブの選択中はミント `color/nav/selected` `#e3f1e7` の地にワインの文字。
- Figma に残る緑: `color/action/pressed` → `primitive/forest-deep` `#0e4b39`。マスターと部品は参照していないため、`tokens.css` に定義しない。Figma 変数はマスターの見た目に直結するので、この整理では変更していない。
- `primitive/forest` は名前だけ旧版の名残で、値はピンク `#be6482`。

これらは **Figma の設計部品と参照用トークン**。React の共通部品、Dark モード、Code Connect はまだない。ファイル内のローカル部品で、公開ライブラリ配信は行っていない。

### 初版（JTCC App・緑系、履歴）

2026-09-25 に JTCC App の雛形として「現在のアプリの緑系を維持」を選び、アクセント `#16634d`、背景 `#f5f7f5`、本文 `#172324` で作った。4コレクション57変数（`JTCC / Primitives` ほか）、`JTCC/Button`・`Input`・`Card` の3部品。**ラストピースには使わない。** 記録は Git の `fb93ffa:design-system/figma-manifest.json` に残す。Figma 上ではこのコレクションに後から変数が追加され、`primitive/green/700`・`800` の値もピンクに変わっているため、初版の記録と一致しない。

## コードとの対応

- [`../design-system/tokens.css`](../design-system/tokens.css): `Lastpiece v2` の変数（緑の `action/pressed` を除く）と、文字スタイル・Button のフォーカスを CSS にした参照用ファイル。アプリは import せず、同じ値を `src/index.css` に持つ（下の対応）。
- [`../design-system/figma-manifest.json`](../design-system/figma-manifest.json): コレクション、変数の値・alias・マスターでの結合件数、部品、文字スタイル、コントラスト、現行 Web との差、初版の履歴。
- CSS 名は Figma 変数の WEB code syntax と同じ。`--bg`・`--surface`・`--soft`・`--main`・`--deep` は `src/index.css` と同名・同値。その他は `--lp-v2-*`。初版の `--jtcc-*` は使わない。`--lp-v2-type-*` と `--lp-v2-focus-ring` は Figma 変数がないため CSS 側で名前を付けた。
- Figma の文字寸法は px、CSS は16px基準の rem。ブラウザの文字拡大を維持する。Web は Noto Sans JP を先頭にした OS フォントのスタックで、同じ字形・改行は保証しない。
- **Web（`src/index.css`）との対応（F06、2026-09-26）:** `--text` #172324（text/primary）、`--sub` #52615a（text/secondary・disabled）、`--primary` #be6482（action/primary）、`--deep` #a94a68（accent/wine）、`--mint` #e3f1e7（nav/selected）、`--disabled` #d4dcd7（action/disabled）、`--disabled-line` #d8c9cf（border/default、無効の枠だけ）、`--button-size`/`--button-line` 1.1875rem/1.75rem（Button 19/28）。旧名 `--wine` は見出し用で値は `--text` と同じ（Figma の accent/wine は `--deep`）。
- **残る差:** フォーカス線は Web が `#a94a68` の 3px（Button の Focus の外側リングと同じ色。Figma の `border/focus` は `#be6482`）。区切り線は Web が `--line` #F5DDE4（Figma `#d8c9cf`）。どちらも操作の境界や文字ではなく、コントラスト基準に影響しない。
- Figma の `JTCC / Lastpiece`（`83:18`）は `src/index.css` と同じ値の変数集だが、マスターは参照していない。

## 作業者・エージェントの手順

**順番は Figma が先、アプリが後**（担当者の指示、2026-09-26）。見た目・画面構成・状態を変えるときは、次の 2〜4 で Figma のマスターを直してから 5 でアプリに反映する。実装中に Figma と違う形が必要だと分かったら（アクセシビリティの基準違反を含む）、アプリだけで変えず、Figma の修正案を担当者に確認して先に Figma を直す。修正待ちの差分は PR に「Figma 修正待ち」と書き、完了扱いにしない。

1. [開発手順](DEVELOPMENT.md)に従い最新 main から専用 worktree / ブランチを作る。他の未完了 PR を読み、Draft PR に担当ファイル、Figma の対象 node、共通部品の変更有無を書く。
2. `Lastpiece / Town v2` に `task/<branch>` の作業領域を用意する。マスターページを直接の作業場所にしない。担当者が確認した修正は、マスターの該当画面・変数・部品へ反映し、[ADOPTED_DESIGN.md](ADOPTED_DESIGN.md) の node 対応を同じ PR で更新する。画面名は `<screen>/<state>`。担当者、目的、関連 PR、Draft / Ready / Implemented を明記する。同時作業の領域は分ける。
3. 320pxと390pxを基準に、必要な通常・待機・空・失敗・完了を設計する。`Lastpiece v2` の変数・文字スタイル・マスターと同じ部品インスタンスを使う。共通部品本体や変数は、担当が重複していないことを確認してから変える。既存ページの削除や全体置換をしない。
4. Ready にした画面の node URL、変更前後の画像、各状態の意図を PR に添える。仕様が未確定なら Draft として明記し、実装済み画面と区別する。
5. 実装は Figma と照合し、[UI/UX 基準](UI_UX_STANDARDS.md)の全10項目をレビューする。GAME-01 の evidence に node URL と比較した画面・状態を含める。Figma の見本だけで Web のアクセシビリティ検証を済ませない。
6. トークン変更時は CSS と manifest を更新し、値・名前・alias・色の組合せを確認する。変更した node ID と変更理由を PR に残す。`pnpm verify` に成功してから PR を Ready にする。
7. マージ後、画面の実装済み表示に PR と採用 commit SHA を追記する。公開は別途明示指示がある場合のみ [公開手順](DEPLOYMENT.md)を実行する。

Figma へのアクセスに失敗した場合は、参照できた画像・仕様と未確認の箇所を報告する。未確認を合格にしない。共通変数の同時編集は Figma 内で自動的に排他されないため、担当範囲を調整する。

## マージ条件との関係

既存の `UI/UX gate` と `Quality gate` を維持する。Figma との照合は GAME-01 等のレビュー証拠に記載する。CI は Figma のライブ状態を取得せず、デザインの意味的な一致を自動判定しない。現行のレビュー書式検証だけでは Figma URL の有効性も保証されないため、作業者がリンクと実画面を確認する。

Figma だけの変更を Web 側の UI 変更として偽装してレビュー digest を更新しない。Web のソースを変える際には、変更後の実画面に対する新しいレビューが必要になる。

## 過去版を振り返る

Figma の node URL は編集後も同じ URL になり得る。各採用 PR に画像と node ID を残し、デザインのトークン・manifest は Git の commit で固定する。T11 ではマスターページへ複製し、[64画面と部品の node 対応](ADOPTED_DESIGN.md)を Git commit で固定した。デザインの大きな改訂では旧版を残し、担当範囲を決めて新版を作る。

公開時には Release に採用 PR とデザイン記録の Git commit permalink を含める。実際に触れる過去 Web アプリは `/versions/vX.Y.Z/` と Release の ZIP で保持する。Figma のライブリンクだけを過去版保存の代わりにしない。

## トークンの確認記録

2026-09-26、Figma を読み取り専用で確認した（変数・部品は変更していない）。WCAG 相対輝度、小数第3位切り捨て（主操作と白は 3.936… で、Figma の記載に合わせ 3.94 と書く）。本文・操作ラベルは4.5:1、19px 以上の太字（大きい文字）は3:1、非文字の境界は3:1以上。

- 合格: 本文/背景15.49:1、本文/淡いピンク14.35:1、補助文/背景6.27:1、補助文/白6.52:1、補助文/淡いピンク5.81:1、ワイン `#a94a68`/白5.43:1、フォーカス線（Figma の `border/focus` `#be6482`）/白3.94:1、Web のフォーカス線（ワイン）/白5.43:1。
- F01 時点の不足（白/主操作 3.93:1 の16pxラベルなど）は、2026-09-26 の判断で次のとおり解消した。

| 組合せ | 比 | 基準 | 使う場所 |
| --- | --- | --- | --- |
| 白 / `#be6482` | 3.94:1 | 3:1（19px 太字） | 主ボタン・街の「ガチャのお店」 |
| `#be6482` / 白 | 3.94:1 | 3:1（19px 太字） | 枠ボタン・街の場所名の文字 |
| `#be6482` / 白（枠線） | 3.94:1 | 3:1（非文字） | 枠ボタンの枠 |
| `#be6482` / ミント `#e3f1e7` | 3.37:1 | 3:1（非文字） | 選択中のタブのアイコン |
| ワイン `#a94a68` / 白 | 5.43:1 | 4.5:1 | 小さいピンクの文字、枠ボタン内の小さい文字 |
| ワイン / 背景 `#fff9fa` | 5.22:1 | 4.5:1 | 見出しの補足・リンク |
| ワイン / 淡いピンク `#fdeef2` | 4.83:1 | 4.5:1 | タグ・チップ |
| ワイン / ミント `#e3f1e7` | 4.65:1 | 4.5:1 | 選択中のタブの文字（12〜14px）、コイン札 |
| 白 / ワイン | 5.43:1 | 4.5:1 | 選択中のスイッチ・チェック |
| 本文 `#172324` / ピンクの帯 `#f2a7bc` | 8.46:1 | 4.5:1 | 上部の帯の見出し |
| 補助文 `#52615a` / ミント | 5.59:1 | 4.5:1 | T10 の注意書き（マスター。Web は F05 で実装） |
| 補助文 / 無効の塗り `#d4dcd7` | 4.66:1 | 対象外 | 無効のボタン（読める濃さを確認） |

- 使わない組合せ: `#be6482` の19px未満の文字（白地 3.94:1、背景 3.78:1、淡いピンク 3.50:1、ミント 3.37:1 で4.5:1未満）、ワイン/ピンクの帯 `#f2a7bc` 2.85:1。主ボタンの中に小さい文字（small）を置かない。
- `border/default` `#d8c9cf`/白1.59:1 は区切り・無効枠だけに使い、操作境界に使わない。

### 初版の確認記録（履歴）

初版の緑系では、本文/背景14.98:1、補助文/背景5.87:1、白/主操作7.18:1、エラー/白7.03:1、入力枠/白4.05:1。3部品19バリアントの塗り・線は変数へ結合し、参照切れ0件。320px幅での折り返しを Figma のインスタンスで確認した。これは Web のキーボード・文字200%・実機セーフエリアの確認を代替しない。
