/** Contract shared by the local-only mock and the authenticated Supabase transport. */
export const SHARED_CAPACITY = 40
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
export type RoomErrorCode =
  | 'auth-required' | 'invalid-request' | 'invalid-name' | 'invalid-ready' | 'invalid-round'
  | 'room-full' | 'room-unavailable' | 'host-required' | 'host-online'
  | 'round-active' | 'nobody-ready' | 'sold-out' | 'insufficient-coins' | 'stale-round'
export class RoomContractError extends Error {
  readonly code: RoomErrorCode
  constructor(code: RoomErrorCode) { super(code); this.code = code; this.name = 'RoomContractError' }
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
}
export interface Snapshot {
  id: string; invite: string; host: string; expiresAt: string; serverTime: string; self: string
  balance: number; roundNo: number; members: Member[]; myResults: { roundNo: number; prize: SharedPrize }[]
  /** Hidden with results before startsAt, so stock deltas cannot reveal prizes early. */
  stock: { prize: SharedPrize; remaining: number }[] | null
  round: Round | null
}
export interface RoomTransport {
  create(request: string, name: string): Promise<Snapshot>
  join(invite: string, name: string): Promise<Snapshot>
  snapshot(room: string): Promise<Snapshot>
  ready(room: string, ready: boolean): Promise<Snapshot>
  start(room: string, request: string, expected: number): Promise<Snapshot>
  claim(room: string): Promise<Snapshot>
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
    'room-full': 'このルームは40人で満員です。',
    'room-unavailable': '招待が無効か、期限が切れています。',
    'host-required': '開始できるのはホストだけです。',
    'host-online': 'ホストは接続中です。',
    'round-active': '今の開封が終わるまでお待ちください。',
    'nobody-ready': '準備OKの参加者がいません。',
    'sold-out': '参加者全員分の中身が残っていません。見るだけで参加できます。',
    'insufficient-coins': 'このルームの体験コインが足りません。見るだけで参加できます。',
    'stale-round': 'すでに開始されています。最新の状態を確認してください。',
  }
  return Object.entries(codes).find(([code]) => message.includes(code))?.[1]
    ?? (message.includes('Anonymous sign-ins are disabled') ? '接続の準備中です。今は1台デモをお試しください。'
      : '接続できませんでした。通信を確認して再試行してください。')
}