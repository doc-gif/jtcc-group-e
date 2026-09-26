// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import App from '../App'
import { createInitialState } from '../domain/game'
import { STORAGE_KEY } from '../domain/storage'
import type { AppState, WinRecord } from '../domain/types'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

let store: MemoryStorage
afterEach(() => { cleanup() })

const win = (id: string, prizeId: string, companions: string[] = [], status: WinRecord['status'] = 'kept'): WinRecord =>
  ({ id, gachaId: 'sanrio-capsule', prizeId, spent: 500, wonAt: '2026-09-20T00:00:00.000Z', companions, status })

function start(hash: string, state: Partial<AppState> = {}) {
  store = new MemoryStorage()
  store.setItem(STORAGE_KEY, JSON.stringify({ ...createInitialState(), ...state }))
  window.location.hash = hash
  return render(<App storage={store} />)
}
function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}
const heading = () => screen.getByRole('heading', { level: 1 })
const saved = (): AppState => JSON.parse(store.getItem(STORAGE_KEY) ?? '{}')
// wins は新しい順。w1 → w2 の順に当てた
const twoWins = [win('w2', 'sanrio-capsule-2', ['ゆい', 'さき']), win('w1', 'sanrio-capsule-1')]

describe('わたしの棚', () => {
  test('空のときは9枠すべて「未入手」で、ガチャのお店へ案内する', () => {
    start('#/shelf')
    expect(heading()).toHaveTextContent('わたしの棚')
    expect(screen.getByText('0 / 9 枠')).toBeVisible()
    expect(screen.queryByRole('link', { name: '当てたもの一覧' })).toBeNull()
    const board = screen.getByRole('list', { name: /わたしの棚/ })
    expect(within(board).getAllByRole('listitem')).toHaveLength(9)
    expect(within(board).getAllByText('未入手')).toHaveLength(9)
    expect(screen.getByRole('link', { name: 'ガチャのお店へ' })).toHaveAttribute('href', '#/gacha')
    expect(screen.getByRole('link', { name: 'コレクション' })).toHaveAttribute('aria-current', 'page')
  })

  test('持っている品は絵と「持っている」で飾られ、詳細でお気に入りにして取り消せる', () => {
    start('#/shelf', { wins: twoWins })
    expect(screen.getByText('2 / 9 枠')).toBeVisible()
    expect(screen.getByRole('link', { name: '当てたもの一覧' })).toHaveAttribute('href', '#/collection')
    const board = screen.getByRole('list', { name: /わたしの棚/ })
    expect(within(board).getAllByText('持っている')).toHaveLength(2)
    expect(within(board).getAllByText('未入手')).toHaveLength(7)
    const second = within(board).getByRole('link', { name: /02 \/ 09.*ミニぬいぐるみ/ })
    expect(second).toHaveAttribute('href', '#/shelf/sanrio-capsule-2')
    go('#/shelf/sanrio-capsule-2')
    expect(heading()).toHaveTextContent('わたしの1点')
    expect(screen.getByText('あなたの持ち物・棚 02 / 09')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'お気に入りにする' }))
    expect(screen.getByRole('status')).toHaveTextContent('お気に入りにしました')
    expect(heading()).toHaveTextContent('お気に入りの1点')
    expect(screen.getByText('あなたの持ち物・お気に入り登録済み')).toBeVisible()
    expect(screen.getByText('♡ お気に入り・棚 01 / 09')).toBeVisible()
    expect(saved().favorites).toEqual(['sanrio-capsule-2'])
    const undo = screen.getByRole('button', { name: 'お気に入りをやめる' })
    undo.focus()
    fireEvent.click(undo)
    // 同じボタンのまま残り、焦点が外れない
    expect(screen.getByRole('button', { name: 'お気に入りにする' })).toHaveFocus()
    expect(heading()).toHaveTextContent('わたしの1点')
    expect(screen.getByRole('status')).toHaveTextContent('お気に入りをやめました')
    expect(saved().favorites).toEqual([])
  })

  test('持っていない品の詳細は、その旨と棚への戻り道を出す', () => {
    start('#/shelf/sanrio-capsule-1', { wins: [win('w1', 'sanrio-capsule-1', [], 'exchanged')] })
    expect(screen.getByText(/この品は、いま持っていません/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'わたしの棚を見る' })).toHaveAttribute('href', '#/shelf')
  })

  test('友だちからの見え方は、公開していないことと見える範囲を示し、枠は押せない', () => {
    start('#/shelf/share', { wins: twoWins })
    expect(heading()).toHaveTextContent('友だちからの見え方')
    expect(screen.getByText('共有はまだ実行していません。')).toBeVisible()
    expect(screen.getByRole('link', { name: '友だち一覧へ' })).toHaveAttribute('href', '#/together')
    const board = screen.getByRole('list', { name: /プレビュー/ })
    expect(within(board).getAllByText('あなたの品')).toHaveLength(2)
    expect(within(board).queryAllByRole('link')).toHaveLength(0)
  })

  test('当てたもの一覧から、棚の何番目かが分かり、棚へ戻れる', () => {
    start('#/collection', { wins: twoWins })
    expect(screen.getByRole('link', { name: /棚 01 で見る/ })).toHaveAttribute('href', '#/shelf/sanrio-capsule-1')
    expect(screen.getByRole('link', { name: '棚ビューに戻る' })).toHaveAttribute('href', '#/shelf')
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '#/shelf')
  })

  test('10種類目からは棚の外になり、一覧で見られると伝える', () => {
    const wins = Array.from({ length: 10 }, (_, index) => ({ ...win(`w${index}`, `melody-anniv-${index + 1}`), gachaId: 'melody-anniv' }))
    start('#/shelf', { wins })
    expect(screen.getByText('9 / 9 枠')).toBeVisible()
    expect(screen.getByText(/ほかの1点は「一覧」で見られます/)).toBeVisible()
    go(`#/shelf/${wins[0].prizeId}`)
    expect(screen.getByText(/棚の外/)).toBeVisible()
  })
})

