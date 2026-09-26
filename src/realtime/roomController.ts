import { browserHostKeyStore, HOST_KEY_PATTERN, type HostKeyStore } from './hostKey'
import {
  errorMessage, guestCount as countGuests, nameSuggestion, playersNeeded as needed, playersNeededMessage as neededText, RoomContractError, SHARED_CAPACITY, SHARED_PRICE, SHARED_SCHEDULE_EXPIRY_MARGIN_MS, SHARED_SCHEDULE_MINUTES,
  scheduleMessage, scheduleWaitingMessage as waitingText, secondsUntil, serverOffset,
  type Member, type RoomErrorCode, type RoomTransport, type Round, type ScheduleMinutes, type ScheduleOutcome,
  type SharedPrize, type Snapshot,
} from './protocol'

/** 接続中のポーリング間隔。契約の上限 20 秒より短くし、SQL の 10 秒間隔の heartbeat と両立させる。 */
export const ROOM_POLL_MS = 15_000
/** 自分のカプセルを開ける間（startsAt〜revealAt）に、起床通知がないとき、ほかの人が開けたかを取り直す間隔（#88）。 */
export const ROOM_OPENING_POLL_MS = 2_000
/** startsAt の直後に再取得するまでの余裕。結果は必ずサーバーの snapshot から受け取る。 */
export const ROOM_REVEAL_MARGIN_MS = 250
/** 通信失敗時の再試行間隔。最後の値を上限として繰り返す。 */
export const ROOM_RETRY_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const

const ERROR_CODES = Object.keys({
  'auth-required': true, 'invalid-request': true, 'invalid-name': true, 'invalid-ready': true, 'invalid-round': true,
  'room-full': true, 'room-unavailable': true, 'host-required': true,
  'round-active': true, 'nobody-ready': true, 'sold-out': true, 'insufficient-coins': true, 'stale-round': true,
  'invalid-schedule': true, 'host-key-invalid': true, 'too-many-attempts': true, 'no-room': true, 'name-taken': true,
  'rename-locked': true, 'need-more-players': true,
} satisfies Record<RoomErrorCode, true>) as RoomErrorCode[]

/** 契約の失敗コードを取り出す。通信や SQL の想定外エラーは null（画面には一般的な文言だけを出す）。 */
export function roomErrorCode(error: unknown): RoomErrorCode | null {
  if (error instanceof RoomContractError) return error.code
  const message = error instanceof Error ? error.message : String(error)
  return ERROR_CODES.find(code => message.includes(code)) ?? null
}

export interface RoomClock {
  now(): number
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

/** 呼び出し時に globalThis を参照するので、vitest の偽タイマーにも従う。 */
export const systemClock: RoomClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
}

/** タブ復帰とオンライン復帰で再取得する。ブラウザ以外では何もしない。 */
export function browserWake(wake: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
  const visible = () => { if (document.visibilityState === 'visible') wake() }
  document.addEventListener('visibilitychange', visible)
  window.addEventListener('online', wake)
  return () => {
    document.removeEventListener('visibilitychange', visible)
    window.removeEventListener('online', wake)
  }
}

export interface RoomControllerOptions {
  clock?: RoomClock
  /** create/start の request UUID。再試行中は同じ値を使い続ける。 */
  requestId?: () => string
  /** タブ復帰などの起床通知。既定は visibilitychange と online。 */
  onWake?: (wake: () => void) => () => void
  /** 画面側で保存した「確認済みの自分の結果」。roundNo は部屋ごとに 1 から始まるので room ID ごとに持つ。 */
  seenResults?: Readonly<Record<string, readonly number[]>>
  /** この端末だけに保存するホスト用キー。既定は localStorage（使えなければ保存しない）。 */
  hostKeys?: HostKeyStore
}

export type RoomPhase =
  | 'idle' | 'connecting' | 'lobby' | 'ready' | 'countdown'
  /** #88: startsAt から、抽選に入った本人が自分のカプセルをまだ開けていない。 */
  | 'opening'
  /** #88: 自分のカプセルを開けた、または見守る人（抽選に入っていない）。全員の結果（revealAt）を待つ。 */
  | 'waiting'
  | 'results' | 'cooldown'
  | 'unavailable' | 'reconnecting'
