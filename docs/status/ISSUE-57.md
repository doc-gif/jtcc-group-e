# ISSUE-57 「ホーム画面に追加」の案内と、結果画面の権利表記の帯のマスター反映

## 成果
- #57 の残り（3「ホーム画面に追加」の案内）: ブラウザのタブで開いたときだけ、街ホームの地図の下に案内を出す（`src/components/InstallGuide.tsx`、出し分けは `src/app/installGuide.ts`）。iPhone・Android の手順と「閉じる」。ブラウザが追加の画面を出せるとき（`beforeinstallprompt`）は主ボタン「ホーム画面に追加」。閉じる・追加が済むとその端末に保存して二度と出さない。ホーム画面から開いたとき（`display-mode: standalone`・`navigator.standalone`）とルームには出さない。
- #55 の残りの Figma: 権利表記の帯を結果 `267:9379` に入れた（アプリは PR #66 で実装済み）。
- Figma が先: 作業領域 Town v2 `task/claude/issue-55-57`（`447:19649`）で作り、ロック #148 でマスターに反映（結果の帯 `448:14189`〜`448:14191`、T07 の案内 `448:14192`・`448:14267`）。記録は [ADOPTED_DESIGN.md](../ADOPTED_DESIGN.md)。
- 夜間モードのため、案内の出す場所・文言・帯の形は担当者の確認前に作業者が選んだ案で進めた（#55・#57 の needs-owner）。

## 検証と証拠
- `src/app/installGuide.test.tsx`（出し分け・閉じたら保存・追加の画面・appinstalled・保存できない端末）、`e2e/standalone.spec.ts`（5構成で街ホームに出てルームに出ない・閉じたら再読み込みしても出ない・standalone では出ない）、`ux.spec.ts` の `town-home`（案内が出た状態で 44px・文字200%・axe）。
- 320px・文字200% の実画面で、見出し・手順・ボタンが折り返し、ボタンが縦に並ぶことを確認した（2026-09-26 17:20 UTC 時点、ローカルのテスト用サイト）。
- 未確認: 実機（iPhone の Safari・Android の Chrome）でのホーム画面への追加と、Android の追加の画面。確認は担当者（[MULTI_DEVICE.md](../MULTI_DEVICE.md) の手順 0）。

## 残課題
- 担当者の判断: 案内をルームにも出すか（ホーム画面のアプリでルームに入る方法、PRODUCT.md の未決事項）。文言と帯の形の確認。
- #55: 担当者の写真のアップロード（[PITCH_PHOTOS.md](../PITCH_PHOTOS.md)）。

## ブランチ・記録
`claude/issue-55-57-a2hs`。Issue #57・#55、Figma のロック #148。
