/** Contract shared by the local-only mock and the authenticated Supabase transport. */
/** 内部の上限（ホストを含む active メンバー）。画面には上限を出さず「N人が集まっています」だけを出す。 */
export const SHARED_CAPACITY = 100
export const SHARED_PRICE = 500
export const SHARED_START_DELAY_MS = 8_000
export const SHARED_ROUND_LOCK_MS = 15_000
export const SHARED_ONLINE_WINDOW_MS = 45_000
export const SHARED_PRIZES = {
  plush: { name: '説明用マスコット', value: 2600 },
  pouch: { name: '説明用ポーチ', value: 900 },
  badge: { name: '説明用缶バッジ', value: 400 },
} as const
export type SharedPrize = keyof typeof SHARED_PRIZES
/** 新しい部屋の架空在庫（計 300）。100 人でも 1 回で売り切れない。 */
export const SHARED_INITIAL_STOCK: Readonly<Record<SharedPrize, number>> = { plush: 30, pouch: 90, badge: 180 }
/** ピッチモードで 1 人に確定する目玉（架空の在庫でいちばん少ない賞品）。 */
export const SHARED_TOP_PRIZE: SharedPrize = 'plush'
/** ホストが選べる「◯分後に開始」。 */
export const SHARED_SCHEDULE_MINUTES = [1, 3, 5, 10] as const
export type ScheduleMinutes = typeof SHARED_SCHEDULE_MINUTES[number]
/** 予約はルームの期限のこの時間より前でなければならない（開始・公開を期限内に収める）。 */
export const SHARED_SCHEDULE_EXPIRY_MARGIN_MS = 60_000
/** ニックネームの上限（文字数）。 */
export const SHARED_NAME_MAX = 12
export type RoomErrorCode =
  | 'auth-required' | 'invalid-request' | 'invalid-name' | 'invalid-ready' | 'invalid-round'
  | 'room-full' | 'room-unavailable' | 'host-required'
  | 'round-active' | 'nobody-ready' | 'sold-out' | 'insufficient-coins' | 'stale-round'
  | 'invalid-schedule'
  | 'host-key-invalid' | 'too-many-attempts' | 'no-room' | 'name-taken'
/**
 * 予約した開始の結末。started は開始済み、cancelled はホストの取り消し、
 * それ以外は予定の時刻に開始できなかった理由（コイン・在庫・準備は何も変えていない）。
 */
export type ScheduleStatus = 'started' | 'cancelled' | 'nobody-ready' | 'sold-out' | 'insufficient-coins' | 'failed'
export interface ScheduleOutcome { status: ScheduleStatus; scheduledAt: string; roundNo: number | null }
export class RoomContractError extends Error {
  readonly code: RoomErrorCode
  /** name-taken のとき、サーバーが空いていると確かめた別の名前（例: 「もも2」）。 */
  readonly suggestion: string | null
  constructor(code: RoomErrorCode, suggestion: string | null = null) {
    super(code); this.code = code; this.suggestion = suggestion; this.name = 'RoomContractError'
  }
}
/** 表示用の名前: 空白の連続を 1 つにして前後を除く。1〜12 文字でなければ null（SQL の lp_clean_name と同じ）。 */
export function cleanName(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null
  const clean = name.replace(/\s+/g, ' ').trim()
  const chars = [...clean]
  const control = chars.some(char => { const code = char.codePointAt(0) ?? 0; return code < 0x20 || (code >= 0x7f && code < 0xa0) })
  return chars.length >= 1 && chars.length <= SHARED_NAME_MAX && !control ? clean : null
}
/** 同じ名前とみなす比較用の形: NFKC（全角・半角）、空白なし、小文字（SQL の lp_name_key と同じ）。 */
export function nameKey(name: string) {
  return name.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}