describe('フレンド（デモ）', () => {
  test('まだいっしょに回していないと「まだ友だちはいません」と、戻り道を出す', () => {
    start('#/together')
    expect(heading()).toHaveTextContent('フレンド')
    expect(screen.getByText('まだ友だちはいません')).toBeVisible()
    expect(screen.getByRole('link', { name: 'ガチャを見る' })).toHaveAttribute('href', '#/gacha')
    go('#/friend/yui')
    expect(heading()).toHaveTextContent('今は見られません')
    expect(screen.getByText(/まだいっしょに回していません/)).toBeVisible()
    go('#/friend/nobody')
    expect(heading()).toHaveTextContent('ページが見つかりません')
  })

  test('ゆいさんの棚は他人の持ち物として見られ、「いいな〜」は1回だけ送れる', () => {
    start('#/together', { wins: twoWins })
    expect(screen.getByText('見に行ける友だち（デモ）')).toBeVisible()
    expect(screen.getByRole('link', { name: 'ガチャのお店へ' })).toHaveAttribute('href', '#/gacha')
    expect(screen.getByRole('link', { name: 'ゆいさんの棚を見に行く' })).toHaveAttribute('href', '#/friend/yui')
    expect(screen.getByRole('link', { name: 'さきさんの棚の状態を見る' })).toHaveAttribute('href', '#/friend/saki')
    go('#/friend/yui')
    expect(heading()).toHaveTextContent('ゆいさんの棚')
    expect(screen.getByText('友だちの持ち物・あなたの棚ではありません')).toBeVisible()
    const board = screen.getByRole('list', { name: /ゆいさんの棚/ })
    expect(within(board).getAllByText('ゆいさんの品')).toHaveLength(2)
    expect(within(board).getAllByText('まだ飾っていません')).toHaveLength(7)
    go('#/friend/yui/sanrio-capsule-2')
    expect(heading()).toHaveTextContent('ゆいさんの1点')
    expect(screen.getByText('見るだけ・あなたの棚には追加されません')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'いいな〜を送る' }))
    expect(screen.getByRole('status')).toHaveTextContent('いいな〜を送った・デモ')
    expect(screen.getByRole('status')).toHaveFocus()
    expect(heading()).toHaveTextContent('気持ちを送った')
    expect(screen.getByText('同じ反応を続けて送ることはできません')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'いいな〜を送る' })).toBeNull()
    expect(saved().reactions).toEqual(['yui:sanrio-capsule-2'])
    expect(screen.getByRole('link', { name: 'ゆいさんの棚へ' })).toHaveAttribute('href', '#/friend/yui')
    // 自分の棚には入らない
    expect(saved().wins).toHaveLength(2)
    go('#/friend/yui/melody-anniv-1')
    expect(heading()).toHaveTextContent('ページが見つかりません')
  })

  test('さきさんの棚は見られない理由と、フレンドへの戻り道を出す', () => {
    start('#/friend/saki', { wins: twoWins })
    expect(heading()).toHaveTextContent('今は見られません')
    expect(screen.getByText('さきさんの棚は見られません')).toBeVisible()
    expect(screen.getByText(/公開範囲や接続状態が変わるまで/)).toBeVisible()
    expect(screen.getByRole('link', { name: '友だち一覧へ' })).toHaveAttribute('href', '#/together')
  })
})
