# 回帰テスト方針

## 実行

Node.js 24 と package.json に固定した pnpm を使う。

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
pnpm verify
```

Linux の CI は `playwright install --with-deps chromium webkit` で OS 依存も用意する。`pnpm check` は型・lint・Vitest・ビルド、`pnpm test:e2e` は公開成果物の操作、`pnpm test:ux` は UI/UX 基準を実行する。

## どれだけ追加するか

| 変更 | 必要なテスト |
| --- | --- |
| 計算・バリデーション・状態遷移 | 正常系、境界値、異常系。重要な分岐と不変条件を検証 |
| 入力・保存・画面の操作 | 利用者の操作から結果までのコンポーネントテスト。待機・空・エラー・再試行も対象 |
| 主要な利用目的・画面遷移 | Playwright で目的達成までの E2E。画面を増やしたらシナリオも追加 |
| 見た目・文言・操作性 | UI/UX gate と現在の UI に紐づくレビュー記録 |
| 不具合修正 | 修正前に失敗し、修正後に成功する再現テストを先に作る |
| 公開・承認・履歴処理 | 失敗時に誤公開／誤承認しないこと、再実行と同時変更を検証 |

カバレッジは行・文・関数 80%、分岐 75% を初期の下限にする。数字だけを満たすテストや、画面全体の無意味なスナップショットは追加しない。業務ロジックができたら、その重要な経路の網羅を優先する。現在のアプリは仮画面であり、将来の業務機能が既に検証されているわけではない。

## 現在の対象

全体 CI は [自動分割・結果集約](CI_SCALING.md)で全件を実行する。テスト数に応じて分割数を増やし、実行前の検出件数と最後の合格件数が一致しない場合はマージしない。

- ラストピースの業務ロジック（抽選・確率・残りの段階・一律20%の交換・届け待ち・保存の復元・演出の台本・90日ルール）を `src/domain/domain.test.ts` で検証。
- 共有ルームの状態層（100席と満員、サーバー時刻のずれと公開時刻、開始の再送、ホストが不在でも交代しないこととホスト用リンクでの再開、ホスト用キーの保存と無効時の消去、名前を選ばない参加と使われている名前の候補・名前の変更、再接続後の結果、購読失敗時のポーリング、アンマウントでの停止、予約の秒読みとホスト不在での開始、予約の変更・取り消し・期限、ピッチモードの表示、ホスト以外に2人以上の開始条件と予約の人数待ち（F13））を `src/realtime/roomController.test.ts` と `useSharedRoom.test.tsx` で検証。模擬サーバーと SQL の同等性は `src/realtime/protocol.test.ts`、SQL は `scripts/shared-db.test.mjs`（PGlite。ホスト用キーはハッシュだけの保存・誤ったキー・失敗の回数制限・参加者の交代不可・新しい端末での再開・全角半角と大小の名前の重複・自動の名前・開始の人数と人数待ちの予約）、キーの作成手順は `scripts/host-key.test.mjs` で検証。
- 画面の操作（ホームの絞り込み、詳細、ひとりで回す、当てたもの、マイページ、はじめて、保存できない端末）を `src/App.test.tsx` で検証。
- 街の読み込み中（すぐ準備できたら出さない、0.3秒待ったら出す、準備できたら街へ、先に街へ行く、失敗とやり直し、導入のあと、動きを減らす設定）を `src/App.test.tsx` と `src/app/assets.test.ts`、ブラウザでは絵の読み込みを止めて `e2e/app.spec.ts` と UI/UX 検査（`town-loading`・`town-loading-error`）で検証。
- 棚（9枠・お気に入りと取り消し・棚の外・共有前の見え方）とフレンド（友だちなし・友だちの棚・「いいな〜」は1回だけ・見られない状態）を `src/domain/shelf.test.ts` と `src/screens/Shelf.test.tsx`、ブラウザでは `e2e/app.spec.ts` で検証。
- 共有ルームの画面（T10 の28画面の選び方、ホストの作成・予約・ピッチ用・開始、参加者の名前・重なり・自動の名前・名前の変更・準備・見守り、秒読み → 同時開封 → 結果、満員、期限切れ、ホスト不在、再接続、結果の回収、ホスト用リンク）を `src/app/room.test.ts` と `src/screens/Room.test.tsx`（偽タイマーと模擬サーバー）で、ブラウザでは `e2e/room.spec.ts`（同じブラウザの2つのタブ＝端末内デモ）で検証。UI/UX の場面は `e2e/room-seeds.ts` の保存データで各状態を開く。
- 複数の端末（F15）: ビルドは `.env.production` で実 Supabase を指す。**E2E・UI/UX 検査は実 Supabase へ通信しない**よう、`playwright.config.ts` の `storageState` が全ページの `localStorage` に `lastpiece_room_force_demo=1` を入れ、ルームを端末内デモにする（新しいテストで `browser.newContext()` を使うときも同じ値を入れる）。`e2e/room.spec.ts` が、成果物に Supabase の URL が入っていることと `*.supabase.co` への要求が 0 件であることを確かめる。設定の有無・形・E2E の指定によるルームの選び方は `src/app/roomSession.test.ts`、匿名ログイン（1回だけ・失敗後のやり直し）と購読（JWT を渡してから非公開チャンネル、失敗してもポーリング）は `src/realtime/supabase.test.ts`、`.env.production` に publishable キーと URL だけがあることは `scripts/governance.test.mjs`。実 DB の確認とブラウザの HTTP 経路が未確認であることは [MULTI_DEVICE.md](MULTI_DEVICE.md)。
- ホーム画面から全画面で開くこととジェスチャーの抑制（F16）を `e2e/standalone.spec.ts` で検証: 最新版・固定版・確認用プレビューのそれぞれで manifest が `standalone` で `start_url`・`scope`・アイコンがその版の場所を指し読めること、`index.html` の全画面のメタと viewport に `maximum-scale`・`user-scalable` がないこと、`html` の `touch-action: pan-x pan-y` と `overscroll-behavior: none`（街の地図は中だけ `contain`）、ボタンは選択不可で入力欄は選べること、iOS の `gesturestart` を止めること、文字200%が効くこと。`src/app/gestures.test.ts` はイベントの抑制と解除。ヘッドレスのブラウザでは抑制がなくても合成したピンチで拡大しないため、実際のピンチ・端スワイプ・引っぱって再読み込みは実機で確かめる（[MULTI_DEVICE.md](MULTI_DEVICE.md) の手順）。Playwright の WebKit は `overscroll-behavior` を持たないので、その検査は対応するブラウザだけで行う。
- 法務・ブランドのきまり（禁止語、注記、ピピのセリフ、画像の許可リスト、交換シートの文言、残り口数を出さない）を `scripts/governance.test.mjs` で検証。
- ブラウザで、ひとりで回す → 当てたもの → コインに交換、右のハンドルのタップで回す操作を `e2e/app.spec.ts` で検証。
- Chromium の小型スマホ・Android 相当・デスクトップ、WebKit の iPhone 相当・横向き。
- 最新 URL と過去バージョン URL、一覧からの移動と再読込。
- JavaScript／HTTP エラー、横はみ出し、WCAG AA、操作領域、文字 200%、動きを減らす設定。
- 版の不変性、SHA とビルドの一致、古い版への巻き戻り禁止、改ざん検出。
- 失敗／古い SHA／Draft／フォーク／遅れたブランチでは自動マージしないこと。
- プレビューは成功済みの同一リポジトリの最新 PR だけを配布し、固定ビルドを上書きせず他の PR を保持すること。Draft のプレビュー配布は許可する。
- 確認用外枠の表示・WCAG AA・文字200%、本番とプレビューと別ビルドの保存データ分離をブラウザで検証する。

失敗時のトレース・スクリーンショット・レポートは Actions artifacts に 14 日間保存する。再実行を繰り返して偶然の成功を採用せず、原因を直す。公開版は artifacts の有効期限に依存せず別途永続保存する。
