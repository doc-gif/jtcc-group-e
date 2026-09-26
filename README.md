# JTCC Group E

スマートフォン向け Web アプリ「**ラストピース**」です。ラストピースは開発中のサービスで、商品・価格・在庫は例です。即完売で買えなかった限定グッズを、確率を公開したガチャで友達といっしょに回す体験を、1台のスマホで試せます。友達の動きはデモとして画面の中で再現しています。

仕様・決定事項・未決事項は [`docs/PRODUCT.md`](docs/PRODUCT.md)、AI 作業手順は [`AGENTS.md`](AGENTS.md) に記録します。

## 必要な環境

- Node.js 24
- pnpm 11.19.0（packageManager に固定）

## 開始

```bash
pnpm install
pnpm dev
```

表示されたローカル URL をブラウザで開いてください。スマートフォンのブラウザから同じネットワーク上で確認する場合は `pnpm dev --host 0.0.0.0` を使います。公開ネットワークで起動しないでください。

## 検証

```bash
pnpm exec playwright install chromium webkit
pnpm verify
```

`verify` は型・静的解析・単体テスト・ビルド・ブラウザテスト・UI/UX 基準を実行します。GitHub の PR は `Quality gate` と `UI/UX gate` を必須とし、成功後に Bot が承認・マージします。UI の変更には新しいレビュー記録が必要です。

## 作業・公開の手順書

- [PR と worktree による開発](docs/DEVELOPMENT.md)
- [開発進捗と次の候補](docs/STATUS.md) ／ [希望時の引き継ぎ](docs/HANDOFF.md)
- [本番と分けた自動プレビュー](docs/PREVIEW.md)
- [高速化・任意の Copilot レビュー・QR](docs/FAST_FEEDBACK.md)
- [テストの自動分割と規模拡大への対応](docs/CI_SCALING.md)
- [テストの設計と回帰防止](docs/TESTING.md)
- [Apple HIG とゲーム UX のマージ基準](docs/UI_UX_STANDARDS.md)
- [Figma とデザインシステムの運用](docs/DESIGN.md)
- [GitHub Pages の公開・タグ・過去版](docs/DEPLOYMENT.md)

通常の修正はテスト・PR の Ready 化・マージ完了・確認用 URL の案内まで進めます。プレビューは Preview build 成功後に先行配布します。本番公開は明示的に指示した時だけ行います。本番の各版は `/versions/vX.Y.Z/` と Release の ZIP に保存します。

## GitHub の運用リンク

- [PR 一覧](https://github.com/doc-gif/jtcc-group-e/pulls)
- [必須 CI](https://github.com/doc-gif/jtcc-group-e/actions/workflows/ci.yml)
- [自動承認・マージ](https://github.com/doc-gif/jtcc-group-e/actions/workflows/auto-merge.yml)
- [公開を実行する](https://github.com/doc-gif/jtcc-group-e/actions/workflows/release-pages.yml)
- [公開済みのバージョン](https://github.com/doc-gif/jtcc-group-e/releases)

本番の公開状況は上記 Release 一覧で確認できます。運用開始時の設定は [導入 PR #1](https://github.com/doc-gif/jtcc-group-e/pull/1) で追跡できます。

## 構成

デザインは[指定 Figma](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=72-2)で管理します。ラストピースの画面の正は、ピンク基調「さくらミルク」の [デザインマスター](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=267-8198)です（T07–T10 の64画面、[node と状態の一覧](docs/ADOPTED_DESIGN.md)）。Web はマスターの画面（街・ガチャの流れ・棚とフレンド・T10 のみんなの開封ルーム）を実装済みです。ルームは、本番・確認用プレビュー・CI のビルドでは専用の Supabase（`lastpiece-pitch`）につながり、別々のスマホで同じルームに入れます（F15、[記録](docs/MULTI_DEVICE.md)）。開発サーバー・単体テスト・E2E は Supabase を使わず、同じブラウザのタブの間だけで動く端末内デモになります（画面に「デモ」と明記）。コイン・商品・在庫・確率は説明用の架空データです。`design-system/` のトークンは、マスターが参照するピンク系の Figma 変数に合わせています（アプリへの適用はまだ。現行 Web との色の差は [docs/DESIGN.md](docs/DESIGN.md)）。

- `src/domain/`: 画面から切り離した純粋な関数とデータ（抽選・確率・一律20%の交換・保存・演出の台本・架空カタログ）。Vitest で検証
- `src/app/`: ルーター（ハッシュ）、状態の置き場所、ルームのデモ再現、声・音・振動
- `src/screens/`: 画面（ホーム・はじめて・詳細・ルーム・回す・当てたもの・いっしょに・マイページ）
- `src/components/`: 共通の部品（上部・タブ・シート・残りバー・筐体・背景・ピピ・粒の演出）
- `src/copy/pipi.ts`: 案内役ピピのセリフ（実在キャラクターの名前を入れない）
- `src/index.css`: 配色「さくらミルク」のトークンとモバイル基準／`src/App.css`: 画面のスタイル
- `public/assets/`: オリジナル生成素材（ロゴ・作品・種類・UIアイコン・商品イラスト・バナー）
- `scripts/governance.test.mjs`: 法務・ブランドのきまりの自動チェック
- `docs/PRODUCT.md`: 仕様と未決事項
- `AGENTS.md`: AI エージェント向け作業指針
- `design-system/`: Figma の node ID、変数、実装に利用できる CSS トークンの記録

演出の確認には、マイページの「デモ操作」で「次の1回を目玉確定にする」を ON にしてから回してください。

## 内部検討用の素材

[サンリオ素材ライブラリ（Figma）](https://www.figma.com/design/MYYMoB2wL7LvA2oXZ2gxpT?node-id=0-1) にキャラクター・世界観イラストと実物グッズ写真を整理しています。AI の探し方、ID、出典・内部限定の扱いは [素材参照ガイド](docs/ASSET_LIBRARY.md)。公開アプリへコピーする許可ではありません。
