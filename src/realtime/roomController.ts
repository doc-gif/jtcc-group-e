import {
  errorMessage, RoomContractError, SHARED_CAPACITY, SHARED_PRICE, SHARED_SCHEDULE_EXPIRY_MARGIN_MS, SHARED_SCHEDULE_MINUTES,
  scheduleMessage, secondsUntil, serverOffset,
  type Member, type RoomErrorCode, type RoomTransport, type Round, type ScheduleMinutes, type ScheduleOutcome,
  type SharedPrize, type Snapshot,
} from './protocol'

/** 接続中のポーリング間隔。契約の上限 20 秒より短くし、SQL の 10 秒間隔の heartbeat と両立させる。 */
export const ROOM_POLL_MS = 15_000
/** startsAt の直後に再取得するまでの余裕。結果は必ずサーバーの snapshot から受け取る。 */
export const ROOM_REVEAL_MARGIN_MS = 250
/** 通信失敗時の再試行間隔。最後の値を上限として繰り返す。 */
export const ROOM_RETRY_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const

const ERROR_CODES = Object.keys({
  'auth-required': true, 'invalid-request': true, 'invalid-name': true, 'invalid-ready': true, 'invalid-round': true,
  'room-full': true, 'room-unavailable': true, 'host-required': true, 'host-online': true,
  'round-active': true, 'nobody-ready': true, 'sold-out': true, 'insufficient-coins': true, 'stale-round': true,
  'invalid-schedule': true,
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
}

export type RoomPhase =
  | 'idle' | 'connecting' | 'lobby' | 'ready' | 'countdown' | 'opening' | 'results' | 'cooldown'
  | 'unavailable' | 'reconnecting'
export type RoomAction = 'create' | 'join' | 'ready' | 'start' | 'schedule' | 'pitch' | 'claim' | 'leave'
export interface RoomNotice { code: RoomErrorCode | null; message: string }
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
  /** 画面には taken だけを「N人が集まっています」として出す。capacity は内部の上限で表示しない。 */
  seats: { taken: number; capacity: number; full: boolean }
  /** 契約の開始条件に数える人数（ホストを含む、オンラインで準備済み）。 */
  readyOnline: number
  /** ホスト以外のオンライン準備済み人数（デザイン T10 の表示用）。 */
  readyOthers: number
  balance: number | null
  canReady: boolean
  canStart: boolean
  /** ホストが開始できない理由。errorMessage(code) で案内に使える。 */
  startBlockedBy: 'host-required' | 'round-active' | 'nobody-ready' | null
  canClaim: boolean
  /** countdown は startsAt まで、results/cooldown は nextReadyAt までの秒数。 */
  secondsLeft: number | null
  round: Round | null
  /** 最新ラウンドで公開済みの自分の賞品。 */
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
  create(name: string): Promise<RoomResult>
  join(invite: string, name: string): Promise<RoomResult>
  /** 既に参加しているルームへ戻る（再読み込み後など）。 */
  open(roomId: string): Promise<void>
  setReady(ready: boolean): Promise<RoomResult>
  start(): Promise<RoomResult>
  /** ホストだけ。1・3・5・10 分後に開始を予約する。null で取り消す。ホストが不在でも時刻になれば始まる。 */
  schedule(minutes: ScheduleMinutes | null): Promise<RoomResult>
  /** ホストだけ。ピッチモードを切り替える。次に始まるラウンドから効く。 */
  setPitchMode(on: boolean): Promise<RoomResult>
  claimHost(): Promise<RoomResult>
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
  const listeners = new Set<() => void>()
  const timers = new Set<unknown>()
  const seenKey = (room: string, roundNo: number) => `${room}\u0000${roundNo}`
  const seen = new Set(Object.entries(options.seenResults ?? {}).flatMap(([room, rounds]) => rounds.map(roundNo => seenKey(room, roundNo))))

  let attached = false
  let stopWake: (() => void) | null = null
  let unwatch: (() => void) | null = null
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
    const locked = round !== null && serverNow < Date.parse(round.nextReadyAt)
    const myResults = snap?.myResults ?? []
    const unseenResults = snap ? myResults.filter(result => !seen.has(seenKey(snap.id, result.roundNo))) : []
    const isHost = snap !== null && snap.host === snap.self
    const readyOnline = members.filter(member => member.ready && member.online).length
    const readyOthers = members.filter(member => member.ready && member.online && member.id !== snap?.host).length
    const host = members.find(member => member.id === snap?.host)
    const live = connection === 'ok' && snap !== null

    let phase: RoomPhase
    if (connection === 'unavailable') phase = 'unavailable'
    else if (!roomId) phase = busy === 'create' || busy === 'join' ? 'connecting' : 'idle'
    else if (connection === 'reconnecting') phase = 'reconnecting'
    else if (!snap) phase = 'connecting'
    else if (round && round.results === null) phase = serverNow < Date.parse(round.startsAt) ? 'countdown' : 'opening'
    else if (round && !dismissed.has(round.number)
      && (locked || watchedPending.has(round.number) || unseenResults.some(result => result.roundNo === round.number))) phase = 'results'
    else if (locked) phase = 'cooldown'
    else phase = self?.ready ? 'ready' : 'lobby'

    let secondsLeft: number | null = null
    if (round && (phase === 'countdown' || phase === 'opening')) secondsLeft = secondsUntil(round.startsAt, now, offset)
    else if (round && locked && (phase === 'results' || phase === 'cooldown')) secondsLeft = secondsUntil(round.nextReadyAt, now, offset)

    const startBlockedBy = !isHost ? 'host-required' : locked ? 'round-active' : readyOnline < 1 ? 'nobody-ready' : null
    const balance = snap?.balance ?? null
    const scheduledAt = snap?.scheduledAt ?? null
    const lastSchedule = snap?.lastSchedule ?? null
    const expiresAt = snap ? Date.parse(snap.expiresAt) : 0
    // 開始できなかった理由はホストにだけ出す。閉じた後、次の予約・開始の後（古い理由）は出さない。
    const staleNotice = lastSchedule !== null && (dismissedNotice === lastSchedule.scheduledAt
      || (round !== null && Date.parse(round.startsAt) > Date.parse(lastSchedule.scheduledAt)))
    const noticeText = lastSchedule && isHost && !scheduledAt && !staleNotice ? scheduleMessage(lastSchedule.status) : null
    const noticeCode = lastSchedule?.status
    return {
      phase, roomId, snapshot: snap, self, members, isHost,
      seats: { taken: members.length, capacity: SHARED_CAPACITY, full: members.length >= SHARED_CAPACITY },
      readyOnline, readyOthers, balance,
      canReady: live && self !== null && !locked && busy === null && (self.ready || (balance ?? 0) >= SHARED_PRICE),
      canStart: live && busy === null && startBlockedBy === null,
      startBlockedBy: snap ? startBlockedBy : null,
      canClaim: live && busy === null && self !== null && !isHost && !host?.online,
      secondsLeft, round,
      myPrize: round?.results?.find(result => result.userId === snap?.self)?.prize ?? null,
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
      serverOffset: offset, busy, error,
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
      const at = Date.parse(scheduledAt)
      const due = at + ROOM_REVEAL_MARGIN_MS - serverNow
      after(due > 0 ? due : 1000, () => void sync())
      const remaining = at - serverNow
      if (remaining > 0) after(remaining % 1000 || 1000, emit)
    }
    const round = snapshot?.round
    if (!round) return
    const startsAt = Date.parse(round.startsAt)
    // 公開時刻の直後に取り直す。過ぎても未公開なら、サーバーの時刻に追いつくまで 1 秒ごとに取り直す。
    const reveal = startsAt + ROOM_REVEAL_MARGIN_MS - serverNow
    if (round.results === null) after(reveal > 0 ? reveal : 1000, () => void sync())
    const target = round.results === null ? startsAt : Date.parse(round.nextReadyAt)
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

  function watch() {
    unwatch?.()
    unwatch = null
    const room = roomId
    if (!room) return
    try {
      unwatch = transport.subscribe(room, () => { if (roomId === room) void sync() })
    } catch {
      // 購読は起床通知だけ。失敗してもポーリングで最新状態を取得する。
    }
  }

  function enterRoom(id: string) {
    unwatch?.()
    unwatch = null
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
      unwatch?.()
      unwatch = null
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
      error = { code, message: errorMessage(caught) }
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
      unwatch?.()
      unwatch = null
    },
    serverNow: () => clock.now() + offset,
    create(name) {
      const request = pendingCreate ??= requestId()
      return perform('create', () => transport.create(request, name), {
        enter: true,
        success: () => { pendingCreate = null },
        failure: code => { if (code === 'room-unavailable') pendingCreate = null },
      })
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
    claimHost() {
      const room = requireRoom()
      if (!room) return Promise.resolve({ ok: false, error: null })
      return perform('claim', () => transport.claim(room))
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