export type RoomAction = 'create' | 'join' | 'resume' | 'ready' | 'start' | 'schedule' | 'pitch' | 'rename' | 'open' | 'leave'
export interface RoomNotice {
  code: RoomErrorCode | null
  message: string
  /** name-taken のときだけ。サーバーが空いていると確かめた名前（「もも2」で入る、などに使う）。 */
  suggestion?: string
}
/** error が null の失敗は、別の操作の処理中で送信しなかったことを表す。 */
export type RoomResult = { ok: true; error: null } | { ok: false; error: RoomNotice | null }
export type MyResult = Snapshot['myResults'][number]

export interface RoomState {
  phase: RoomPhase
  roomId: string | null
  /** 最後に受け取った snapshot。再接続中も保持する。 */
  snapshot: Snapshot | null
  self: Member | null
  members: Member[]
  isHost: boolean
  /** ホストが接続中か。不在でも交代はない（予約した開始は時刻になれば始まる）。 */
  hostOnline: boolean
  /** この端末に保存したホスト用キー。あればホスト用の操作（作成・ホストに戻る）を出せる。 */
  hostKey: string | null
  /** 直前の作成・参加・名前の変更が name-taken だったときの、空いている名前の候補。 */
  nameSuggestion: string | null
  /** 本人の名前を変えられるか（ロビーから）。 */
  canRename: boolean
  /** 画面には taken だけを「N人が集まっています」として出す。capacity は内部の上限で表示しない。 */
  seats: { taken: number; capacity: number; full: boolean }
  /** ホスト以外の active メンバーの人数（退室していない席。オンラインかどうかは問わない）。 */
  guestCount: number
  /**
   * 始めるのにあと何人必要か（F13: ホストのほかに 2 人以上）。足りていれば 0。
   * 参加前（snapshot なし）は 0。
   */
  playersNeeded: number
  /** 人数が足りないときの案内「あと N 人で始められます」。足りていれば null。ホスト・参加者の両方に出す。 */
  playersNeededMessage: string | null
  /** 予約の時刻を過ぎたが人数が足りず、開始を待っている。2 人目が入った時点でサーバーが始める。 */
  scheduleWaiting: boolean
  /** scheduleWaiting のときの案内「開始の時刻になりました。あと N 人集まると始まります。」。それ以外は null。 */
  scheduleWaitingMessage: string | null
  /** 契約の開始条件に数える人数（ホストを含む、オンラインで準備済み）。 */
  readyOnline: number
  /** ホスト以外のオンライン準備済み人数（デザイン T10 の表示用）。 */
  readyOthers: number
  balance: number | null
  canReady: boolean
  /** ホストが今すぐ開始できるか。人数（playersNeeded が 0）も含む。 */
  canStart: boolean
  /** ホストが開始できない理由。errorMessage(code) で案内に使える。SQL の確認と同じ順。 */
  startBlockedBy: 'host-required' | 'round-active' | 'need-more-players' | 'nobody-ready' | null
  /** countdown は startsAt まで、opening/waiting は revealAt（全員の結果）まで、results/cooldown は nextReadyAt までの秒数。 */
  secondsLeft: number | null
  round: Round | null
  /** 最新ラウンドの抽選に入っている（自分のカプセルがある）。見守る人は false。 */
  isEntrant: boolean
  /** 最新ラウンドの自分のカプセルを開けた。 */
  hasOpened: boolean
  /** 最新ラウンドで開けた人・抽選に入った人の数（「みんなが開けています N/M 人」）。 */
  openedCount: number
  entrantCount: number
  /** 自分のカプセルを開けられるか（opening の間）。 */
  canOpen: boolean
  /** 最新ラウンドの自分の賞品。開けた後（全員の結果の前でも）か、全員の結果の後に決まる。 */
  myPrize: SharedPrize | null
  myResults: MyResult[]
  /** まだ確認していない公開済みの自分の結果（再接続後の回収用）。 */
  unseenResults: MyResult[]
  /** ホストが予約した開始時刻（サーバー UTC）。予約がなければ null。 */
  scheduledAt: string | null
  /** scheduledAt までの秒数（serverOffset で補正）。予約がなければ null。 */
  secondsToScheduled: number | null
  /** 今選べる「◯分後に開始」。ルームの期限の 1 分前を超えるものは除く。ホスト以外は空。 */
  scheduleOptions: ScheduleMinutes[]
  /** ホストが予約・変更・取り消しできるか。 */
  canSchedule: boolean
  /** ピッチモード（各ラウンドで 1 人に目玉を確定）がオンか。全員に見せる。 */
  pitchMode: boolean
  canSetPitchMode: boolean
  /** 最新ラウンドで目玉の確定枠を使ったか。目玉が売り切れのときは false（通常の抽選）。 */
  roundGuaranteed: boolean
  lastSchedule: ScheduleOutcome | null
  /** 予定の時刻に開始できなかった理由。ホストだけ。次の予約・開始の後と、閉じた後は null。 */
  scheduleNotice: RoomNotice | null
  serverOffset: number
  /**
   * 起床通知（Supabase Realtime）の購読の状態。live はほかの端末の入室・準備・開始が数秒で届く。
   * polling は購読できていない（未接続・失敗・切断）ので、ROOM_POLL_MS ごとのポーリングだけで取り直す。画面には出さない。
   */
  realtime: 'live' | 'polling'
  busy: RoomAction | null
  error: RoomNotice | null
}