/** name-taken の失敗に付いた、空いている名前の候補。 */
export function nameSuggestion(error: unknown): string | null {
  return error instanceof RoomContractError && error.code === 'name-taken' ? error.suggestion : null
}
export interface Member { id: string; nickname: string; ready: boolean; online: boolean }
export interface Round {
  /** Stable within a room; (room id, number) identifies one committed outcome. */
  number: number
  /** Server UTC time when the committed results become visible to all active members. */
  startsAt: string
  /** Server UTC time after which ready/start can be requested for the next round. */
  nextReadyAt: string
  /** Null before startsAt, then the same committed results for every member. */
  results: { userId: string; nickname: string; prize: SharedPrize }[] | null
  /**
   * Pitch mode reserved one real top prize for one entrant in this round. Visible to everyone from the start
   * (who received it stays hidden until startsAt). False when the mode was off or the top prize was sold out.
   */
  guaranteed: boolean
}
export interface Snapshot {
  id: string; invite: string; host: string; expiresAt: string; serverTime: string; self: string
  balance: number; roundNo: number; members: Member[]; myResults: { roundNo: number; prize: SharedPrize }[]
  /** Hidden with results before startsAt, so stock deltas cannot reveal prizes early. */
  stock: { prize: SharedPrize; remaining: number }[] | null
  round: Round | null
  /** Server UTC time of the host's scheduled start, or null. The first snapshot after it starts the round. */
  scheduledAt: string | null
  /** Room-level pitch mode: each round guarantees the top prize to one entrant while stock lasts. */
  pitchMode: boolean
  /** How the last schedule ended. Cleared when the host schedules again or starts now. */
  lastSchedule: ScheduleOutcome | null
}
export interface RoomTransport {
  /** 有効なホスト用キーを持つ人だけがルームを作れる。name が null ならサーバーが重ならない名前を付ける。 */
  create(request: string, hostKey: string, name: string | null): Promise<Snapshot>
  /** name が null なら、前の名前が空いていればそれを、なければサーバーが重ならない名前を付ける。 */
  join(invite: string, name: string | null): Promise<Snapshot>
  /**
   * ホスト用キーで別の端末からホストに戻る。room が null ならそのキーでいちばん新しい開いているルーム。
   * ホストの席（名前・コイン・結果）をこの端末へ移し、ほかの人の席と結果は変えない。
   */
  resumeHost(hostKey: string, room: string | null): Promise<Snapshot>
  /** 本人の名前を変える。ほかの active メンバーと同じ名前（全角・半角・大小・空白を無視）は name-taken。 */
  rename(room: string, name: string): Promise<Snapshot>
  snapshot(room: string): Promise<Snapshot>
  ready(room: string, ready: boolean): Promise<Snapshot>
  start(room: string, request: string, expected: number): Promise<Snapshot>
  /** Host only. Starts the round `minutes` from now even if the host is offline then; null cancels. */
  schedule(room: string, minutes: ScheduleMinutes | null): Promise<Snapshot>
  /** Host only. Turns pitch mode on or off for the following rounds. */
  setPitchMode(room: string, on: boolean): Promise<Snapshot>
  leave(room: string): Promise<void>
  /** A wake-up hint only. A fresh snapshot is always authoritative. */
  subscribe(room: string, refresh: () => void): () => void
}
export function serverOffset(serverTime: string, sent: number, received: number) {
  return Date.parse(serverTime) - (sent + received) / 2
}
export function worldSize(viewportWidth: number) {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) throw new Error('Invalid viewport width')
  return { width: viewportWidth * 4, height: viewportWidth * 4 }
}
export function secondsUntil(startsAt: string, now: number, offset: number) {
  return Math.max(0, Math.ceil((Date.parse(startsAt) - now - offset) / 1000))
}
export function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const codes: Record<RoomErrorCode, string> = {
    'auth-required': '接続の準備ができませんでした。もう一度お試しください。',
    'invalid-request': '操作を確認できませんでした。画面を更新して再試行してください。',
    'invalid-name': 'ニックネームは1〜12文字で入力してください。',
    'invalid-ready': '準備状態を確認できませんでした。画面を更新してください。',
    'invalid-round': '開封番号を確認できませんでした。最新の状態を取得してください。',
    'room-full': 'ただいま満員です。これ以上は入れません。',
    'room-unavailable': '招待が無効か、期限が切れています。',
    'host-required': 'この操作はホストだけができます。',
    'round-active': '今の開封が終わるまでお待ちください。',
    'nobody-ready': '準備OKの参加者がいません。',
    'sold-out': '参加者全員分の中身が残っていません。見るだけで参加できます。',
    'insufficient-coins': 'このルームの体験コインが足りません。見るだけで参加できます。',
    'stale-round': 'すでに開始されています。最新の状態を確認してください。',
    'invalid-schedule': '開始の時間を選び直してください（1・3・5・10分後、ルームの期限の1分前まで）。',
    'host-key-invalid': 'ホスト用リンクが無効です。期限が切れたか、正しくないリンクです。招待リンクなら参加者として入れます。',
    'too-many-attempts': 'ホスト用リンクの確認に続けて失敗しました。1分ほど待ってからもう一度お試しください。',
    'no-room': 'このホスト用リンクで開いているルームはありません。新しくルームを作れます。',
    'name-taken': 'このルームに同じニックネームの人がいます。別のニックネームにしてください。',
  }
  const suggestion = nameSuggestion(error)
  if (suggestion) return `${codes['name-taken']}「${suggestion}」なら使えます。`
  return Object.entries(codes).find(([code]) => message.includes(code))?.[1]
    ?? (message.includes('Anonymous sign-ins are disabled') ? '接続の準備中です。今は1台デモをお試しください。'
      : '接続できませんでした。通信を確認して再試行してください。')
}
/** 予定の時刻に開始できなかった理由の案内。開始済み・取り消しは null。 */
export function scheduleMessage(status: ScheduleStatus): string | null {
  switch (status) {
    case 'nobody-ready': return '予定の時刻に準備OKの人がいなかったため、開始しませんでした。'
    case 'sold-out': return '予定の時刻に全員分の中身が残っていなかったため、開始しませんでした。'
    case 'insufficient-coins': return '予定の時刻にコインが足りない人がいたため、開始しませんでした。'
    case 'failed': return '予定の時刻に開始できませんでした。もう一度予約するか、今すぐ開始してください。'
    default: return null
  }
}