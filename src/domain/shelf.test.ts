import { describe, expect, test } from 'vitest'
import { exchange, createInitialState } from './game'
import { cleanFavorites, cleanReactions, findFriend, friendsOf, hasReacted, ownedItems, sendReaction, SHELF_SIZE, shelfSlots, slotOf, slotText, toggleFavorite } from './shelf'
import { parseState } from './storage'
import type { AppState, WinRecord } from './types'

let seq = 0
const win = (prizeId: string, extra: Partial<WinRecord> = {}): WinRecord => {
  seq += 1
  const gachaId = prizeId.replace(/-\d+$/, '')
  return { id: `w${seq}`, gachaId, prizeId, spent: 500, wonAt: `2026-09-${String(seq).padStart(2, '0')}T00:00:00.000Z`, companions: [], status: 'kept', ...extra }
}
/** wins は新しい順に保存されるので、引数は当てた順に渡して逆にする */
const withWins = (...wins: WinRecord[]): AppState => ({ ...createInitialState(), wins: [...wins].reverse() })

describe('わたしの棚', () => {
  test('持っている品を種類ごとにまとめ、先に当てた順に並べる。空き枠は null で9枠', () => {
    const state = withWins(win('sanrio-capsule-3'), win('sanrio-capsule-1'), win('sanrio-capsule-3'))
    const items = ownedItems(state)
    expect(items.map((item) => [item.prize.id, item.count])).toEqual([['sanrio-capsule-3', 2], ['sanrio-capsule-1', 1]])
    const slots = shelfSlots(items)
    expect(slots).toHaveLength(SHELF_SIZE)
    expect(slots.filter((slot) => slot === null)).toHaveLength(7)
    expect(slotOf(state, 'sanrio-capsule-1')).toBe(2)
    expect(slotOf(state, 'sanrio-capsule-9')).toBeNull()
    expect(slotText(2)).toBe('02 / 09')
  })

  test('コインに交換した品は棚から外れ、届け待ちの品は並ぶ', () => {
    const a = win('sanrio-capsule-1')
    const b = win('sanrio-capsule-2', { status: 'delivery' })
    const state = exchange(withWins(a, b), [a.id])
    expect(ownedItems(state).map((item) => item.prize.id)).toEqual(['sanrio-capsule-2'])
  })

  test('10種類以上あっても棚は9枠。10番目は棚の外', () => {
    const ids = Array.from({ length: 10 }, (_, index) => `melody-anniv-${index + 1}`)
    const state = withWins(...ids.map((id) => win(id)))
    expect(shelfSlots(ownedItems(state)).every((slot) => slot !== null)).toBe(true)
    expect(slotOf(state, 'melody-anniv-10')).toBeNull()
  })

  test('お気に入りは棚の前に並び、もう一度押すと外せる。持っていない品には付けない', () => {
    const state = withWins(win('sanrio-capsule-1'), win('sanrio-capsule-2'))
    const liked = toggleFavorite(state, 'sanrio-capsule-2')
    expect(liked.favorites).toEqual(['sanrio-capsule-2'])
    expect(ownedItems(liked).map((item) => [item.prize.id, item.favorite])).toEqual([['sanrio-capsule-2', true], ['sanrio-capsule-1', false]])
    expect(slotOf(liked, 'sanrio-capsule-2')).toBe(1)
    const undone = toggleFavorite(liked, 'sanrio-capsule-2')
    expect(undone.favorites).toEqual([])
    expect(ownedItems(undone)[0].prize.id).toBe('sanrio-capsule-1')
    expect(toggleFavorite(state, 'sanrio-capsule-9')).toBe(state)
  })
})

describe('フレンド（デモ）', () => {
  test('いっしょに回した友だちだけが出る', () => {
    expect(friendsOf(createInitialState())).toEqual([])
    const state = withWins(win('sanrio-capsule-1', { companions: ['ゆい', 'さき'] }))
    expect(friendsOf(state).map((friend) => friend.id)).toEqual(['yui', 'saki'])
  })

  test('「いいな〜」は同じ品に1回だけ。見られない友だち・飾っていない品・まだ友だちでない人には送らない', () => {
    const before = createInitialState()
    expect(sendReaction(before, 'yui', 'sanrio-capsule-2')).toBe(before)
    const state = withWins(win('sanrio-capsule-1', { companions: ['ゆい', 'さき'] }))
    const once = sendReaction(state, 'yui', 'sanrio-capsule-2')
    expect(hasReacted(once, 'yui', 'sanrio-capsule-2')).toBe(true)
    expect(sendReaction(once, 'yui', 'sanrio-capsule-2')).toBe(once)
    expect(sendReaction(state, 'yui', 'melody-anniv-1')).toBe(state)
    expect(sendReaction(state, 'saki', 'sanrio-capsule-2')).toBe(state)
    expect(findFriend('nobody')).toBeUndefined()
  })
})

describe('保存データ（F04 で増えた項目）', () => {
  test('前の版の保存データ（お気に入り・反応なし）も読める', () => {
    const { favorites: _f, reactions: _r, ...old } = withWins(win('sanrio-capsule-1'))
    const state = parseState(JSON.stringify(old))
    expect(state.wins).toHaveLength(1)
    expect(state.favorites).toEqual([])
    expect(state.reactions).toEqual([])
  })

  test('知らない品・形の崩れた値は捨て、重複をなくす', () => {
    expect(cleanFavorites(['sanrio-capsule-1', 'sanrio-capsule-1', 'nope-1', 3, null])).toEqual(['sanrio-capsule-1'])
    expect(cleanFavorites('sanrio-capsule-1')).toEqual([])
    expect(cleanReactions(['yui:sanrio-capsule-2', 'yui:sanrio-capsule-2', 'yui:melody-anniv-1', 'saki:sanrio-capsule-2', 'x:y', 'yui:sanrio-capsule-2:x', 1])).toEqual(['yui:sanrio-capsule-2'])
    expect(cleanReactions({})).toEqual([])
    const saved = { ...withWins(win('sanrio-capsule-1')), favorites: ['sanrio-capsule-1', 'bad'], reactions: ['yui:sanrio-capsule-1'] }
    const state = parseState(JSON.stringify(saved))
    expect(state.favorites).toEqual(['sanrio-capsule-1'])
    expect(state.reactions).toEqual(['yui:sanrio-capsule-1'])
  })
})
