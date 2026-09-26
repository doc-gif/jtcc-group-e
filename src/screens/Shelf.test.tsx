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
  test('空のときは、マスターと同じガチャの中身9種の枠がすべて「未入手」と中身の名前で、ガチャのお店へ案内する', () => {
    start('#/shelf')
    expect(heading()).toHaveTextContent('わたしの棚')
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '#/')
    expect(screen.getByText(/提案モック・公式サービスではありません/, { selector: '.page-header-notice' })).toBeVisible()
    expect(screen.getByText('0 / 9 枠')).toBeVisible()
    expect(screen.getByText('サンリオ カプセルミックスの中身9種の棚')).toBeVisible()
    expect(screen.queryByRole('link', { name: '当てたもの一覧' })).toBeNull()
    const board = screen.getByRole('list', { name: 'わたしの棚' })
    expect(within(board).getAllByRole('listitem')).toHaveLength(9)
    expect(within(board).getAllByText('未入手')).toHaveLength(9)
    // マスター 267:8476 の空き枠の2行目は、その枠に入る中身の名前
    expect(within(board).getAllByText(/./, { selector: '.slot-note' }).map((note) => note.textContent)).toEqual(['ぬいぐるみマスコット', 'ミニぬいぐるみ', 'アクリルスタンド', 'ミニポーチ', 'ヘアゴム', 'メモ帳', 'ミニマグ', 'ハンドタオル', '缶バッジ'])
    // 棚の中だけをスクロールする（キーボードでも焦点を当てられる）
    expect(screen.getByRole('region', { name: /わたしの棚/ })).toHaveAttribute('tabindex', '0')
    expect(screen.getByText('空き枠にも「未入手」と表示します。')).toBeVisible()
    expect(screen.getByRole('link', { name: 'ガチャのお店へ' })).toHaveAttribute('href', '#/gacha')
    expect(screen.getByRole('link', { name: 'コレクション' })).toHaveAttribute('aria-current', 'page')
  })

  test('持っている品は種類ごとの枠に絵と「持っている」で飾られ、詳細でお気に入りにして取り消せる', () => {
    start('#/shelf', { wins: twoWins })
    expect(screen.getByText('2 / 9 枠')).toBeVisible()
    expect(screen.getByRole('link', { name: '当てたもの一覧' })).toHaveAttribute('href', '#/collection')
    const board = screen.getByRole('list', { name: 'わたしの棚' })
    expect(within(board).getAllByText('持っている')).toHaveLength(2)
    expect(within(board).getAllByText('未入手')).toHaveLength(7)
    expect(within(board).getByRole('link', { name: /01 \/ 09.*ぬいぐるみマスコット/ })).toHaveAttribute('href', '#/shelf/sanrio-capsule-1')
    const second = within(board).getByRole('link', { name: /02 \/ 09.*ミニぬいぐるみ/ })
    expect(second).toHaveAttribute('href', '#/shelf/sanrio-capsule-2')
    expect(screen.getByText('全9枠・下へスクロールして見られます。')).toBeVisible()
    go('#/shelf/sanrio-capsule-2')
    expect(heading()).toHaveTextContent('わたしの1点')
    expect(screen.getByText('あなたの持ち物・棚 02 / 09')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'お気に入りにする' }))
    expect(screen.getByRole('status')).toHaveTextContent('お気に入りにしました')
    expect(heading()).toHaveTextContent('お気に入りの1点')
    expect(screen.getByText('あなたの持ち物・お気に入り登録済み')).toBeVisible()
    // 枠は種類ごとに決まっているので、お気に入りにしても位置は変わらない
    expect(screen.getByText('♡ お気に入り・棚 02 / 09')).toBeVisible()
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
    expect(screen.getByText('あなたの棚・2 / 9 枠')).toBeVisible()
    expect(screen.getByText('共有はまだ実行していません。')).toBeVisible()
    expect(screen.getByRole('link', { name: '友だち一覧へ' })).toHaveAttribute('href', '#/together')
    const board = screen.getByRole('list', { name: /プレビュー/ })
    expect(within(board).getAllByText('あなたの品')).toHaveLength(2)
    expect(within(board).getAllByText('未入手')).toHaveLength(7)
    expect(within(board).queryAllByRole('link')).toHaveLength(0)
  })

  test('当てたもの（マスター 267:8623）は棚と同じ枠を、持っている品を先に並べ、棚へ戻れる。記録の操作も残す', () => {
    start('#/collection', { wins: [win('w2', 'sanrio-capsule-5'), win('w1', 'sanrio-capsule-2')] })
    expect(heading()).toHaveTextContent('当てたもの')
    expect(screen.getByText('棚と同じ9枠。持っている品を先に表示。')).toBeVisible()
    const list = screen.getByRole('list', { name: /棚と同じ9枠/ })
    const rows = within(list).getAllByRole('listitem').map((row) => row.textContent)
    expect(rows).toEqual([
      '（キラキラ）ミニぬいぐるみ持っている・棚 02', 'ヘアゴム持っている・棚 05',
      ...['ぬいぐるみマスコット未入手・棚 01', 'アクリルスタンド未入手・棚 03', 'ミニポーチ未入手・棚 04', 'メモ帳未入手・棚 06', 'ミニマグ未入手・棚 07', 'ハンドタオル未入手・棚 08', '缶バッジ未入手・棚 09'].map((text) => `+${text}`),
    ])
    expect(within(list).getByRole('link', { name: /ミニぬいぐるみ/ })).toHaveAttribute('href', '#/shelf/sanrio-capsule-2')
    expect(within(list).getAllByRole('link')).toHaveLength(2)
    expect(screen.getByRole('link', { name: '棚ビューに戻る' })).toHaveAttribute('href', '#/shelf')
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '#/shelf')
    // 届けてもらう・コインに交換の入口（PRODUCT の決定）はマスターにないが、記録として残す
    expect(screen.getByRole('heading', { level: 2, name: /当てた記録/ })).toBeVisible()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.getByRole('link', { name: /棚 02 \/ 09 で見る/ })).toHaveAttribute('href', '#/shelf/sanrio-capsule-2')
  })

  test('棚はいちばん最近に回したガチャの中身。ほかのガチャの品は棚の外と伝える', () => {
    const wins = [{ ...win('w2', 'melody-anniv-12'), gachaId: 'melody-anniv' }, win('w1', 'sanrio-capsule-1')]
    start('#/shelf', { wins })
    expect(screen.getByText('1 / 12 枠')).toBeVisible()
    expect(screen.getByText('マイメロディ 周年限定ガチャの中身12種の棚')).toBeVisible()
    const board = screen.getByRole('list', { name: 'わたしの棚' })
    expect(within(board).getAllByRole('listitem')).toHaveLength(12)
    expect(within(board).getByRole('link', { name: /12 \/ 12.*周年缶バッジ/ })).toBeVisible()
    go('#/shelf/sanrio-capsule-1')
    expect(screen.getByText(/棚の外/)).toBeVisible()
  })
})

describe('フレンド（デモ）', () => {
  test('まだいっしょに回していないと「まだ友だちはいません」と、戻り道を出す', () => {
    start('#/together')
    expect(heading()).toHaveTextContent('フレンド')
    expect(screen.getByText('まだ友だちはいません')).toBeVisible()
    expect(screen.getByRole('link', { name: 'ガチャを見る' })).toHaveAttribute('href', '#/gacha')
    // まだいっしょに回していない友だちの URL を開いても、マスターにある「今は見られません」の状態を出す
    go('#/friend/yui')
    expect(heading()).toHaveTextContent('今は見られません')
    expect(screen.getByText('ゆいさんの棚は見られません')).toBeVisible()
    expect(screen.getByRole('link', { name: '友だち一覧へ' })).toHaveAttribute('href', '#/together')
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
