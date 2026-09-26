# 共有オープニングの契約（T03、F07 で更新）

T03 で 40 人として定めた。F07（2026-09-26 の担当者の決定）で、上限を 100 人にし、ホストの予約開始とピッチモードを加えた。

この契約は実装・デザインの入力であり、公開アプリの接続済み機能や実 DB の検証結果ではない。既存の 1 台デモはそのまま残す。`src/realtime/protocol.ts` の `RoomTransport` を、ローカル専用 `MockRoomServer.asUser()` と Supabase `supabaseTransport()` の共通境界とする。どちらも `Snapshot` と下記の失敗コードを返し、UI は通信経路を黙って切り替えない。

## 主体と識別子

- 各端末は Supabase の匿名ログインで得た `auth.uid()` に相当するゲスト ID を持つ。本人の JWT だけが RPC の本人識別に使われる。ニックネーム、招待 URL、クライアントが送る user ID は権限の根拠にしない。別端末へのアカウント移転は対象外。
- `create` の `request` はクライアントが再試行中に保持する UUID。部屋 ID として使う。招待 UUID はサーバーが別に生成し、推測困難な参加券とする。招待を知るだけでは既存メンバーの snapshot を読めない。
- 1 部屋の active メンバーはホストを含め最大 100 人（内部の上限）。画面には上限を出さず「N人が集まっています」だけを出す。満員の案内にも数字を入れない。離席した席は新規参加に使える。元のゲスト ID による再参加は残高・過去結果を引き継ぐが、席が満杯なら `room-full`。匿名セッションを失った端末は同じ ID に戻れない。
- 部屋は作成から 2 時間で失効する。失効後は参加・閲覧・操作に `room-unavailable` を返す。削除時刻は保証せず、保存済みの台帳を再利用しない。

## 操作と失敗応答

| 操作 | 許可主体と成功状態 | 前提を満たさない場合のコード（変更なし） |
| --- | --- | --- |
| `create(request, name)` | ログイン済みゲスト。部屋・ホスト・本人の 3,000 デモコイン・300 個の架空在庫（目玉 `plush` 30・`pouch` 90・`badge` 180。F07 で 100 個から同じ比率で 3 倍にした。100 人でも 1 回で売り切れない）を一度だけ作る。同じ本人と request の再試行は同じ部屋を返す。 | `auth-required`、`invalid-request`、`invalid-name`、他人の request と衝突または失効なら `room-unavailable`。 |
| `join(invite, name)` | 有効な招待を持つゲスト。100 席以内で入室。同じ ID の再接続は既存残高・結果を保持し、ニックネームと接続時刻を更新する。 | `auth-required`、`invalid-name`、招待なし・期限切れは `room-unavailable`、新たに席を取れなければ `room-full`。 |
| `snapshot(room)` | 有効な active メンバーのみ。本人残高、メンバー、最新ラウンド、自分の公開済み全結果、サーバー時刻、予約（`scheduledAt`）、ピッチモード（`pitchMode`）、最後の予約の結末（`lastSchedule`）を返し、接続時刻を更新する。予約の時刻を過ぎていれば、この呼び出しが開始を 1 回だけ実行する（下記）。 | 非メンバー・退室済み・失効は `room-unavailable`。通信失敗は安全な一般エラー。 |
| `ready(room, bool)` | active メンバー本人だけ。`true` は 500 コイン以上のとき、`false` は取り消し。最新ラウンドの `nextReadyAt` 以後に設定する。 | `room-unavailable`、`round-active`、真偽値でなければ `invalid-ready`、不足なら `insufficient-coins`。 |
| `start(room, request, expected)` | 現在のホストだけ。現在の roundNo と expected が一致し、オンラインで準備済みの人が 1 人以上なら全員分を単一トランザクションで抽選・減算・記録。同じ request の再試行は二重処理しない。予約があれば「今すぐ開始」として置き換える（`scheduledAt`・`lastSchedule` を消す）。 | `room-unavailable`、`host-required`、`invalid-request`、`invalid-round`、`stale-round`、`round-active`、`nobody-ready`、`sold-out`、`insufficient-coins`。失敗時はコイン・在庫・roundNo・ready を変えない。 |
| `schedule(room, minutes)` | 現在のホストだけ。`minutes` は 1・3・5・10 で、サーバー時刻の `minutes` 分後を `scheduledAt` にする。予約中の再指定は変更、`null` は取り消し（`lastSchedule.status = 'cancelled'`）。予約はルームの期限の 1 分前まで。 | `room-unavailable`、`host-required`、許されない分数・期限の 1 分前を過ぎる時刻は `invalid-schedule`、開封中・次の準備までの間は `round-active`。 |
| `setPitchMode(room, on)` | 現在のホストだけ。部屋のピッチモードを切り替え、次に始まるラウンドから効く。 | `room-unavailable`、`host-required`、真偽値でなければ `invalid-request`。 |
| `claim(room)`（**廃止予定**：担当者の判断でホストは担当者だけにする。F10 でホスト用リンクの再開に置き換える） | active メンバー。現在のホストが退室済み、または最終接続から 45 秒を超えた場合だけホストに交代。競合は部屋ロックで一人に決める。 | `room-unavailable`、現ホストがオンラインなら `host-online`。 |
| `leave(room)` | active メンバー本人。席を空け ready を解除する。残高・結果台帳は残す。ホストの退室後は他の active メンバーが `claim` できる。 | 非メンバー・失効は `room-unavailable`。 |
| `subscribe(room, refresh)` | メンバー向けの更新ヒント。通知の内容で結果・権限を決めず、受信時に `snapshot` を再取得する。購読失敗時もポーリングを続ける。 | 非メンバーは購読できない。Realtime の認可失敗をゲーム結果の失敗に変換しない。 |