export interface RoomController {
  getState(): RoomState
  subscribe(listener: () => void): () => void
  /** タイマー・起床通知・Realtime のヒントを有効にする。何度呼んでもよい。 */
  attach(): void
  /** すべてのタイマーと購読を止める。状態は保持する。 */
  detach(): void
  /** serverOffset で補正した現在のサーバー時刻（ms）。 */
  serverNow(): number
  /**
   * ホスト用キーでルームを作る。key を省くと保存済みのキーを使う。成功したキーはこの端末に保存し、
   * host-key-invalid なら保存済みのそのキーを消す。name を省く（null）とサーバーが重ならない名前を付ける。
   */
  createAsHost(key?: string | null, name?: string | null): Promise<RoomResult>
  /**
   * ホスト用キーで、別の端末から自分のルームのホストに戻る。roomId を省くとそのキーでいちばん新しい開いているルーム。
   * 開いているルームがなければ no-room（createAsHost を案内する）。
   */
  resumeHost(key?: string | null, roomId?: string | null): Promise<RoomResult>
  /**
   * 招待で参加する。name が null ならサーバーが重ならない名前（例「ゲスト さくら12」）を付け、state.self.nickname で見せる。
   * 使われている名前は name-taken で、state.nameSuggestion に空いている候補が入る。
   */
  join(invite: string, name: string | null): Promise<RoomResult>
  /** ロビーで本人の名前を変える。重なる名前は join と同じく name-taken と候補。 */
  rename(name: string): Promise<RoomResult>
  /** この端末に保存したホスト用キーを消す。 */
  forgetHostKey(): void
  /** 既に参加しているルームへ戻る（再読み込み後など）。 */
  open(roomId: string): Promise<void>
  setReady(ready: boolean): Promise<RoomResult>
  start(): Promise<RoomResult>
  /** ホストだけ。1・3・5・10 分後に開始を予約する。null で取り消す。ホストが不在でも時刻になれば始まる。 */
  schedule(minutes: ScheduleMinutes | null): Promise<RoomResult>
  /** ホストだけ。ピッチモードを切り替える。次に始まるラウンドから効く。 */
  setPitchMode(on: boolean): Promise<RoomResult>
  /** #88: 抽選に入った本人が最新ラウンドの自分のカプセルを開ける（startsAt 以後）。送り直しても同じ。 */
  openCapsule(): Promise<RoomResult>
  leave(): Promise<RoomResult>
  refresh(): Promise<void>
  /** 結果画面を閉じ、今ある自分の結果を確認済みにする。 */
  dismissResults(): void
  /** 予約で開始できなかった案内を閉じる。 */
  dismissScheduleNotice(): void
}

