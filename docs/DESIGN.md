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
| [90 Screens](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=72-10) | 今後の業務画面と状態を管理 |
| [320px 幅の部品確認](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=80-2) | 長文・エラー説明・折返しのインスタンス見本 |

## 初版の範囲

2026-09-25、ユーザーが「現在のアプリの緑系を維持」を選択。アクセント `#16634d`、背景 `#f5f7f5`、本文 `#172324` を継承する。ピッチ資料のコーラル・ラベンダーとは別の用途として管理する。

- 4コレクション・57変数: Primitives 12、Color 16、Layout 17、Typography 12。各コレクション1モード。Color は Light。
- 文字スタイル: Display 34/44、Title 24/34、Heading 20/30、Body 17/30、Label 17/24、Caption 14/22（サイズ/行高、px）。
- 影: `JTCC/Shadow/Card`。角丸: control 12、card 20、pill 999px。
- Button: Primary / Secondary × Default / Hover / Focus / Pressed / Disabled / Loading = 12。
- Input: 5状態。Label、Value、Helper、Show helper、Filled value、Invalid value、Error message、Disabled reason のプロパティ。エラー説明は非表示にしない。
- Card: 2種類。Title、Description、Show description。Card 自体は操作要素にしない。

これらは **Figma の設計部品**。React の共通 Button/Input/Card、業務画面、操作を実行するプロトタイプ、Dark モードはまだ実装していない。変数の WEB code syntax は CSS の実在する定義に対応するが、Code Connect の React マッピングは実装ができた時点で設定する。ファイル内の Assets で使うローカル部品であり、チーム向けの公開ライブラリ配信は行っていない。

## コードとの対応

- [`../design-system/tokens.css`](../design-system/tokens.css): 57変数と影の参照用 CSS。現行アプリはまだ import していない。次の UI 実装 PR で必要な箇所へ適用し、実画面を検証する。
- [`../design-system/figma-manifest.json`](../design-system/figma-manifest.json): ファイル、ページ、部品、変数、文字スタイル、コントラスト検証の初版スナップショット。
- CSS 名は `var(--jtcc-<Figma の名前をハイフン区切り>)`。色の semantic layer は primitive を参照する。通常は用途別の色を使う。
- Figma の文字寸法は px、CSS の文字寸法は16pxを基準に rem へ換算。ブラウザの文字拡大を維持する。本文は17pxが基準。
- Figma は Noto Sans JP。現行 Web は Inter と OS の日本語フォントのスタックで、同一の字形・改行は保証しない。日本語フォントを配信するかは実装時に決め、字幅と長文を実画面で比較する。
- 既存の雛形は数値を直書きしている。色とカードの形を継承したが、全スタイルの自動同期・移行は完了扱いにしない。

## 作業者・エージェントの手順

1. [開発手順](DEVELOPMENT.md)に従い最新 main から専用 worktree / ブランチを作る。他の未完了 PR を読み、Draft PR に担当ファイル、Figma の対象 node、共通部品の変更有無を書く。
2. `90 Screens` に `task/<branch>` の作業領域を用意する。画面名は `<screen>/<state>`。担当者、目的、関連 PR、Draft / Ready / Implemented を明記する。同時作業の領域は分ける。
3. 320pxと390pxを基準に、必要な通常・待機・空・失敗・完了を設計する。JTCC 変数・文字スタイル・部品インスタンスを使う。共通部品本体や変数は、担当が重複していないことを確認してから変える。既存ページの削除や全体置換をしない。
4. Ready にした画面の node URL、変更前後の画像、各状態の意図を PR に添える。仕様が未確定なら Draft として明記し、実装済み画面と区別する。
5. 実装は Figma と照合し、[UI/UX 基準](UI_UX_STANDARDS.md)の全10項目をレビューする。GAME-01 の evidence に node URL と比較した画面・状態を含める。Figma の見本だけで Web のアクセシビリティ検証を済ませない。
6. トークン変更時は CSS と manifest を更新し、値・名前・alias・色の組合せを確認する。変更した node ID と変更理由を PR に残す。`pnpm verify` に成功してから PR を Ready にする。
7. マージ後、画面の実装済み表示に PR と採用 commit SHA を追記する。公開は別途明示指示がある場合のみ [公開手順](DEPLOYMENT.md)を実行する。

Figma へのアクセスに失敗した場合は、参照できた画像・仕様と未確認の箇所を報告する。未確認を合格にしない。共通変数の同時編集は Figma 内で自動的に排他されないため、担当範囲を調整する。

## マージ条件との関係

既存の `UI/UX gate` と `Quality gate` を維持する。Figma との照合は GAME-01 等のレビュー証拠に記載する。CI は Figma のライブ状態を取得せず、デザインの意味的な一致を自動判定しない。現行のレビュー書式検証だけでは Figma URL の有効性も保証されないため、作業者がリンクと実画面を確認する。

Figma だけの変更を Web 側の UI 変更として偽装してレビュー digest を更新しない。Web のソースを変える際には、変更後の実画面に対する新しいレビューが必要になる。

## 過去版を振り返る

Figma の node URL は編集後も同じ URL になり得る。各採用 PR に画像と node ID を残し、デザインのトークン・manifest は Git の commit で固定する。デザインの大きな改訂では旧版を残し、担当範囲を決めて新版を作る。

公開時には Release に採用 PR とデザイン記録の Git commit permalink を含める。実際に触れる過去 Web アプリは `/versions/vX.Y.Z/` と Release の ZIP で保持する。Figma のライブリンクだけを過去版保存の代わりにしない。

## 初版の確認記録

色の WCAG 相対輝度計算: 本文/背景14.98:1、補助文/背景5.87:1、白/主操作7.18:1、エラー/白7.03:1、入力枠/白4.05:1。本文・操作ラベルは4.5:1、入力境界は3:1以上。`border/subtle` は非操作の区切り専用で、入力境界には使わない。

3部品19バリアントの塗り・線は変数へ結合し、参照切れ0件。Button は48px以上、Input の Control は48px以上。320px幅・左右20pxの余白で長いボタン文言、カード見出し、エラー説明が折り返されることを Figma のインスタンスで確認した。これは Web のキーボード・文字200%・実機セーフエリアの確認を代替しない。
