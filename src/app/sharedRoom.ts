import { createContext, useContext, useEffect, useSyncExternalStore } from 'react'
import { MockRoomServer } from '../realtime/mock'
import type { RoomTransport } from '../realtime/protocol'
import { createRoomController, type RoomController, type RoomControllerOptions, type RoomState } from '../realtime/roomController'
import { supabasePhotoSource, type PhotoSource } from '../realtime/photos'
import { configuredClient, configuredTransport } from '../realtime/supabase'
import { paths } from './router'

/** 端末内デモの模擬サーバーの保存先（この端末のブラウザの中だけ。別のスマホとはつながらない）。 */
export const ROOM_DEMO_KEY = 'lastpiece_room_demo_v1'
/** 端末内デモで、ほかのタブに更新を知らせる合図（中身は使わない）。 */
export const ROOM_DEMO_WAKE_KEY = 'lastpiece_room_demo_wake'
/** 端末内デモの参加者 ID。タブごとに別の人として扱う（sessionStorage）。 */
export const ROOM_DEMO_USER_KEY = 'lastpiece_room_demo_user'
/**
 * この値が '1' のブラウザは、ビルドに Supabase の設定があっても端末内デモを使う（E2E・UI/UX 検査用。
 * playwright.config.ts が全ページの localStorage に入れる。テストが実 Supabase へ通信しないため）。
 * 利用者が自分で入れても、その端末が「デモ」と明記されたルームになるだけで、ほかの人には影響しない。
 */
export const ROOM_FORCE_DEMO_KEY = 'lastpiece_room_force_demo'
/** 入ったルームの記録（招待 → ルーム ID・見守りの選択・確認済みの結果）。 */
export const ROOM_RECORDS_KEY = 'lastpiece_rooms_v1'

export type KeyValue = Pick<Storage, 'getItem' | 'setItem'>

/** 保存できない端末（プライベートモード等）でも動くよう、失敗したらこのタブの中だけに持つ。 */
export function safeStorage(open: () => KeyValue | undefined): KeyValue {
  const memory = new Map<string, string>()
  let target: KeyValue | undefined
  try { target = open() } catch { target = undefined }
  return {
    getItem(key) {
      try { const value = target?.getItem(key); if (value !== null && value !== undefined) return value } catch { /* 下の memory を使う */ }
      return memory.get(key) ?? null
    },
    setItem(key, value) {
      memory.set(key, value)
      try { target?.setItem(key, value) } catch { /* このタブの中だけに残す */ }
    },
  }
}

function newId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export interface DemoTransportOptions {
  /** 模擬サーバーの保存先（同じブラウザのタブで共有する）。 */
  storage: KeyValue
  /** 参加者 ID の保存先（タブごと）。 */
  session: KeyValue
  /** false なら通信できない扱いにする（端末がオフライン）。 */
  isOnline?: () => boolean
  /**
   * タブの間で操作を1つずつにする鍵（読み込み → 変更 → 保存の間にほかのタブが割り込まない）。
   * 既定はブラウザの Web Locks。使えない環境では、このタブの中だけで順に実行する。
   */
  lock?: <T>(run: () => Promise<T>) => Promise<T>
  /** 別のタブが ROOM_DEMO_WAKE_KEY で知らせたときの通知。 */
  listen?: (changed: () => void) => () => void
  server?: MockRoomServer
}

/**
 * 端末内デモの transport。MockRoomServer を localStorage に置き、同じブラウザのタブの間だけで共有する。
 * 各操作の前に読み込み、後に保存する。契約・失敗コードは Supabase と同じ（RoomTransport）。
 */
export interface DemoTransport extends RoomTransport {
  /** 端末内デモだけ：この端末で作ったホスト用キーを模擬サーバーに登録する（本物のキーは担当者だけが持つ）。 */
  addHostKey(key: string): void
}

/** Web Locks があればタブをまたいで、なければこのタブの中で、操作を1つずつ実行する。 */
export function browserLock(): <T>(run: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve()
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined
  return <T>(run: () => Promise<T>) => {
    if (locks) return locks.request(ROOM_DEMO_KEY, run) as Promise<T>
    const next = queue.then(run, run)
    queue = next.catch(() => undefined)
    return next
  }
}

