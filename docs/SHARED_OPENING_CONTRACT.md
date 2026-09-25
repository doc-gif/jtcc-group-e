# 40 人共有オープニングの契約（T03）

この契約は実装・デザインの入力であり、公開アプリの接続済み機能や実 DB の検証結果ではない。既存の 1 台デモはそのまま残す。`src/realtime/protocol.ts` の `RoomTransport` を、ローカル専用 `MockRoomServer.asUser()` と Supabase `supabaseTransport()` の共通境界とする。どちらも `Snapshot` と下記の失敗コードを返し、UI は通信経路を黙って切り替えない。

## 主体と識別子

- 各端末は Supabase の匿名ログインで得た `auth.uid()` に相当するゲスト ID を持つ。本人の JWT だけが RPC の本人識別に使われる。ニックネーム、招待 URL、クライアントが送る user ID は権限の根拠にしない。別端末へのアカウント移転は対象外。
- `create` の `request` はクライアントが再試行中に保持する UUID。部屋 ID として使う。招待 UUID はサーバーが別に生成し、推測困難な参加券とする。招待を知るだけでは既存メンバーの snapshot を読めない。
- 1 部屋の active メンバーはホストを含め最大 40 人。離席した席は新規参加に使える。元のゲスト ID による再参加は残高・過去結果を引き継ぐが、席が満杯なら `room-full`。匿名セッションを失った端末は同じ ID に戻れない。
- 部屋は作成から 2 時間で失効する。失効後は参加・閲覧・操作に `room-unavailable` を返す。削除時刻は保証せず、保存済みの台帳を再利用しない。

## 操作と失敗応答

| 操作 | 許可主体と成功状態 | 前提を満たさない場合のコード（変更なし） |
| --- | --- | --- |
| `create(request, name)` | ログイン済みゲスト。部屋・ホスト・本人の 3,000 デモコイン・100 個の架空在庫を一度だけ作る。同じ本人と request の再試行は同じ部屋を返す。 | `auth-required`、`invalid-request`、`invalid-name`、他人の request と衝突または失効なら `room-unavailable`。 |
| `join(invite, name)` | 有効な招待を持つゲスト。40 席以内で入室。同じ ID の再接続は既存残高・結果を保持し、ニックネームと接続時刻を更新する。 | `auth-required`、`invalid-name`、招待なし・期限切れは `room-unavailable`、新たに席を取れなければ `room-full`。 |
| `snapshot(room)` | 有効な active メンバーのみ。本人残高、メンバー、最新ラウンド、自分の公開済み全結果、サーバー時刻を返し、接続時刻を更新する。 | 非メンバー・退室済み・失効は `room-unavailable`。通信失敗は安全な一般エラー。 |
| `ready(room, bool)` | active メンバー本人だけ。`true` は 500 コイン以上のとき、`false` は取り消し。最新ラウンドの `nextReadyAt` 以後に設定する。 | `room-unavailable`、`round-active`、真偽値でなければ `invalid-ready`、不足なら `insufficient-coins`。 |
| `start(room, request, expected)` | 現在のホストだけ。現在の roundNo と expected が一致し、オンラインで準備済みの人が 1 人以上なら全員分を単一トランザクションで抽選・減算・記録。同じ request の再試行は二重処理しない。 | `room-unavailable`、`host-required`、`invalid-request`、`invalid-round`、`stale-round`、`round-active`、`nobody-ready`、`sold-out`、`insufficient-coins`。失敗時はコイン・在庫・roundNo・ready を変えない。 |
| `claim(room)` | active メンバー。現在のホストが退室済み、または最終接続から 45 秒を超えた場合だけホストに交代。競合は部屋ロックで一人に決める。 | `room-unavailable`、現ホストがオンラインなら `host-online`。 |
| `leave(room)` | active メンバー本人。席を空け ready を解除する。残高・結果台帳は残す。ホストの退室後は他の active メンバーが `claim` できる。 | 非メンバー・失効は `room-unavailable`。 |
| `subscribe(room, refresh)` | メンバー向けの更新ヒント。通知の内容で結果・権限を決めず、受信時に `snapshot` を再取得する。購読失敗時もポーリングを続ける。 | 非メンバーは購読できない。Realtime の認可失敗をゲーム結果の失敗に変換しない。 |

エラーのコードは UI にそのまま出さず、`errorMessage` の日本語で回復操作を案内する。想定外の SQL・通信エラーの詳細は画面に出さない。

## 時刻・抽選・再接続

- `serverTime`、`expiresAt`、`startsAt`、`nextReadyAt` はサーバーの UTC 時刻。端末時刻は権限・抽選に使わない。UI の秒読みは `serverOffset` で補正し、`startsAt` に snapshot を再取得して公開済み結果を表示する。タブ復帰や再接続時にも取得し直す。
- 本人の snapshot 呼び出しが heartbeat。SQL は最終接続時刻を最大 10 秒間隔で更新し、45 秒以内をオンラインとみなす。UI は接続中に 20 秒以内のポーリングを続ける。通知は加速手段であり、送信に失敗しても抽選・コイン・結果を取り消さない。全 40 人へのフレーム単位の動き配信はしない。
- `start` の成功時点で対象者を固定し、各人から 500 デモコインを引き、在庫を減らし、結果を保存する。残数が参加人数未満なら **全員の抽選を取り消し** `sold-out`。ラウンド識別子は部屋 ID と `number` の組で安定する。
- 結果は `startsAt`（コミットから約 8 秒後）まで **全員に非公開**。その間 `round.results` と賞品別 `stock` は `null`、`myResults` に新結果を加えない。Realtime の通知には賞品を載せない。`startsAt` 以後、同じ保存済み結果を全員に返す。次の ready/start は `nextReadyAt`（`startsAt` から 15 秒後）まで拒否する。
- `snapshot` は最新ラウンドだけを開封演出用に返す。`myResults` は本人の公開済み結果を過去ラウンドから返し、長時間オフラインでも当たりを見失わない。同じ request を再送しても追加コインや追加結果は作らない。
- Supabase の 4 テーブルは Data API の直接読み書きを許さず RLS を有効にし、RPC 内で本人と active membership を確認する。Private Broadcast は起床通知のみ。公式の [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization) に従い受信ポリシーを別 SQL に置く。接続時の認可キャッシュがあるため、退室後の通知にも秘密を載せない。

## 今回の検証境界と体験レビュー

SQL と模擬 transport はローカル検証対象。Supabase 実プロジェクトへの migration 適用、40 台の実接続、実 iPhone の遅延・再接続は未検証で、後続タスクで確認する。`supabaseTransport` は型上の共通実装で、現行画面の旧 `useSimulatedRoom` はまだそれへ接続していない。旧画面はデモ表示を維持する。

**AI 非視覚レビュー:** 全員同時の公開時刻、再接続後の本人の当たり、ホスト不在からの回復を定義した。結果の先見え・二重減算・40 人目の入室失敗を防ぐことで、友達と開ける期待を損なわない。対象ファンの行動観察は未実施。