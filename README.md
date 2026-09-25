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
- [GitHub Pages の公開・タグ・過去版](docs/DEPLOYMENT.md)

公開は明示的に指示した時だけ行います。公開済みの各版は `/versions/vX.Y.Z/` と Release の ZIP に保存します。

## 構成

- `src/App.tsx`: 現時点の仮画面
- `src/index.css`: 共通スタイルとモバイル基準
- `src/App.css`: 画面固有のスタイル
- `docs/PRODUCT.md`: 仕様と未決事項
- `AGENTS.md`: AI エージェント向け作業指針

機能が決まったら、画面、共通 UI、データ処理をそれぞれのディレクトリに分けてください。現段階では先回りして抽象化しません。