エラーのコードは UI にそのまま出さず、`errorMessage` の日本語で回復操作を案内する。想定外の SQL・通信エラーの詳細は画面に出さない。

## 時刻・抽選・再接続

- `serverTime`、`expiresAt`、`startsAt`、`nextReadyAt` はサーバーの UTC 時刻。端末時刻は権限・抽選に使わない。UI の秒読みは `serverOffset` で補正し、`startsAt` に snapshot を再取得して公開済み結果を表示する。タブ復帰や再接続時にも取得し直す。
- 本人の snapshot 呼び出しが heartbeat。SQL は最終接続時刻を最大 10 秒間隔で更新し、45 秒以内をオンラインとみなす。UI は接続中に 20 秒以内のポーリングを続ける。通知は加速手段であり、送信に失敗しても抽選・コイン・結果を取り消さない。全員へのフレーム単位の動き配信はしない。
- `start` の成功時点で対象者を固定し、各人から 500 デモコインを引き、在庫を減らし、結果を保存する。残数が参加人数未満なら **全員の抽選を取り消し** `sold-out`。ラウンド識別子は部屋 ID と `number` の組で安定する。
- 結果は `startsAt`（コミットから約 8 秒後）まで **全員に非公開**。その間 `round.results` と賞品別 `stock` は `null`、`myResults` に新結果を加えない。Realtime の通知には賞品を載せない。`startsAt` 以後、同じ保存済み結果を全員に返す。次の ready/start は `nextReadyAt`（`startsAt` から 15 秒後）まで拒否する。
- `snapshot` は最新ラウンドだけを開封演出用に返す。`myResults` は本人の公開済み結果を過去ラウンドから返し、長時間オフラインでも当たりを見失わない。同じ request を再送しても追加コインや追加結果は作らない。
- Supabase の 4 テーブルは Data API の直接読み書きを許さず RLS を有効にし、RPC 内で本人と active membership を確認する。Private Broadcast は起床通知のみ。公式の [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization) に従い受信ポリシーを再実行可能な別 SQL 草案に置き、Realtime 未初期化なら明示的に失敗させる。接続時の認可キャッシュがあるため、退室後の通知にも秘密を載せない。

## 予約開始（F07）

