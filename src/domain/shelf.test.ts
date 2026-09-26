import { describe, expect, test } from 'vitest'
import { exchange, createInitialState } from './game'
import { cleanFavorites, cleanReactions, DEFAULT_SHELF_GACHA, findFriend, FRIEND_SHELF_SIZE, friendsOf, hasReacted, ownedItems, sendReaction, shelfGacha, shelfOf, shelfSlots, slotOf, slotText, toggleFavorite } from './shelf'
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
  test('棚の枠は1つのガチャの中身の種類と同じ数・同じ並び。まだ回していなければマスターと同じ9種のガチャ', () => {
    const empty = shelfOf(createInitialState())
    expect(empty.gacha.id).toBe(DEFAULT_SHELF_GACHA)
    expect(empty.slots.map((slot) => slot.prize.name)).toEqual(['ぬいぐるみマスコット', 'ミニぬいぐるみ', 'アクリルスタンド', 'ミニポーチ', 'ヘアゴム', 'メモ帳', 'ミニマグ', 'ハンドタオル', '缶バッジ'])
    expect(empty.slots.every((slot) => slot.item === null)).toBe(true)
    expect(empty.owned).toBe(0)
    expect(slotText(2, 9)).toBe('02 / 09')
    expect(slotText(10, 12)).toBe('10 / 12')
  })

  test('持っている種類は決まった枠に入り、同じ品は1つにまとめる（先に当てた順）', () => {
    const state = withWins(win('sanrio-capsule-3'), win('sanrio-capsule-1'), win('sanrio-capsule-3'))
    expect(ownedItems(state).map((item) => [item.prize.id, item.count])).toEqual([['sanrio-capsule-3', 2], ['sanrio-capsule-1', 1]])
    const { slots, owned } = shelfOf(state)
    expect(owned).toBe(2)
    expect(slots.map((slot) => slot.item?.prize.id ?? null)).toEqual(['sanrio-capsule-1', null, 'sanrio-capsule-3', null, null, null, null, null, null])
    expect(slotOf(state, 'sanrio-capsule-1')).toBe(1)
    expect(slotOf(state, 'sanrio-capsule-3')).toBe(3)
  })

  test('棚はいちばん最近に回したガチャの中身。ほかのガチャの品は棚の外', () => {
    const state = withWins(win('sanrio-capsule-1'), win('melody-anniv-12'))
    expect(shelfGacha(state).id).toBe('melody-anniv')
    const { slots, owned } = shelfOf(state)
    expect(slots).toHaveLength(12)
    expect(owned).toBe(1)
    expect(slots[11].item?.prize.id).toBe('melody-anniv-12')
    expect(slotOf(state, 'sanrio-capsule-1')).toBeNull()
    // 交換した後でも、最後に回したガチャの棚のまま
    const exchanged = exchange(state, [state.wins[0].id])
    expect(shelfGacha(exchanged).id).toBe('melody-anniv')
    expect(shelfOf(exchanged).owned).toBe(0)
  })

  test('コインに交換した品は棚から外れ、届け待ちの品は並ぶ', () => {
    const a = win('sanrio-capsule-1')
    const b = win('sanrio-capsule-2', { status: 'delivery' })
    const state = exchange(withWins(a, b), [a.id])
    expect(ownedItems(state).map((item) => item.prize.id)).toEqual(['sanrio-capsule-2'])
    expect(shelfOf(state).slots.map((slot) => Boolean(slot.item))).toEqual([false, true, false, false, false, false, false, false, false])
  })

  test('お気に入りは付けても外しても枠の位置は変わらない。持っていない品には付けない', () => {
    const state = withWins(win('sanrio-capsule-1'), win('sanrio-capsule-2'))
    const liked = toggleFavorite(state, 'sanrio-capsule-2')
    expect(liked.favorites).toEqual(['sanrio-capsule-2'])
    expect(ownedItems(liked).map((item) => [item.prize.id, item.favorite])).toEqual([['sanrio-capsule-1', false], ['sanrio-capsule-2', true]])
    expect(slotOf(liked, 'sanrio-capsule-2')).toBe(2)
    expect(shelfOf(liked).slots[1].item?.favorite).toBe(true)
    const undone = toggleFavorite(liked, 'sanrio-capsule-2')
    expect(undone.favorites).toEqual([])
    expect(toggleFavorite(state, 'sanrio-capsule-9')).toBe(state)
  })

  test('友だち（デモ）の棚は9枠で、飾っている順に前から詰める', () => {
    expect(FRIEND_SHELF_SIZE).toBe(9)
    expect(shelfSlots(['a', 'b'])).toEqual(['a', 'b', null, null, null, null, null, null, null])
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
