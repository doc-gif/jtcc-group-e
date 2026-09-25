# 共通の作業指示

このリポジトリで作業する前に、必ず [AGENTS.md](AGENTS.md) を読み、その指示に従う。開発・レビュー・公開のルールは AGENTS.md と参照先ドキュメントで管理する。

通常の実装・修正依頼では、検証後に自分で PR の Draft を解除し、必須 CI・Bot のマージ完了・確認用プレビューの動作確認まで進める。Draft の作成だけで完了扱いにしない。利用者が停止地点を指定した場合はそれに従う。

利用者には確認用 URL と確認してほしい操作を渡す。本番デプロイは明示指示があるときだけ行う。詳しくは [docs/PREVIEW.md](docs/PREVIEW.md) と [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。
