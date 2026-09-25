# JTCC Group E

スマートフォン向け Web アプリの開発基盤です。アプリの具体的な機能は未定です。仕様は [`docs/PRODUCT.md`](docs/PRODUCT.md)、AI 作業手順は [`AGENTS.md`](AGENTS.md) に記録します。

## 必要な環境

- Node.js 20.19 以上、または 22.12 以上
- pnpm

## 開始

```bash
pnpm install
pnpm dev
```

表示されたローカル URL をブラウザで開いてください。スマートフォンのブラウザから同じネットワーク上で確認する場合は `pnpm dev --host 0.0.0.0` を使います。公開ネットワークで起動しないでください。

## 検証

```bash
pnpm check
```

`check` は型チェック、静的解析、プロダクションビルドを順に実行します。CI でも同じコマンドを使います。

## 構成

- `src/App.tsx`: 現時点の仮画面
- `src/index.css`: 共通スタイルとモバイル基準
- `src/App.css`: 画面固有のスタイル
- `docs/PRODUCT.md`: 仕様と未決事項
- `AGENTS.md`: AI エージェント向け作業指針

機能が決まったら、画面、共通 UI、データ処理をそれぞれのディレクトリに分けてください。現段階では先回りして抽象化しません。