export function demoTransport({ storage, session, isOnline = () => true, lock = browserLock(), listen, server = new MockRoomServer() }: DemoTransportOptions): DemoTransport {
  let userId = session.getItem(ROOM_DEMO_USER_KEY)
  if (!userId) { userId = newId(); session.setItem(ROOM_DEMO_USER_KEY, userId) }
  const inner = server.asUser(userId)
  const load = () => {
    let data: unknown = null
    try { data = JSON.parse(storage.getItem(ROOM_DEMO_KEY) ?? 'null') } catch { data = null }
    server.importState(data)
  }
  const persist = () => storage.setItem(ROOM_DEMO_KEY, JSON.stringify(server.exportState()))
  const call = <A extends unknown[], R>(run: (...args: A) => Promise<R>) => async (...args: A): Promise<R> => {
    // 実際の通信と同じく、端末がオフラインなら届かない（再接続の流れを端末内でも確かめられる）。
    if (!isOnline()) throw new Error('offline')
    // 鍵の中で読み込み → 変更 → 保存する（ほかのタブの同時の操作を上書きしない）。
    // 模擬サーバーの処理は呼び出しの中で同期的に終わるので、結果を待つ前に保存できる。
    return lock(async () => {
      load()
      const result = run(...args)
      persist()
      return result
    })
  }
  return {
    addHostKey(key) {
      // 鍵なし：作ったキーはすぐ次の createAsHost で使うので、ここで同期的に保存する
      load()
      server.addHostKey(key)
      persist()
    },
    create: call(inner.create),
    join: call(inner.join),
    resumeHost: call(inner.resumeHost),
    rename: call(inner.rename),
    snapshot: call(inner.snapshot),
    ready: call(inner.ready),
    start: call(inner.start),
    schedule: call(inner.schedule),
    setPitchMode: call(inner.setPitchMode),
    open: call(inner.open),
    leave: call(inner.leave),
    subscribe(room, refresh, onStatus) {
      load()
      let stopInner = () => {}
      // 入室・準備・開始などの変化は、このタブの画面に加えてほかのタブにも知らせる。
      // snapshot だけ（接続時刻の更新）では知らせないので、タブの間で取り直しが続かない。
      // 通知は操作の保存が終わった後に出す（操作の途中で取り直すと、保存前の状態を読み込んでしまう）。
      const wake = () => queueMicrotask(() => { refresh(); storage.setItem(ROOM_DEMO_WAKE_KEY, `${room}:${newId()}`) })
      try { stopInner = inner.subscribe(room, wake, onStatus) } catch { onStatus?.('down') /* 起床通知だけ。ポーリングで取得する */ }
      const stopListen = listen?.(refresh) ?? (() => {})
      return () => { stopInner(); stopListen() }
    },
  }
}

export interface RoomRecord {
  roomId: string
  /** 見守りを選んだか（画面だけの選択。サーバーでは「準備していない」人）。 */
  watching?: boolean
  /** 確認済みの自分の結果（ラウンド番号）。 */
  seen?: number[]
  /** ホスト用リンクで戻った（「ホストとして戻りました」をまだ見せていない）。 */
  viaHostLink?: boolean
}

