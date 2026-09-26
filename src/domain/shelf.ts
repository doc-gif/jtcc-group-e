import { catalog } from './catalog'
import { DEMO_FRIENDS } from './game'
import type { AppState, Gacha, Prize, WinStatus } from './types'

/** 棚の枠の数（デザインマスター T09 の 9 枠）。 */
export const SHELF_SIZE = 9

/** 棚に並ぶのは、いま持っている物（手元にある・届け待ち）。コインに交換した物は並ばない。 */
const OWNED: WinStatus[] = ['kept', 'delivery']

export interface ShelfItem {
  gacha: Gacha
  prize: Prize
  /** 同じ品をいくつ持っているか */
  count: number
  favorite: boolean
}

export function findPrizeById(prizeId: string): { gacha: Gacha; prize: Prize } | undefined {
  for (const gacha of catalog) {
    const prize = gacha.prizes.find((item) => item.id === prizeId)
    if (prize) return { gacha, prize }
  }
  return undefined
}

/**
 * 持っている品を、種類ごとに1つにまとめて並べる。
 * お気に入り（付けた順）を前に、そのほかは先に当てた順。新しく当てた物は次の空き枠に入る。
 */
export function ownedItems(state: AppState): ShelfItem[] {
  const counts = new Map<string, number>()
  // wins は新しい順なので、後ろから見て「先に当てた順」にする
  for (const win of [...state.wins].reverse()) {
    if (!OWNED.includes(win.status)) continue
    counts.set(win.prizeId, (counts.get(win.prizeId) ?? 0) + 1)
  }
  const favorites = state.favorites.filter((id) => counts.has(id))
  const order = [...favorites, ...[...counts.keys()].filter((id) => !favorites.includes(id))]
  return order.flatMap((id) => {
    const found = findPrizeById(id)
    return found ? [{ ...found, count: counts.get(id) ?? 0, favorite: favorites.includes(id) }] : []
  })
}

/** 9 枠。空いている枠は null。 */
export function shelfSlots<T>(items: T[]): Array<T | null> {
  return Array.from({ length: SHELF_SIZE }, (_, index) => items[index] ?? null)
}

/** 棚の何番目か（1 から）。棚に並んでいなければ null。 */
export function slotOf(state: AppState, prizeId: string): number | null {
  const index = ownedItems(state).slice(0, SHELF_SIZE).findIndex((item) => item.prize.id === prizeId)
  return index < 0 ? null : index + 1
}

export const slotText = (slot: number) => `${String(slot).padStart(2, '0')} / ${String(SHELF_SIZE).padStart(2, '0')}`

/** お気に入りを付ける・外す。持っていない品には付けない。 */
export function toggleFavorite(state: AppState, prizeId: string): AppState {
  if (state.favorites.includes(prizeId)) return { ...state, favorites: state.favorites.filter((id) => id !== prizeId) }
  if (!ownedItems(state).some((item) => item.prize.id === prizeId)) return state
  return { ...state, favorites: [...state.favorites, prizeId] }
}

export type FriendId = 'yui' | 'saki'

export interface DemoFriend {
  id: FriendId
  name: string
  /** false のときは「今は見られません」の状態（デモ）。 */
  viewable: boolean
  /** 棚に飾っている品（説明用の架空データ）。 */
  shelf: string[]
}

/** 友だちの棚はデモ。この端末の中の固定データで、ほかの人とはつながっていない。 */
export const DEMO_FRIEND_PROFILES: DemoFriend[] = [
  { id: 'yui', name: DEMO_FRIENDS[0], viewable: true, shelf: ['sanrio-capsule-2', 'sanrio-capsule-1'] },
  { id: 'saki', name: DEMO_FRIENDS[1], viewable: false, shelf: [] },
]

export function findFriend(id: string): DemoFriend | undefined {
  return DEMO_FRIEND_PROFILES.find((friend) => friend.id === id)
}

/** フレンドに出るのは、いっしょに回したことのある友だち（デモ）だけ。 */
export function friendsOf(state: AppState): DemoFriend[] {
  const met = new Set(state.wins.flatMap((win) => win.companions))
  return DEMO_FRIEND_PROFILES.filter((friend) => met.has(friend.name))
}

export const reactionKey = (friendId: FriendId, prizeId: string) => `${friendId}:${prizeId}`

export function hasReacted(state: AppState, friendId: FriendId, prizeId: string): boolean {
  return state.reactions.includes(reactionKey(friendId, prizeId))
}

/** 「いいな〜」（デモ）。同じ品には1回だけ。見られない友だち・飾っていない品には送らない。 */
export function sendReaction(state: AppState, friendId: FriendId, prizeId: string): AppState {
  const friend = findFriend(friendId)
  if (!friend?.viewable || !friend.shelf.includes(prizeId) || hasReacted(state, friendId, prizeId)) return state
  if (!friendsOf(state).some((item) => item.id === friendId)) return state
  return { ...state, reactions: [...state.reactions, reactionKey(friendId, prizeId)] }
}

/** 保存データの読み込み用。知らない品・形の崩れた値は捨て、重複をなくす。 */
export function cleanFavorites(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && findPrizeById(id) !== undefined))]
}

export function cleanReactions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((key): key is string => {
    if (typeof key !== 'string') return false
    const [friendId, prizeId, ...rest] = key.split(':')
    return rest.length === 0 && findFriend(friendId)?.shelf.includes(prizeId) === true
  }))]
}
