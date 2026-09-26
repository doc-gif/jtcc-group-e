# 共有オープニングの契約（T03、F07・F10・F13・#88 で更新）

T03 で 40 人として定めた。F07（2026-09-26 の担当者の決定）で、上限を 100 人にし、ホストの予約開始とピッチモードを加えた。F10（同日の担当者の決定）で、ホストを担当者だけにし（ホスト用リンク）、参加者によるホスト交代を廃止し、ニックネームをルーム内で重ならないようにした。F13（同日の担当者の決定「ガチャはホスト以外に2人以上じゃないと引けないようにしたい」）で、ラウンドの開始にホスト以外の active メンバー 2 人以上を必要にした（下記「開始の人数」）。#88（同日の担当者の決定）で、各自が自分のカプセルを開け、全員が開けたら（または 10 秒で）全員の結果を出すようにした（下記「各自で開ける」）。

この契約は実装・デザインの入力であり、公開アプリの接続済み機能や実 DB の検証結果ではない。既存の 1 台デモはそのまま残す。`src/realtime/protocol.ts` の `RoomTransport` を、ローカル専用 `MockRoomServer.asUser()` と Supabase `supabaseTransport()` の共通境界とする。どちらも `Snapshot` と下記の失敗コードを返し、UI は通信経路を黙って切り替えない。

## 主体と識別子

- 各端末は Supabase の匿名ログインで得た `auth.uid()` に相当するゲスト ID を持つ。本人の JWT だけが RPC の本人識別に使われる。ニックネーム、招待 URL、クライアントが送る user ID は権限の根拠にしない。別端末へのアカウント移転は対象外。
- `create` の `request` はクライアントが再試行中に保持する UUID。部屋 ID として使う。招待 UUID はサーバーが別に生成し、推測困難な参加券とする。招待を知るだけでは既存メンバーの snapshot を読めない。
- リンクは 2 種類（F10）。**参加者用の招待リンク**（招待 UUID）と、**ホスト用リンク** `#/host/<キー>`。ホスト用のキーは担当者だけが持つ秘密で、ルームを作る・別の端末でホストに戻るときに使う（下記「ホスト用リンク」）。
- 1 部屋の active メンバーはホストを含め最大 100 人（内部の上限）。画面には上限を出さず「N人が集まっています」だけを出す。満員の案内にも数字を入れない。離席した席は新規参加に使える。元のゲスト ID による再参加は残高・過去結果を引き継ぐが、席が満杯なら `room-full`。匿名セッションを失った端末は同じ ID に戻れない。
- 部屋は作成から 2 時間で失効する。失効後は参加・閲覧・操作に `room-unavailable` を返す。削除時刻は保証せず、保存済みの台帳を再利用しない。

## 操作と失敗応答

