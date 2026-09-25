# JTCC Group E

スマートフォン向け Web アプリの開発基盤です。アプリの具体的な機能は未定です。仕様は [`docs/PRODUCT.md`](docs/PRODUCT.md)、AI 作業手順は [`AGENTS.md`](AGENTS.md) に記録します。

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
- [テストの設計と回帰防止](docs/TESTING.md)
- [Apple HIG とゲーム UX のマージ基準](docs/UI_UX_STANDARDS.md)
- [Figma とデザインシステムの運用](docs/DESIGN.md)
- [GitHub Pages の公開・タグ・過去版](docs/DEPLOYMENT.md)

公開は明示的に指示した時だけ行います。公開済みの各版は `/versions/vX.Y.Z/` と Release の ZIP に保存します。

## GitHub の運用リンク

- [PR 一覧](https://github.com/doc-gif/jtcc-group-e/pulls)
- [必須 CI](https://github.com/doc-gif/jtcc-group-e/actions/workflows/ci.yml)
- [自動承認・マージ](https://github.com/doc-gif/jtcc-group-e/actions/workflows/auto-merge.yml)
- [公開を実行する](https://github.com/doc-gif/jtcc-group-e/actions/workflows/release-pages.yml)
- [公開済みのバージョン](https://github.com/doc-gif/jtcc-group-e/releases)

初回公開はまだ実行していません。運用開始時の設定は [導入 PR #1](https://github.com/doc-gif/jtcc-group-e/pull/1) で追跡できます。

## 構成

デザインは [指定 Figma の JTCC App ページ](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=72-2)で管理します。[画面管理](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=72-10)、[基本ルール](https://www.figma.com/design/yeDF1BwhrxpXI57Daainle?node-id=72-4)、Button・Input・Card の設計部品があります。緑系の初版であり、業務画面と React 共通部品の実装は今後のタスクです。

- `src/App.tsx`: 現時点の仮画面
- `src/index.css`: 共通スタイルとモバイル基準
- `src/App.css`: 画面固有のスタイル
- `docs/PRODUCT.md`: 仕様と未決事項
- `AGENTS.md`: AI エージェント向け作業指針
- `design-system/`: Figma の node ID、変数、実装に利用できる CSS トークンの記録

機能が決まったら、画面、共通 UI、データ処理をそれぞれのディレクトリに分けてください。現段階では先回りして抽象化しません。