export function readRecords(records: KeyValue): Record<string, RoomRecord> {
  try {
    const value: unknown = JSON.parse(records.getItem(ROOM_RECORDS_KEY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const out: Record<string, RoomRecord> = {}
    for (const [invite, record] of Object.entries(value as Record<string, unknown>)) {
      if (!record || typeof record !== 'object' || typeof (record as RoomRecord).roomId !== 'string') continue
      const { roomId, watching, seen, viaHostLink } = record as RoomRecord
      out[invite] = { roomId, watching: watching === true, seen: Array.isArray(seen) ? seen.filter(n => Number.isInteger(n)) : [], viaHostLink: viaHostLink === true }
    }
    return out
  } catch {
    return {}
  }
}

export function writeRecord(records: KeyValue, invite: string, patch: Partial<RoomRecord> & { roomId: string }) {
  const all = readRecords(records)
  all[invite] = { ...all[invite], ...patch }
  records.setItem(ROOM_RECORDS_KEY, JSON.stringify(all))
}

export interface RoomSession {
  controller: RoomController
  /** 端末内デモ（MockRoomServer）なら true。画面に「デモ」と明記する。 */
  demo: boolean
  /** 入ったルームの記録の保存先。 */
  records: KeyValue
  /**
   * 端末内デモだけ：この端末をデモのホストにする（ホスト用キーを作って模擬サーバーに登録し、そのキーを返す）。
   * Supabase につないでいるときは null（ホスト用キーは担当者だけが持つ）。
   */
  makeDemoHostKey: (() => string) | null
  /**
   * ピッチ用の実物グッズ写真の取得元（F15）。Supabase につないでいるときだけ。端末内デモでは null（写真を読まない）。
   */
  photos: PhotoSource | null
}

export function createRoomSession(transport: RoomTransport | DemoTransport, demo: boolean, records: KeyValue, options: RoomControllerOptions = {}, photos: PhotoSource | null = null): RoomSession {
  const seenResults = Object.fromEntries(Object.values(readRecords(records)).map(record => [record.roomId, record.seen ?? []]))
  const controller = createRoomController(transport, { seenResults, ...options })
  const makeDemoHostKey = demo && 'addHostKey' in transport ? () => {
    const key = demoHostKey()
    transport.addHostKey(key)
    return key
  } : null
  // 写真は本物の通信経路のルームだけ。デモでは渡されても使わない。
  return { controller, demo, records, makeDemoHostKey, photos: demo ? null : photos }
}

/** ホスト用キーの形（32 文字以上の英数字・- _）。端末内デモのキーだけをここで作る。 */
export function demoHostKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return `demo_${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

let fallback: RoomSession | null = null

/** ROOM_FORCE_DEMO_KEY が '1' なら true（E2E で実 Supabase へ通信しない）。 */
export function forcedDemo(storage: KeyValue): boolean {
  return storage.getItem(ROOM_FORCE_DEMO_KEY) === '1'
}

/** アプリ全体で 1 つのルームの接続。Supabase の設定がなければ（または E2E の指定があれば）、この端末の中だけのデモにする。 */
export function defaultRoomSession(): RoomSession {
  if (fallback) return fallback
  const local = safeStorage(() => window.localStorage)
  const session = safeStorage(() => window.sessionStorage)
  const client = forcedDemo(local) ? null : configuredClient()
  const real = client ? configuredTransport() : null
  if (client && real) return fallback = createRoomSession(real, false, local, {}, supabasePhotoSource(client))
  const transport = demoTransport({
    storage: local, session,
    isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
    listen: changed => {
      const onStorage = (event: StorageEvent) => { if (event.key === ROOM_DEMO_WAKE_KEY) changed() }
      window.addEventListener('storage', onStorage)
      return () => window.removeEventListener('storage', onStorage)
    },
  })
  return fallback = createRoomSession(transport, true, session)
}

export const RoomSessionContext = createContext<RoomSession | null>(null)

export function useRoomSession(): RoomSession {
  return useContext(RoomSessionContext) ?? defaultRoomSession()
}

/** 画面が表示されている間だけタイマー・購読を動かし、状態を受け取る。 */
export function useRoomState(session: RoomSession): RoomState {
  const { controller } = session
  useEffect(() => {
    controller.attach()
    return () => controller.detach()
  }, [controller])
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState)
}

/** 参加者に送る招待リンク。 */
export function inviteUrl(invite: string): string {
  return `${window.location.href.split('#')[0]}${paths.room(invite)}`
}

/** 退室・期限切れのルームを記録から外す（次に招待を開いたときは入り直す）。 */
export function forgetRecord(records: KeyValue, invite: string) {
  const all = readRecords(records)
  if (!(invite in all)) return
  delete all[invite]
  records.setItem(ROOM_RECORDS_KEY, JSON.stringify(all))
}
