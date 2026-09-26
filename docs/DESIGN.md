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
| [Lastpiece / Master · T11](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8198) | **ラストピースの画面の正**。ピンク基調の45画面と部品2点。実装対応は [node/状態一覧](ADOPTED_DESIGN.md) |
| [Archive / Adopted Snapshot v1 · T11 (rejected: green accent)](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=252-2) | 不採用。主操作を緑に塗り替えた版。元にしない |
| [320px 幅の部品確認](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=80-2) | 長文・エラー説明・折返しのインスタンス見本 |

## トークンの範囲

ラストピースの画面は、2026-09-26 の担当者の指示によりピンク基調の「さくらミルク」を正とし、緑の主操作は採用しない（[デザインマスター](ADOPTED_DESIGN.md)）。`design-system/` はマスターが参照する Figma 変数の記録で、2026-09-26 に v0.2 としてピンク系へ整理した。ピッチ資料のコーラル・ラベンダーとは別の用途として管理する。

- 変数: `Lastpiece v2 / Primitives`（`177:15`、14変数）と `Lastpiece v2 / Tokens`（`177:16`、30変数、mode Light）。マスター `267:8198` の変数結合はすべてこの2つ。
- 部品: `LP v2 / Button`（`179:34`、説明 `179:19`）Primary / Outline × Default / Focus / Disabled = 6、高さ48px。`LP v2 / Navigation Item`（`180:27`）Selected / Default / Focus、`LP v2 / Bottom Navigation`（`180:28`）。本体は Town v2 `134:2` にあり、マスターが live 参照する。
- 文字スタイル: `Lastpiece v2/` の Display 32/44（Shippori Mincho Bold）、Title 24/32、Body 17/29、Label 16/24、Caption 14/22（サイズ/行高、px。Noto Sans JP）。
- Figma に残る緑: `color/action/pressed` → `primitive/forest-deep` `#0e4b39`。マスターと部品は参照していないため、`tokens.css` に定義しない。Figma 変数はマスターの見た目に直結するので、この整理では変更していない。
- `primitive/forest` は名前だけ旧版の名残で、値はピンク `#be6482`。

これらは **Figma の設計部品と参照用トークン**。React の共通部品、Dark モード、Code Connect はまだない。ファイル内のローカル部品で、公開ライブラリ配信は行っていない。

### 初版（JTCC App・緑系、履歴）

2026-09-25 に JTCC App の雛形として「現在のアプリの緑系を維持」を選び、アクセント `#16634d`、背景 `#f5f7f5`、本文 `#172324` で作った。4コレクション57変数（`JTCC / Primitives` ほか）、`JTCC/Button`・`Input`・`Card` の3部品。**ラストピースには使わない。** 記録は Git の `fb93ffa:design-system/figma-manifest.json` に残す。Figma 上ではこのコレクションに後から変数が追加され、`primitive/green/700`・`800` の値もピンクに変わっているため、初版の記録と一致しない。

## コードとの対応

- [`../design-system/tokens.css`](../design-system/tokens.css): `Lastpiece v2` の変数（緑の `action/pressed` を除く）と、文字スタイル・Button のフォーカスを CSS にした参照用ファイル。現行アプリはまだ import していない。次の UI 実装 PR で必要な箇所へ適用し、実画面を検証する。
- [`../design-system/figma-manifest.json`](../design-system/figma-manifest.json): コレクション、変数の値・alias・マスターでの結合件数、部品、文字スタイル、コントラスト、現行 Web との差、初版の履歴。
- CSS 名は Figma 変数の WEB code syntax と同じ。`--bg`・`--surface`・`--soft`・`--main`・`--deep` は `src/index.css` と同名・同値。その他は `--lp-v2-*`。初版の `--jtcc-*` は使わない。`--lp-v2-type-*` と `--lp-v2-focus-ring` は Figma 変数がないため CSS 側で名前を付けた。
- Figma の文字寸法は px、CSS は16px基準の rem。ブラウザの文字拡大を維持する。Web は Noto Sans JP を先頭にした OS フォントのスタックで、同じ字形・改行は保証しない。
- **現行 Web（`src/index.css`）との差:** 本文 Figma `#172324` / Web `#5C4A50`、補助文 `#52615a` / `#7D646C`、主操作 `#be6482` / `#A94A68`、フォーカス `#be6482` / `#A94A68`、区切り線 `#d8c9cf` / `#F5DDE4`。無効の塗り `#d4dcd7` とタブ選択 `#e3f1e7` は Web にない。Web 実装時にどちらへ揃えるかを決める（下の確認記録）。
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

Figma の node URL は編集後も同じ URL になり得る。各採用 PR に画像と node ID を残し、デザインのトークン・manifest は Git の commit で固定する。T11 ではマスターページへ複製し、[45画面と部品の node 対応](ADOPTED_DESIGN.md)を Git commit で固定した。デザインの大きな改訂では旧版を残し、担当範囲を決めて新版を作る。

公開時には Release に採用 PR とデザイン記録の Git commit permalink を含める。実際に触れる過去 Web アプリは `/versions/vX.Y.Z/` と Release の ZIP で保持する。Figma のライブリンクだけを過去版保存の代わりにしない。

## トークンの確認記録

2026-09-26、Figma を読み取り専用で確認した（変数・部品は変更していない）。WCAG 相対輝度、小数第3位切り捨て。本文・操作ラベルは4.5:1、非文字の境界は3:1以上。

- 合格: 本文/背景15.49:1、本文/淡いピンク14.35:1、補助文/背景6.27:1、補助文/白6.52:1、補助文/淡いピンク5.81:1、ワイン `#a94a68`/白5.43:1、フォーカス線/白3.93:1。
- **不足:** 白/主操作 `#be6482` 3.93:1（Button Primary の16px Bold ラベル）、主操作色の文字/白3.93:1（Outline のラベル）、主操作色の文字/背景3.78:1、主操作色/タブ選択 `#e3f1e7` 3.37:1（14pxラベル）。マスターの見た目のままでは操作ラベルが基準に届かない。現行 Web の主操作 `#A94A68` は白文字5.43:1で合格。Figma を直すか Web の値を正とするかは未決。
- `border/default` `#d8c9cf`/白1.59:1 は区切り・無効枠だけに使い、操作境界に使わない。

### 初版の確認記録（履歴）

初版の緑系では、本文/背景14.98:1、補助文/背景5.87:1、白/主操作7.18:1、エラー/白7.03:1、入力枠/白4.05:1。3部品19バリアントの塗り・線は変数へ結合し、参照切れ0件。320px幅での折り返しを Figma のインスタンスで確認した。これは Web のキーボード・文字200%・実機セーフエリアの確認を代替しない。