| 操作 | 許可主体と成功状態 | 前提を満たさない場合のコード（変更なし） |
| --- | --- | --- |
| `create(request, hostKey, name)` | 有効なホスト用キーを持つゲストだけ（F10）。部屋・ホスト・本人の 3,000 デモコイン・300 個の架空在庫（目玉 `plush` 30・`pouch` 90・`badge` 180。F07 で 100 個から同じ比率で 3 倍にした。100 人でも 1 回で売り切れない）を一度だけ作る。同じ本人と request の再試行は同じ部屋を返す（開いている自分の部屋の再試行はキーを確かめ直さない）。`name` が `null` ならサーバーが名前を付ける。 | `auth-required`、`invalid-request`、`invalid-name`、キーが違う・取り消し・期限切れなら `host-key-invalid`、1 分に 5 回失敗した後は `too-many-attempts`、他人の request と衝突または失効なら `room-unavailable`。 |
| `resumeHost(hostKey, room)` | 有効なホスト用キーを持つゲスト（F10）。そのキーで作った開いている部屋（`room` が `null` ならいちばん新しいもの）のホストになる。新しい端末ならホストの席（名前・コイン・準備・保存済みの結果）をこの端末へ移す。この端末がすでに参加者として席を持っていれば、その席のまま、前のホストの席を空ける。ほかの人の席・コイン・結果は変えない。前の端末はその部屋を読めなくなる。 | `auth-required`、`host-key-invalid`、`too-many-attempts`、開いている部屋がなければ `no-room`、席が空いていなければ `room-full`。 |
| `join(invite, name)` | 有効な招待を持つゲスト。100 席以内で入室。同じ ID の再接続は既存残高・結果を保持し、ニックネームと接続時刻を更新する。`name` はルームのほかの active メンバーと重ならないこと（下記「ニックネーム」）。`null` なら、前の名前が空いていればそれを、なければサーバーが重ならない名前（例「ゲスト さくら12」）を付け、入った後の snapshot で本人に見せる。入室の後にも時刻を過ぎた予約を実行するので、人数待ちの予約は 2 人目の入室で始まる（F13）。 | `auth-required`、`invalid-name`、使われている名前は `name-taken`（空いている候補付き）、招待なし・期限切れは `room-unavailable`、新たに席を取れなければ `room-full`。 |
| `rename(room, name)` | active メンバー本人（F10）。ロビーで名前を変える。重ならない規則は `join` と同じ。ラウンドの開始から `nextReadyAt` までは変えられない（保存済みの結果は開始時の名前のまま）。 | `room-unavailable`、開封中は `rename-locked`、`invalid-name`、`name-taken`（候補付き）。 |
| `snapshot(room)` | 有効な active メンバーのみ。本人残高、メンバー、最新ラウンド、自分の公開済み全結果、サーバー時刻、予約（`scheduledAt`）、ピッチモード（`pitchMode`）、最後の予約の結末（`lastSchedule`）を返し、接続時刻を更新する。予約の時刻を過ぎていれば、この呼び出しが開始を 1 回だけ実行する（下記。ホスト以外が 2 人未満なら待つ、F13）。 | 非メンバー・退室済み・失効は `room-unavailable`。通信失敗は安全な一般エラー。 |
| `ready(room, bool)` | active メンバー本人だけ。`true` は 500 コイン以上のとき、`false` は取り消し。最新ラウンドの `nextReadyAt` 以後に設定する。 | `room-unavailable`、`round-active`、真偽値でなければ `invalid-ready`、不足なら `insufficient-coins`。 |
| `start(room, request, expected)` | 現在のホストだけ。現在の roundNo と expected が一致し、ホスト以外の active メンバーが 2 人以上（F13）で、オンラインで準備済みの人が 1 人以上なら全員分を単一トランザクションで抽選・減算・記録。同じ request の再試行は二重処理しない。予約があれば「今すぐ開始」として置き換える（`scheduledAt`・`lastSchedule` を消す）。 | `room-unavailable`、`host-required`、`invalid-request`、`invalid-round`、`stale-round`、`round-active`、ホスト以外が 2 人未満なら `need-more-players`（F13）、`nobody-ready`、`sold-out`、`insufficient-coins`。失敗時はコイン・在庫・roundNo・ready を変えない。 |
| `schedule(room, minutes)` | 現在のホストだけ。`minutes` は 1・3・5・10 で、サーバー時刻の `minutes` 分後を `scheduledAt` にする。予約中の再指定は変更、`null` は取り消し（`lastSchedule.status = 'cancelled'`）。予約はルームの期限の 1 分前まで。人数が足りなくても予約できる（時刻になっても始まらず、2 人目が入ると始まる。F13）。 | `room-unavailable`、`host-required`、許されない分数・期限の 1 分前を過ぎる時刻は `invalid-schedule`、開封中・次の準備までの間は `round-active`。 |
| `setPitchMode(room, on)` | 現在のホストだけ。部屋のピッチモードを切り替え、次に始まるラウンドから効く。 | `room-unavailable`、`host-required`、真偽値でなければ `invalid-request`。 |
| ~~`claim(room)`~~（**廃止**、F10） | 参加者によるホスト交代はなくなった。SQL の `lp_claim_host` は削除し、transport・状態層からも外した。ホストが不在でも予約した開始は時刻に始まる。ホストは `resumeHost` で戻る。 | 呼び出せない（関数がない）。旧コード `host-online` も廃止。 |
| `open(room, roundNo)`（#88） | 最新ラウンドの抽選に入った本人だけ、`startsAt` 以後。本人の「開けた」を記録し、本人の結果だけを `myResults` に入れた snapshot を返す。抽選に入った active な人が全員開けたら、その時点で全員の結果を公開する。再送しても同じ（通知も 1 回）。 | `room-unavailable`、見守る人（抽選に入っていない人）・最新でないラウンド・`startsAt` 前は `invalid-round`。 |
| `leave(room)` | active メンバー本人。席を空け ready を解除する。残高・結果台帳は残す。ホストが退室しても交代はなく、ホストは `join`（同じ端末）か `resumeHost` で戻る。 | 非メンバー・失効は `room-unavailable`。 |
| `subscribe(room, refresh, onStatus?)` | メンバー向けの更新ヒント。通知の内容で結果・権限を決めず、受信時に `snapshot` を再取得する。購読失敗時もポーリングを続ける。`onStatus` は購読の状態（`live`／`down`）を知らせ、状態層の `realtime`（`live`／`polling`）になる。サーバーは入室・準備・退室・開始・予約・ピッチモード・名前の変更・ホストの再開ごとに 1 回送る（#68）。 | 非メンバーは購読できない。Realtime の認可失敗をゲーム結果の失敗に変換しない。 |

