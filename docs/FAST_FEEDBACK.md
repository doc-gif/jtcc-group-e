# 早く確認し、品質を保ってマージする

## 実測と対策

初期 CI `36151439972` ではブラウザ準備に40〜53秒、型・lint・単体テスト・ビルドには約8秒かかった。従来はその後の全ブラウザ検証完了まで配布を待っていた。

| 待ち時間の原因 | 対応 |
| --- | --- |
| プレビューが全検証待ち | 短い Preview build 後に先行配布。全検証は並行 |
| Ready 変更で同じ SHA を再検証 | 既存 CI を再利用。未完了なら完了イベントでマージ |
| 古い push の CI が残る | PR ごとに古い CI・Preview build をキャンセル |
| AI が同じ全検証を繰り返す | ローカルは影響範囲、全検証は CI。同一 SHA の結果を再利用 |
| 確認者へ URL を手で転送 | PR コメントに固定 URL と QR を自動掲載 |

目標は push から数分以内。Actions のキューと Pages の反映時間は変動するため保証ではない。時間は `Preview build`・`Publish PR preview`・確認用リポジトリの Pages のログで確認する。

### 導入時の記録（2026-09-26）

- 基盤: PR #5、高速化・QR: PR #6。ともに必須 CI を通して Bot がマージ。
- 旧 CI `36151439972`: Quality gate 2分29秒、UI/UX gate 3分28秒（並行実行）。
- Preview build `36153151593`: 作成から完了まで31秒。型・lint・単体122件・ビルドを含む。
- Copilot は PR #6 で自動起動・レビュー完了。指摘は公式仕様に照合し、判定根拠を PR に記録。利用残量や超過課金設定は取得・変更していない。
- 初回導入時は main に workflow が必要なため手動起動を使用。以降は PR の Preview build 完了で自動起動する。運用確認では Bot コメントの URL・QR・対象 SHA を確認してから利用者へ案内する。

## 品質の境界

プレビューは型・lint・単体テスト・ビルド後に出すが、全画面検証の合格を意味しない。画面とコメントで CI の確認を案内する。マージ条件の `Quality gate`・`UI/UX gate`、カバレッジ、全5構成、レビュー記録、main 保護は維持する。

Copilot を使えなくてもこれらを実行する。届いた指摘は作業者が再現を確認し、有効なら修正と回帰テスト、誤検知なら根拠を記録して解決する。速度のために指摘を自動で消さない。

## Copilot

レビュー観点・対象外・再依頼条件は [Copilotレビュー方針](COPILOT_REVIEW.md)。

ruleset `Optional Copilot review`（ID `24004828`）で main 向け PR 作成時に自動依頼する。Draft を含め、push ごとの再依頼は無効。消費を抑えるため、作成時点でレビューできる意味のある差分を含める。

Copilot のチェック・承認は required check / required reviewer に追加しない。未契約・利用上限・障害でも既存 Bot が必須 CI に基づきマージできる。自動レビューの消費は通常 PR 作成者に帰属する。残量は未確認で、課金上限・有料超過枠は変更していない。

[自動レビュー設定](https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-code-review)・[使用量と予算](https://docs.github.com/en/copilot/concepts/agents/code-review)を参照する。

## QR

プレビュー配布時に固定 URL の `qr.png` を生成し、PR コメントと最終報告に画像を併記する。本番などは次で生成できる。

```sh
pnpm qr https://doc-gif.github.io/jtcc-group-e/versions/v0.1.0/ release-qr.png
```

`qrcode` でローカル生成し、テストは独立した `jsqr` で PNG を読み戻して URL の完全一致を検証する。外部サービスや手入力は不要。案内前にはリンク先の SHA と画面も確認する。
