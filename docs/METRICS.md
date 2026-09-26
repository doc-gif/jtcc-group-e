# 計測の集計（GA4・Clarity → 毎日 1 コメント）

LP（https://doc-gif.github.io/lastpiece-lp/ ）とデモ（https://doc-gif.github.io/jtcc-group-e/ ）は同じ GA4 プロパティ（測定 ID `G-3DDS1NJZXS`）なので、**LP に入った人がデモに進んだ割合**は GA4 で出せる。Clarity はスクロールの奥行き・デッドクリックなど「見え方」の補助。

- スクリプト: `scripts/metrics-report.mjs`（依存なし。`node scripts/metrics-report.mjs --days 7`）
- 実行: `.github/workflows/metrics-report.yml`（**手動だけ**。担当者の指示 2026-09-26。Actions → Metrics report → Run workflow、days を指定）。結果は Actions の要約と、`[metrics]` の Issue（#112）へのコメント。
- 出るもの: LP のセッション・ユーザー・**しっかり見た**（GA4 の「エンゲージのあったセッション」= 10 秒以上か 2 ページ以上）・90% スクロール・平均滞在・ページ/セッション・**デモのページも見たセッションと割合**・デモ側のイベント（本番公開後）。Clarity は LP とデモそれぞれのセッション（ボット除外数）・ページ/セッション・スクロール・デッドクリック・イライラしたクリック（過去 3 日、API の上限）。

## 出せないもの（正直に）

- **1 セッションが何ページ見たか（分布）**は GA4 Data API・Clarity API のどちらでも取れない。BigQuery エクスポート（GA4 → BigQuery、無料枠あり）を有効にすれば出せる。LP は 1 ページの site なので、当面は「2 ページ目以降 = デモへ進んだ」とみなし、到達率で代える。
- デモ側のイベント（`demo_start` など）は本番公開後にしか届かない。

## 担当者の準備（一度だけ）

### GA4（主）

1. GA4 の **プロパティ ID**（数字）を控える: GA4 → 管理 → プロパティ → プロパティの詳細 → 「プロパティ ID」。
2. Google Cloud で **サービスアカウント**を作る: https://console.cloud.google.com/ → プロジェクトを選ぶ（無ければ作る）→ API とサービス → ライブラリ → **Google Analytics Data API** を有効化 → IAM と管理 → サービスアカウント → 作成（役割は不要）→ 作ったアカウントの「キー」→ 新しい鍵 → JSON をダウンロード。
3. GA4 にそのアカウントを **閲覧者**で追加: GA4 → 管理 → プロパティのアクセス管理 → ＋ → サービスアカウントのメール（`…@….iam.gserviceaccount.com`）→ 役割「閲覧者」。
4. リポジトリに入れる（Settings → Secrets and variables → Actions）:
   - 変数 `GA4_PROPERTY_ID` = プロパティ ID
   - 秘密 `GA4_SA_KEY` = ダウンロードした JSON の中身をそのまま貼る
   - ローカルなら `gh variable set GA4_PROPERTY_ID --repo doc-gif/jtcc-group-e --body <ID>`、`gh secret set GA4_SA_KEY --repo doc-gif/jtcc-group-e < key.json`
5. 鍵の JSON はチャット・Issue・PR に貼らない。ダウンロードしたファイルは登録後に削除してよい。

### Clarity（補助）

1. Clarity → 該当プロジェクト → 設定 → **データ エクスポート**（Data Export）→ **API トークンを生成**（名前は `jtcc-metrics` など）。
2. 秘密 `CLARITY_TOKEN` に入れる。変数 `CLARITY_ENABLED` = `true`（GA4 を設定しない場合でも workflow を動かすための印）。
3. 上限: 1 日 10 回、過去 1〜3 日分だけ。手動実行は 1 日 10 回まで。

### 結果を受け取る Issue

- `[metrics]` の Issue は #112。番号は変数 `METRICS_ISSUE` に入れる。無ければ Actions の要約にだけ出る。

### 初回の実行

- Actions → **Metrics report** → Run workflow（days = 7）。要約に表が出れば成功。失敗したら「取得できなかったもの」に理由が出る（権限不足なら GA4 の閲覧者追加か API の有効化が漏れている）。

## LP が 0 と出たとき

表の下に「プロパティ全体のセッション」と「多い入口」が出る。全体も 0 なら `GA4_PROPERTY_ID` が測定 ID `G-3DDS1NJZXS` のプロパティか（GA4 → 管理 → データ ストリーム → 測定 ID で確認）、LP が GA4 に送っているか、反映の遅れ（最大 24〜48 時間）を疑う。全体に来ているのに LP が 0 なら、入口の URL が `/lastpiece-lp/` と違う（例: 独自ドメイン）。

## 読み方

- **しっかり見た割合**が低い（例 30% 未満）→ ファーストビューで離脱。LP の最初の画面にデモの入口があるかを見る。
- **デモに進んだ割合**が「しっかり見た」より大きく下がる → 導線（ボタン・QR）の位置か文言。Clarity のデッドクリックの録画で、押されたのに反応しない場所を探す。
- 自分たちのテスト閲覧は、アプリ側で `?internal=1`・localhost・確認用プレビューを送信元で除外している。LP 側も同じ条件で除外していることを確認する。