エラーのコードは UI にそのまま出さず、`errorMessage` の日本語で回復操作を案内する。想定外の SQL・通信エラーの詳細は画面に出さない。

## 時刻・抽選・再接続

- `serverTime`、`expiresAt`、`startsAt`、`revealAt`、`nextReadyAt` はサーバーの UTC 時刻。端末時刻は権限・抽選に使わない。UI の秒読みは `serverOffset` で補正し、`revealAt` に snapshot を再取得して公開済み結果を表示する。タブ復帰や再接続時にも取得し直す。
- 本人の snapshot 呼び出しが heartbeat。SQL は最終接続時刻を最大 10 秒間隔で更新し、45 秒以内をオンラインとみなす。UI は接続中に 20 秒以内のポーリングを続ける。通知は加速手段であり、送信に失敗しても抽選・コイン・結果を取り消さない。全員へのフレーム単位の動き配信はしない。
- `start` の成功時点で対象者を固定し、各人から 500 デモコインを引き、在庫を減らし、結果を保存する。残数が参加人数未満なら **全員の抽選を取り消し** `sold-out`。ラウンド識別子は部屋 ID と `number` の組で安定する。
- 全員の結果は `revealAt`（下記「各自で開ける」。`startsAt` の 10 秒後か、全員が開けた時点）まで **全員に非公開**。その間 `round.results` と賞品別 `stock` は `null`、`myResults` には本人が開けた結果だけを加える。Realtime の通知には賞品を載せない。`revealAt` 以後、同じ保存済み結果を全員に返す。次の ready/start は `nextReadyAt`（`revealAt` から 15 秒後）まで拒否する。
- `snapshot` は最新ラウンドだけを開封演出用に返す。`myResults` は本人の公開済み結果を過去ラウンドから返し、長時間オフラインでも当たりを見失わない。同じ request を再送しても追加コインや追加結果は作らない。
- Supabase の 4 テーブルは Data API の直接読み書きを許さず RLS を有効にし、RPC 内で本人と active membership を確認する。Private Broadcast は起床通知のみ。公式の [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization) に従い、受信ポリシー `lp_receive_round`（参加中の人だけ SELECT、INSERT なし）を migration `lp_realtime_wake`（#68）で適用した。Realtime のない DB（テスト）ではポリシーを作らず、台帳はポーリングで動く。通知の内容は `{roomId, roundNo, reason}` だけ。接続時の認可キャッシュがあるため、退室後の通知にも秘密を載せない。

## 各自で開ける（#88）

担当者の決定（2026-09-26）。以前は秒読みの終わり（`startsAt`）に全員の結果を同時に公開していた。