type Connection = 'ok' | 'reconnecting' | 'unavailable'

export function createRoomController(transport: RoomTransport, options: RoomControllerOptions = {}): RoomController {
  const clock = options.clock ?? systemClock
  const requestId = options.requestId ?? (() => crypto.randomUUID())
  const onWake = options.onWake ?? browserWake
  const hostKeys = options.hostKeys ?? browserHostKeyStore()
  let storedKey = hostKeys.get()
  const saveKey = (key: string | null) => { storedKey = key; hostKeys.set(key) }
  /** 別のタブが保存・削除したかもしれないので、使う直前に読み直す。 */
  const currentKey = () => (storedKey = hostKeys.get())
  const listeners = new Set<() => void>()
  const timers = new Set<unknown>()
  const seenKey = (room: string, roundNo: number) => `${room}\u0000${roundNo}`
  const seen = new Set(Object.entries(options.seenResults ?? {}).flatMap(([room, rounds]) => rounds.map(roundNo => seenKey(room, roundNo))))

  let attached = false
  let stopWake: (() => void) | null = null
  let unwatch: (() => void) | null = null
  let hinted = false
  let generation = 0
  let roomId: string | null = null
  let snapshot: Snapshot | null = null
  let lastServerTime = -Infinity
  let lastSyncAt = 0
  let samples: { offset: number; rtt: number }[] = []
  let offset = 0
  let connection: Connection = 'ok'
  let retries = 0
  let fetching = false
  let fetchAgain = false
  let busy: RoomAction | null = null
  let error: RoomNotice | null = null
  let pendingCreate: string | null = null
  let pendingStart: { request: string; expected: number } | null = null
  let dismissed = new Set<number>()
  let watchedPending = new Set<number>()
  let dismissedNotice: string | null = null
  let state = derive()

  function derive(): RoomState {
    const now = clock.now()
    const serverNow = now + offset
    const snap = snapshot
    const members = snap?.members ?? []
    const self = snap ? members.find(member => member.id === snap.self) ?? null : null
    const round = snap?.round ?? null
    const entrants = round?.entrants ?? []
    const isEntrant = snap !== null && entrants.includes(snap.self)
    const myPrize = round && snap ? snap.myResults.find(result => result.roundNo === round.number)?.prize ?? null : null
    // 開けた応答（myResults に自分の賞品）が先に届けば、opened の一覧を待たずに開けたとみなす。
    const hasOpened = snap !== null && ((round?.opened ?? []).includes(snap.self) || (isEntrant && myPrize !== null))
    const locked = round !== null && serverNow < Date.parse(round.nextReadyAt)
    const myResults = snap?.myResults ?? []
    const unseenResults = snap ? myResults.filter(result => !seen.has(seenKey(snap.id, result.roundNo))) : []
    const isHost = snap !== null && snap.host === snap.self
    const readyOnline = members.filter(member => member.ready && member.online).length
    const readyOthers = members.filter(member => member.ready && member.online && member.id !== snap?.host).length
    const hostOnline = members.some(member => member.id === snap?.host && member.online)
    const guests = snap ? countGuests(snap) : 0
    const missing = snap ? needed(guests) : 0
    const live = connection === 'ok' && snap !== null

    let phase: RoomPhase
    if (connection === 'unavailable') phase = 'unavailable'
    else if (!roomId) phase = busy === 'create' || busy === 'join' || busy === 'resume' ? 'connecting' : 'idle'
    else if (connection === 'reconnecting') phase = 'reconnecting'
    else if (!snap) phase = 'connecting'
    else if (round && round.results === null) {
      phase = serverNow < Date.parse(round.startsAt) ? 'countdown' : isEntrant && !hasOpened ? 'opening' : 'waiting'
    }
    else if (round && !dismissed.has(round.number)
      && (locked || watchedPending.has(round.number) || unseenResults.some(result => result.roundNo === round.number))) phase = 'results'
    else if (locked) phase = 'cooldown'
    else phase = self?.ready ? 'ready' : 'lobby'

    let secondsLeft: number | null = null
    if (round && phase === 'countdown') secondsLeft = secondsUntil(round.startsAt, now, offset)
    else if (round && (phase === 'opening' || phase === 'waiting')) secondsLeft = secondsUntil(round.revealAt, now, offset)
    else if (round && locked && (phase === 'results' || phase === 'cooldown')) secondsLeft = secondsUntil(round.nextReadyAt, now, offset)

    const startBlockedBy = !isHost ? 'host-required' : locked ? 'round-active' : missing > 0 ? 'need-more-players'
      : readyOnline < 1 ? 'nobody-ready' : null
    const balance = snap?.balance ?? null
    const scheduledAt = snap?.scheduledAt ?? null
    const scheduleWaiting = scheduledAt !== null && missing > 0 && serverNow >= Date.parse(scheduledAt)
    const lastSchedule = snap?.lastSchedule ?? null
    const expiresAt = snap ? Date.parse(snap.expiresAt) : 0
    // 開始できなかった理由はホストにだけ出す。閉じた後、次の予約・開始の後（古い理由）は出さない。
    const staleNotice = lastSchedule !== null && (dismissedNotice === lastSchedule.scheduledAt
      || (round !== null && Date.parse(round.startsAt) > Date.parse(lastSchedule.scheduledAt)))
    const noticeText = lastSchedule && isHost && !scheduledAt && !staleNotice ? scheduleMessage(lastSchedule.status) : null
    const noticeCode = lastSchedule?.status
    return {
      phase, roomId, snapshot: snap, self, members, isHost, hostOnline,
      hostKey: storedKey,
      nameSuggestion: error?.code === 'name-taken' ? error.suggestion ?? null : null,
      canRename: live && busy === null && self !== null && (phase === 'lobby' || phase === 'ready'),
      seats: { taken: members.length, capacity: SHARED_CAPACITY, full: members.length >= SHARED_CAPACITY },
      guestCount: guests, playersNeeded: missing, playersNeededMessage: neededText(missing),
      scheduleWaiting, scheduleWaitingMessage: scheduleWaiting ? waitingText(missing) : null,
      readyOnline, readyOthers, balance,
      canReady: live && self !== null && !locked && busy === null && (self.ready || (balance ?? 0) >= SHARED_PRICE),
      canStart: live && busy === null && startBlockedBy === null,
      startBlockedBy: snap ? startBlockedBy : null,
      secondsLeft, round,
      isEntrant, hasOpened,
      openedCount: round?.opened.length ?? 0, entrantCount: entrants.length,
      canOpen: live && busy === null && phase === 'opening',
      myPrize,
      myResults, unseenResults,
      scheduledAt,
      secondsToScheduled: scheduledAt ? secondsUntil(scheduledAt, now, offset) : null,
      scheduleOptions: isHost ? SHARED_SCHEDULE_MINUTES.filter(minutes => serverNow + minutes * 60_000 <= expiresAt - SHARED_SCHEDULE_EXPIRY_MARGIN_MS) : [],
      canSchedule: live && busy === null && isHost && !locked,
      pitchMode: snap?.pitchMode ?? false,
      canSetPitchMode: live && busy === null && isHost,
      roundGuaranteed: round?.guaranteed ?? false,
      lastSchedule,
      scheduleNotice: noticeText === null ? null : {
        code: noticeCode === 'nobody-ready' || noticeCode === 'sold-out' || noticeCode === 'insufficient-coins' ? noticeCode : null,
        message: noticeText,
      },
      serverOffset: offset, realtime: hinted ? 'live' : 'polling', busy, error,
    }
  }

  function emit() {
    state = derive()
    reschedule()
    for (const listener of [...listeners]) listener()
  }

  function after(ms: number, run: () => void) {
    const handle = clock.setTimeout(() => { timers.delete(handle); run() }, Math.max(0, ms))
    timers.add(handle)
  }

  function clearTimers() {
    for (const handle of timers) clock.clearTimeout(handle)
    timers.clear()
  }

  function reschedule() {
    clearTimers()
    if (!attached || !roomId || connection === 'unavailable') return
    const now = clock.now()
    if (connection === 'reconnecting') {
      after(ROOM_RETRY_MS[Math.min(retries, ROOM_RETRY_MS.length) - 1] ?? ROOM_RETRY_MS[0], () => void sync())
      return
    }
    after(lastSyncAt + ROOM_POLL_MS - now, () => void sync())
    const serverNow = now + offset
    const scheduledAt = snapshot?.scheduledAt
    if (scheduledAt) {
      // 予約の時刻の直後に取り直す。この snapshot がサーバーで開始を実行する（ホストが不在でも）。
      // 人数待ち（F13）なら 1 秒ごとには取り直さない。2 人目の参加の通知と通常のポーリングで受け取る。
      const at = Date.parse(scheduledAt)
      const due = at + ROOM_REVEAL_MARGIN_MS - serverNow
      if (due > 0) after(due, () => void sync())
      else if (!state.scheduleWaiting) after(1000, () => void sync())
      const remaining = at - serverNow
      if (remaining > 0) after(remaining % 1000 || 1000, emit)
    }
    const round = snapshot?.round
    if (!round) return
    const startsAt = Date.parse(round.startsAt)
    const revealAt = Date.parse(round.revealAt)
    // 全員の結果の時刻（revealAt）の直後に取り直す。過ぎても未公開なら、サーバーの時刻に追いつくまで 1 秒ごとに取り直す。
    // 全員が開ければ revealAt は早まる。その知らせは起床通知で届き、届かないとき（ポーリングだけ）は短い間隔で取り直す。
    const reveal = revealAt + ROOM_REVEAL_MARGIN_MS - serverNow
    if (round.results === null) after(reveal > 0 ? reveal : 1000, () => void sync())
    if (round.results === null && !hinted && serverNow >= startsAt - ROOM_OPENING_POLL_MS) after(lastSyncAt + ROOM_OPENING_POLL_MS - now, () => void sync())
    const target = round.results === null ? (serverNow < startsAt ? startsAt : revealAt) : Date.parse(round.nextReadyAt)
    const remaining = target - serverNow
    if (remaining > 0) after(remaining % 1000 || 1000, emit)
  }

  function accept(next: Snapshot, sent: number, received: number) {
    connection = 'ok'
    retries = 0
    lastSyncAt = received
    const serverTime = Date.parse(next.serverTime)
    if (serverTime < lastServerTime) return
    lastServerTime = serverTime
    // 往復が短い標本ほど中点の推定が正確なので、直近 5 件で最短のものを使う。
    samples = [...samples, { offset: serverOffset(next.serverTime, sent, received), rtt: received - sent }].slice(-5)
    offset = samples.reduce((best, sample) => sample.rtt < best.rtt ? sample : best).offset
    snapshot = next
    if (next.round && next.round.results === null) watchedPending.add(next.round.number)
    if (pendingStart && next.roundNo > pendingStart.expected) pendingStart = null
    if (attached && !unwatch) watch()
  }

  function unwatchRoom() {
    unwatch?.()
    unwatch = null
    hinted = false
  }

  function watch() {
    unwatchRoom()
    const room = roomId
    if (!room) return
    let active = true
    let dropped = false
    const stop = (() => {
      try {
        return transport.subscribe(room, () => { if (active && roomId === room) void sync() }, status => {
          if (!active || roomId !== room) return
          const wasLive = hinted
          hinted = status === 'live'
          // 切れていた間の通知は届かないので、つながり直したら一度取り直す（最初の接続は直前の snapshot で足りる）。
          if (hinted && dropped) void sync()
          if (!hinted) dropped = true
          if (hinted !== wasLive) emit()
        })
      } catch {
        // 購読は起床通知だけ。失敗してもポーリングで最新状態を取得する。
        return null
      }
    })()
    unwatch = () => { active = false; stop?.() }
  }

  function enterRoom(id: string) {
    unwatchRoom()
    generation++
    roomId = id
    snapshot = null
    lastServerTime = -Infinity
    lastSyncAt = 0
    samples = []
    offset = 0
    connection = 'ok'
    retries = 0
    fetching = false
    fetchAgain = false
    pendingStart = null
    dismissed = new Set()
    watchedPending = new Set()
    dismissedNotice = null
  }

  function exitRoom() {
    enterRoom('')
    roomId = null
  }

  function fail(caught: unknown) {
    if (roomErrorCode(caught) === 'room-unavailable') {
      connection = 'unavailable'
      unwatchRoom()
    } else {
      connection = 'reconnecting'
      retries++
    }
  }

  async function sync(): Promise<void> {
    const room = roomId
    if (!room || connection === 'unavailable') return
    if (fetching) { fetchAgain = true; return }
    fetching = true
    const current = generation
    const sent = clock.now()
    try {
      const next = await transport.snapshot(room)
      if (current === generation) accept(next, sent, clock.now())
    } catch (caught) {
      if (current === generation) fail(caught)
    }
    if (current !== generation) return
    fetching = false
    emit()
    if (fetchAgain) { fetchAgain = false; await sync() }
  }

  async function perform(action: RoomAction, call: () => Promise<Snapshot>, handle: {
    enter?: boolean; success?: () => void; failure?: (code: RoomErrorCode | null) => void
  } = {}): Promise<RoomResult> {
    if (busy) return { ok: false, error: null }
    if (handle.enter && connection === 'unavailable') exitRoom()
    busy = action
    error = null
    emit()
    const current = generation
    const sent = clock.now()
    try {
      const next = await call()
      handle.success?.()
      if (handle.enter) enterRoom(next.id)
      if (handle.enter || current === generation) accept(next, sent, clock.now())
      return { ok: true, error: null }
    } catch (caught) {
      const code = roomErrorCode(caught)
      const suggestion = nameSuggestion(caught)
      error = suggestion === null ? { code, message: errorMessage(caught) } : { code, message: errorMessage(caught), suggestion }
      handle.failure?.(code)
      // 失敗の理由は最新の snapshot で確かめる。通信断ならここで再接続に入る。
      if (!handle.enter && roomId && current === generation) {
        if (code === 'room-unavailable') fail(caught)
        else void sync()
      }
      return { ok: false, error }
    } finally {
      busy = null
      emit()
    }
  }

  /**
   * 成功したキーを保存する。ただし応答を待つ間に別のタブが別のキーを保存・削除していたら、その値を残す
   * （保存先が要求の開始時の値のままのときだけ書く compare-and-set）。
   */
  function keepKey(before: string | null, key: string) {
    if (currentKey() === before) saveKey(key)
  }

  function forgetKey(key: string) {
    // 応答を待つ間に別のタブが別のキーを保存していたら、それは消さない。
    if (currentKey() === key) saveKey(null)
  }

  /** 形の違うキーはサーバーへ送らずに無効として返す（保存済みなら消す）。 */
  function rejectKey(key: string | null): Promise<RoomResult> {
    if (busy) return Promise.resolve({ ok: false, error: null })
    if (key !== null) forgetKey(key)
    error = { code: 'host-key-invalid', message: errorMessage(new RoomContractError('host-key-invalid')) }
    emit()
    return Promise.resolve({ ok: false, error })
  }

  function requireRoom(): string | null {
    return roomId && snapshot ? roomId : null
  }

  const controller: RoomController = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    attach() {
      if (attached) return
      attached = true
      stopWake = onWake(() => { void sync() })
      if (roomId) watch()
      emit()
      if (roomId && connection === 'ok' && !fetching) void sync()
    },
    detach() {
      attached = false
      clearTimers()
      stopWake?.()
      stopWake = null
      unwatchRoom()
      // 購読の状態だけ polling に戻す（聞き手には知らせない。detach 後の画面更新を起こさない）。
      state = derive()
    },
    serverNow: () => clock.now() + offset,
    createAsHost(key, name = null) {
      const before = currentKey()
      const hostKey = key ?? before
      if (hostKey === null || !HOST_KEY_PATTERN.test(hostKey)) return rejectKey(hostKey)
      const request = pendingCreate ??= requestId()
      return perform('create', () => transport.create(request, hostKey, name), {
        enter: true,
        success: () => { pendingCreate = null; keepKey(before, hostKey) },
        failure: code => {
          if (code === 'room-unavailable') pendingCreate = null
          if (code === 'host-key-invalid') forgetKey(hostKey)
        },
      })
    },
    resumeHost(key, id = null) {
      const before = currentKey()
      const hostKey = key ?? before
      if (hostKey === null || !HOST_KEY_PATTERN.test(hostKey)) return rejectKey(hostKey)
      return perform('resume', () => transport.resumeHost(hostKey, id), {
        enter: true,
        success: () => { keepKey(before, hostKey) },
        failure: code => { if (code === 'host-key-invalid') forgetKey(hostKey) },
      })
    },
    rename(name) {
      const room = requireRoom()
      if (!room || busy || connection !== 'ok') return Promise.resolve({ ok: false, error: null })
      // 名前はロビー（準備中を含む）でだけ変える。開封中に変えると、保存済みの結果と名前が食い違う。
      const { phase } = derive()
      if (phase !== 'lobby' && phase !== 'ready') {
        error = { code: 'rename-locked', message: errorMessage(new RoomContractError('rename-locked')) }
        emit()
        return Promise.resolve({ ok: false, error })
      }
      return perform('rename', () => transport.rename(room, name))
    },
    forgetHostKey() {
      saveKey(null)
      emit()
    },
    join(invite, name) {
      return perform('join', () => transport.join(invite, name), {
        enter: true,
        failure: code => { if (code === 'room-unavailable' && !roomId) connection = 'unavailable' },
      })
    },
    async open(id) {
      enterRoom(id)
      if (attached) watch()
      emit()
      await sync()
    },
    setReady(ready) {
      const room = requireRoom()
      if (!room) return Promise.resolve({ ok: false, error: null })
      return perform('ready', () => transport.ready(room, ready))
    },
    start() {
      const room = requireRoom()
      if (!room || !snapshot) return Promise.resolve({ ok: false, error: null })
      const expected = snapshot.roundNo
      // 応答を受け取れなかった開始は、同じ request と expected で送り直して二重抽選を防ぐ。
      if (!pendingStart || pendingStart.expected !== expected) pendingStart = { request: requestId(), expected }
      const { request } = pendingStart
      return perform('start', () => transport.start(room, request, expected), {
        failure: code => { if (code !== null) pendingStart = null },
      })
    },
    schedule(minutes) {
      const room = requireRoom()
      if (!room) return Promise.resolve({ ok: false, error: null })
      return perform('schedule', () => transport.schedule(room, minutes))
    },
    setPitchMode(on) {
      const room = requireRoom()
      if (!room) return Promise.resolve({ ok: false, error: null })
      return perform('pitch', () => transport.setPitchMode(room, on))
    },
    openCapsule() {
      const room = requireRoom()
      const round = snapshot?.round
      if (!room || !round) return Promise.resolve({ ok: false, error: null })
      return perform('open', () => transport.open(room, round.number))
    },
    async leave() {
      const room = roomId
      if (!room || busy) return { ok: false, error: null }
      busy = 'leave'
      error = null
      emit()
      try {
        await transport.leave(room)
        exitRoom()
        return { ok: true, error: null }
      } catch (caught) {
        const code = roomErrorCode(caught)
        if (code === 'room-unavailable') { exitRoom(); return { ok: true, error: null } }
        error = { code, message: errorMessage(caught) }
        return { ok: false, error }
      } finally {
        busy = null
        emit()
      }
    },
    refresh: () => sync(),
    dismissScheduleNotice() {
      const outcome = snapshot?.lastSchedule
      if (!outcome) return
      dismissedNotice = outcome.scheduledAt
      emit()
    },
    dismissResults() {
      const snap = snapshot
      if (!snap) return
      if (snap.round) dismissed.add(snap.round.number)
      for (const result of snap.myResults) seen.add(seenKey(snap.id, result.roundNo))
      emit()
    },
  }
  return controller
}