- ホストは「1・3・5・10 分後に開始」を選ぶ。全員の snapshot に `scheduledAt` が入り、UI は `serverOffset` で補正した秒読みを出す（`RoomState.secondsToScheduled`）。開始前ならホストは変更・取り消しでき、「今すぐ開始」（`start`）も使える。
- cron は使わない。`scheduledAt` 以後に **どの active メンバーの snapshot でも**（15 秒のポーリング、`scheduledAt` 直後の再取得）サーバーが開始を 1 回だけ実行する。部屋をロックするほかの RPC（`join`・`ready`・`start`・`schedule`・`setPitchMode`・`claim`・`leave`）も、ロックの直後に時刻を過ぎた予約を先に実行してから本来の処理をする（`lp_fire_due`）。そのため時刻の後の変更・取り消し・「今すぐ開始」で予約が消えることはない（取り消しは何もせず、変更と今すぐ開始は `round-active`・`stale-round`）。本来の処理が失敗した場合は、実行した開始も同じ取引で取り消され、次の snapshot でもう一度実行する。ホストが不在でも始まる。対象はその時点でオンラインの準備済みメンバーで、売り切れ・コイン不足・全員分の取り消しは `start` と同じ。
- 1 回だけの保証: 開始する取引は部屋行を `FOR UPDATE` でロックし直し、`scheduledAt` がまだ残っているかを確かめてから消す。同時に来た別の snapshot はロックを待ち、消えた予約を見て何もしない。さらに request を「部屋 ID と `scheduledAt`」から決まる UUID にし、`(room, request_id)` の一意制約と事前の存在確認で同じ予約の二重抽選を防ぐ。
- ロック: 通常の snapshot は従来どおり部屋行を `FOR SHARE` で読む。ロックなしの読み取りで予約の時刻を過ぎていると分かったときだけ、最初から `FOR UPDATE` を取る（`FOR SHARE` からの格上げは、同時に格上げする 2 つの取引がデッドロックするため行わない）。部屋→会員・在庫・ラウンドの順は変えない。
- 開始できなかったとき（準備OKの人がいない・売り切れ・コイン不足）は、抽選の変更をすべて取り消し（サブトランザクション）、予約を消して `lastSchedule = { status, scheduledAt, roundNo: null }` にする。ホストの画面は `scheduleNotice` で理由を出す（ホストだけ。閉じる操作 `dismissScheduleNotice`、次のラウンドの後は出さない）。成功時は `status: 'started'` と `roundNo`。`lastSchedule` は次の予約か「今すぐ開始」で消える。
- `startsAt` は従来どおり開始のコミットから 8 秒後。予約の開始は `scheduledAt` 以後にしかコミットしないので、公開は必ず `scheduledAt` + 8 秒以後になる。UI は `scheduledAt` まで予約の秒読み、その後 `startsAt` まで開封の秒読みを出す。
- 予約は部屋の期限（作成から 2 時間）の 1 分前までに限る。開始・公開が期限の後になって、誰も結果を見られなくなることを防ぐ。

## ピッチモード（F07）

- 対面のビジネスピッチ用に、ホストが部屋ごとにオンにする。オンの間、各ラウンドで参加者 1 人を一様な乱数で選び、目玉（`plush`、架空在庫でいちばん少ない賞品）を **本物の在庫から 1 つ先に確保して** 渡す。ほかの人は残りの在庫から通常どおり抽選する（目玉を引くこともある）。
- 正直さ: `pitchMode` と、そのラウンドで確定枠を使ったかの `round.guaranteed` を全員の snapshot に出す。UI は「ピッチ用デモ：このラウンドは1人に目玉確定」などと明示する。`guaranteed` は開始直後から見えるが、誰が受け取るかは `startsAt` まで非公開のまま。
- 目玉の在庫が 0 なら装わない。通常の抽選にし、`round.guaranteed = false` にする。確定演出は本当に目玉が出るときだけという決まりは変わらない。
- ピッチモード中は、公開している確率は確定枠には当てはまらない（確定枠以外の人には当てはまる）。UI はそのことを表示する（[PRODUCT.md](PRODUCT.md)）。

## 今回の検証境界と体験レビュー

コアの SQL は T14 で正式 migration（`supabase/migrations/`）にし、専用の検証プロジェクトに適用した（[T14 の記録](SQL_MIGRATION_T14.md)）。予約開始・ピッチモード・100 席は F07 の migration で追加・適用した（[F07 の記録](SQL_MIGRATION_F07.md)）。Realtime の受信ポリシー `supabase/drafts/optional_broadcast.sql` は、Realtime の初期化後に適用する草案のまま。公開アプリ（本番・確認用プレビュー）はまだこの検証プロジェクトに接続していない。ブラウザからの HTTP 経路、多数の端末（最大 100 台）の実接続、実 iPhone の遅延・再接続は未検証で、後続タスクで確認する。`supabaseTransport` は型上の共通実装で、現行画面の旧 `useSimulatedRoom` はまだそれへ接続していない。旧画面はデモ表示を維持する。

画面から使う状態層は `src/realtime/roomController.ts` の `createRoomController` と React 用の `useSharedRoom`（F05a）。この契約の時刻補正、20 秒以内のポーリング、`startsAt` での再取得、通信断からの再接続、request の再利用、失敗コードの日本語化をここで行う。F07 で予約（`schedule`、`scheduledAt` での再取得、`secondsToScheduled`、`scheduleOptions`、`scheduleNotice`）とピッチモード（`setPitchMode`、`pitchMode`、`roundGuaranteed`）を加えた。画面への接続は F05 で行う。

**AI 非視覚レビュー:** 全員同時の公開時刻、再接続後の本人の当たり、ホスト不在からの回復を定義した。結果の先見え・二重減算・上限を超える入室を防ぐことで、友達と開ける期待を損なわない。対象ファンの行動観察は未実施。