- 抽選は今どおり開始の時点で確定する。開ける順番で中身は変わらない。ホストの許可・ホスト以外 2 人以上・ピッチモードの確定枠も変わらない。
- `startsAt` から、抽選に入った人（`round.entrants`。準備OKで抽選に入った人の ID だけで、賞品は含まない）が自分のカプセルを開ける（`open`）。**開けるまでサーバーは本人にも結果を返さない**。開けると本人の賞品だけが `myResults` に入る。見守る人（抽選に入っていない人。ホストも準備していなければ見守り）には開けるカプセルがなく、全員の結果を待つ。
- 全員の結果（`round.results`・`stock`）は `revealAt` に出る。`revealAt` は最初 `startsAt` + 10 秒（`SHARED_OPEN_TIMEOUT_MS`）で、抽選に入った active な人が全員開けた時点に早まる。**開けないまま退室した人は待たない**。時間切れは時刻を比べるだけで、書き込みは要らない。
- `round.opened` は開けた人の ID（「みんなが開けています N/M 人」用）。`nextReadyAt` は `revealAt` の 15 秒後で、早まるときも一緒に動く。そのため準備・開始・予約・名前の変更の「開封中」の判定は変えていない。
- SQL: `lp_members.opened_round`（本人が最後に開けたラウンド）と `lp_rounds.reveal_at`。`lp_open`（RPC）は部屋行を `FOR UPDATE` で取り、`lp_fire_due` を先に呼んでから記録し、内部の `lp_settle_open`（実行権限なし）で全員が開けたかを確かめる。`lp_leave` も退室の後に `lp_settle_open` を呼ぶ。起床通知の理由に `open` を加えた（中身は今どおり `{roomId, roundNo, reason}` だけ）。
- 予約の期限の余裕（1 分）は変えない。予約の開始から全員の結果まで最長 8 + 10 秒で収まる。
- 状態層（`roomController`）の phase は `countdown`（〜`startsAt`）→ `opening`（抽選に入っていて、まだ開けていない。`openCapsule()`）→ `waiting`（開けた、または見守る人）→ `results`。`isEntrant`・`hasOpened`・`openedCount`・`entrantCount`・`canOpen` を出す。起床通知がないときは、開ける間だけ 2 秒ごとに取り直す（`ROOM_OPENING_POLL_MS`）。
- 公開中の古いアプリ（`revealAt` を知らない）は、`startsAt` の後も結果が出るまで 1 秒ごとに取り直すので、全員の結果が最大 10 秒遅れて出るだけで壊れない。

## ホスト用リンク（F10）

- ホストになれるのは担当者だけ。担当者は秘密のキーを含むホスト用リンク `https://…/#/host/<キー>` を持つ。キーは URL の**フラグメント**に置くので、ブラウザはサーバー・アクセスログへ送らない。アプリはキーを読んだら `localStorage` に保存し（その端末だけ）、アドレスバーから消す。参加者に配るのは招待リンクだけ。
- キーは 256 ビットの乱数（URL で使える 43 文字）。DB には**キーを保存しない**。キーごとの乱数の salt と `sha256(salt || key)` だけを `lp_host_keys` に置く。このテーブルと失敗記録 `lp_host_attempts` は RLS 有効で `anon`・`authenticated` の権限がなく、SECURITY DEFINER の RPC（`search_path=''`）の中だけで使う。
- 照合は、有効なキーそれぞれの salt で提示されたキーをハッシュし、32 バイトの値を比べる。かかる時間は提示したキーがどこまで合っているかに依らない。形の違うキーも失敗に数える。
- 総当たりの抑止: 利用者（匿名 ID）ごとに 1 分に 5 回失敗すると、正しいキーでも 1 分間 `too-many-attempts`。同じ利用者の確認は 1 つずつ行う（並列の推測で数を抜けない）。失敗を記録に残すため、キーの失敗は例外ではなく `{"error": "host-key-invalid"}` を返し、transport がエラーにする。
- キーの作成・交換・取り消しは [F10 の記録](SQL_MIGRATION_F10.md) の手順で行う。リポジトリに本物のキーを置かない。
- ホストが通信を失っても、ほかの参加者がホストになることはない。予約した開始は時刻に始まる（F07）。担当者は別の端末でホスト用リンクを開けば `resumeHost` でホストに戻る。

## ニックネーム（F10）

- 1〜12 文字。空白（全角・NBSP などの Unicode の空白を含む）の続きは 1 つにし、前後の空白を除いて保存する。Unicode の一般カテゴリ Cc（制御文字）と Cf（ゼロ幅・双方向の上書き・BOM・U+0600 などの書式文字）はすべて使えない（SQL と状態層で同じ集合）。
- ルームの active メンバーの間で重ならない。比べるときは NFKC（全角・半角をそろえる）、空白を除く、小文字にする。「ＭＯＭＯ」と「momo」、「も　も」と「もも」は同じ名前。退室した人の名前は空く（戻ったときに使われていれば、名前を選ばない再参加では別の名前になる）。
- 使われている名前は `name-taken`。サーバーが空いていると確かめた候補を付ける（「もも」→「もも2」、「もも2」→「もも3」。12 文字に収まるよう短くする）。Supabase では例外の `hint`、transport では `RoomContractError.suggestion`、状態層では `nameSuggestion` に入る。
- 名前を選ばずに入ると「ゲスト さくら12」のような名前を付ける（12 の単語と数字）。画面は入った後の `self.nickname` を見せ、「自分で名前を決める」は `rename` を使う。
- 名前の変更で権限は変わらない。ニックネームは表示だけで、本人の識別は匿名 ID。

## 開始の人数（F13）

- ラウンドを始めるには、ホスト以外の active メンバー（退室していない席）が **2 人以上** 必要。ホストを含めて 3 人以上。オンラインかどうか・準備OKかどうかでは数えない（準備OKの人が 1 人以上という `nobody-ready` の条件は別に残る）。ひとりで回すガチャ（ルームでない）は対象外。
- 「今すぐ開始」（`start`）は、足りなければ `need-more-players`（「ガチャを始めるには、ホストのほかに2人以上が必要です。」）。確認の順は `host-required` → `stale-round` → `round-active` → `need-more-players` → `nobody-ready` → `sold-out` → `insufficient-coins`。失敗時はコイン・在庫・roundNo・ready・予約を変えない。ピッチモードでも同じ。
- 予約は人数が足りなくてもできる（人が集まる前にホストが決めるため）。時刻を過ぎても足りなければ **始めずに待つ**: `scheduledAt` は残り、`lastSchedule` も付かない。ホストは待っている予約を変更・取り消しでき、「今すぐ開始」は `need-more-players`。2 人目が入った `join` の中で開始する（入った人も数に入る。入った直後は準備前なので抽選の対象ではない）。退室した人の再入室も同じ。
- SQL は内部の `lp_guest_count(room)`（実行権限なし）で数え、`lp_draw` が `need-more-players` を出し、`lp_fire_schedule` は足りなければ何もせず戻る。どちらも部屋行を `FOR UPDATE` で持った中で数える。人数待ちの間、snapshot は時刻を過ぎた予約のために部屋行を `FOR UPDATE` で取る（待っている部屋は 2 人以下なので競合は小さい）。
- 画面は上限を出さず、「集まっている人 N人」と、足りないときは「あと N 人で始められます」だけを出す（状態層の `playersNeeded`・`playersNeededMessage`）。予約の人数待ちは `scheduleWaiting`・`scheduleWaitingMessage`（「開始の時刻になりました。あと N 人集まると始まります。」）。

## 予約開始（F07）

- ホストは「1・3・5・10 分後に開始」を選ぶ。全員の snapshot に `scheduledAt` が入り、UI は `serverOffset` で補正した秒読みを出す（`RoomState.secondsToScheduled`）。開始前ならホストは変更・取り消しでき、「今すぐ開始」（`start`）も使える。
- cron は使わない。`scheduledAt` 以後に **どの active メンバーの snapshot でも**（15 秒のポーリング、`scheduledAt` 直後の再取得）サーバーが開始を 1 回だけ実行する。部屋をロックするほかの RPC（`join`・`ready`・`start`・`schedule`・`setPitchMode`・`leave`、F10 の `create`・`resumeHost`・`rename`）も、ロックの直後に時刻を過ぎた予約を先に実行してから本来の処理をする（`lp_fire_due`）。そのため時刻の後の変更・取り消し・「今すぐ開始」で予約が消えることはない（取り消しは何もせず、変更と今すぐ開始は `round-active`・`stale-round`）。本来の処理が失敗した場合は、実行した開始も同じ取引で取り消され、次の snapshot でもう一度実行する。ホストが不在でも始まる。対象はその時点でオンラインの準備済みメンバーで、売り切れ・コイン不足・全員分の取り消しは `start` と同じ。
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

コアの SQL は T14 で正式 migration（`supabase/migrations/`）にし、専用の検証プロジェクトに適用した（[T14 の記録](SQL_MIGRATION_T14.md)）。予約開始・ピッチモード・100 席は F07 の migration で追加・適用した（[F07 の記録](SQL_MIGRATION_F07.md)）。ホスト用リンク・ホスト交代の廃止・ニックネームは F10 の migration で追加・適用した（[F10 の記録](SQL_MIGRATION_F10.md)）。開始の人数は F13 の migration で追加・適用した（[F13 の記録](SQL_MIGRATION_F13.md)）。各自で開ける（#88）は migration `lp_open_each` で追加・適用した（[#88 の記録](SQL_MIGRATION_88.md)）。Realtime の受信ポリシー `supabase/drafts/optional_broadcast.sql` は、Realtime の初期化後に適用する草案のまま。F15 で、本番・確認用プレビュー・CI のビルドをこのプロジェクトに接続した（`.env.production` の URL と publishable キー。[F15 の記録](MULTI_DEVICE.md)）。Realtime は未初期化のため起床通知は使われず、ポーリングと時刻での取り直しで動く。ブラウザからの HTTP 経路、多数の端末（最大 100 台）の実接続、実 iPhone の遅延・再接続は未検証（この作業環境から `*.supabase.co` へ接続できない）で、担当者の実機の確認手順を F15 の記録に置いた。`supabaseTransport` は型上の共通実装。画面（F05）は `configuredTransport()` があればそれを（E2E は `localStorage` の `lastpiece_room_force_demo=1` で使わない、F15）、なければ同じブラウザのタブの間だけで動く端末内デモ（`MockRoomServer` を localStorage に置く、`src/app/sharedRoom.ts`）を使い、デモであることを画面に出す。旧 `useSimulatedRoom` はなくした。

画面から使う状態層は `src/realtime/roomController.ts` の `createRoomController` と React 用の `useSharedRoom`（F05a）。この契約の時刻補正、20 秒以内のポーリング、`startsAt` での再取得、通信断からの再接続、request の再利用、失敗コードの日本語化をここで行う。F07 で予約（`schedule`、`scheduledAt` での再取得、`secondsToScheduled`、`scheduleOptions`、`scheduleNotice`）とピッチモード（`setPitchMode`、`pitchMode`、`roundGuaranteed`）を加えた。F10 でホスト用キー（`createAsHost`、`resumeHost`、`hostKey`、`forgetHostKey`。キーはこの端末の `localStorage`）と名前（`join(invite, null)`、`rename`、`nameSuggestion`、`canRename`）を加え、`claimHost`・`canClaim` を外して `hostOnline` にした。F13 で人数（`guestCount`・`playersNeeded`・`scheduleWaiting`、`canStart` と `startBlockedBy: 'need-more-players'`）を加えた。画面は F05 で接続した（`src/screens/Room.tsx`、状態から画面を選ぶのは `src/app/roomView.ts`）。

**AI 非視覚レビュー:** 全員同時の公開時刻、再接続後の本人の当たり、ホスト不在でも予約どおりに始まることを定義した（参加者によるホスト交代は F10 で廃止）。結果の先見え・二重減算・上限を超える入室を防ぐことで、友達と開ける期待を損なわない。対象ファンの行動観察は未実施。