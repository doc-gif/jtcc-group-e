// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './domain/storage'
import { TIMING } from './domain/spinScript'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

let store: MemoryStorage

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}
const tick = (ms: number) => { act(() => { vi.advanceTimersByTime(ms) }) }
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const saved = () => JSON.parse(store.getItem(STORAGE_KEY) ?? '{}')

function start(hash = '#/') {
  window.location.hash = hash
  return render(<App storage={store} />)
}

/** ハンドルの代わりに「1タップで1回転」を 3 回押し、カプセルを開ける */
function spinAndOpen() {
  for (let i = 0; i < 3; i += 1) fireEvent.click(button(/1タップで1回転/))
  tick(TIMING.drop)
  for (let i = 0; i < 3; i += 1) {
    const capsule = screen.queryByRole('button', { name: /カプセルをあける/ })
    if (capsule) fireEvent.click(capsule)
  }
  tick(TIMING.open)
}

beforeEach(() => {
  store = new MemoryStorage()
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.99)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('ホーム', () => {
  test('作品・種類・並び替えでガチャを選べる', () => {
    start()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ラストピース')
    expect(screen.getByText('提案モック・公式サービスではありません。', { exact: false })).toBeVisible()
    expect(screen.getAllByRole('article')).toHaveLength(3)
    fireEvent.click(button(/ちいかわ/))
    expect(screen.getByRole('heading', { name: 'ちいかわ バースデーガチャ' })).toBeVisible()
    fireEvent.click(button(/アパレル/))
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0)
    fireEvent.click(button('即完売品'))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    fireEvent.click(button('残りわずか'))
    fireEvent.click(button('新入荷'))
    expect(screen.getAllByRole('article')[0]).toHaveTextContent('バースデー')
    expect(screen.getAllByText(/残り/).length).toBeGreaterThan(0)
  })

  test('条件に合うガチャがないときは、条件をもどせる', () => {
    start()
    fireEvent.click(button(/サンリオ/))
    fireEvent.click(button(/ぬいぐるみ/))
    fireEvent.click(button('即完売品'))
    fireEvent.click(button(/アパレル/))
    fireEvent.click(button(/ぬいぐるみ/))
    fireEvent.click(button('即完売品'))
    const cards = screen.queryAllByRole('article')
    if (cards.length === 0) {
      fireEvent.click(button('条件をもどす'))
    }
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0)
  })
})

describe('ガチャ詳細', () => {
  test('中身の全リストを確率つきで出し、残り口数の数字は出さない', () => {
    start('#/gacha/melody-anniv')
    const list = screen.getAllByRole('list').find((item) => item.className === 'prize-list')!
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(1)
    expect(screen.getByText('会場限定ドレスマスコット')).toBeVisible()
    expect(screen.getAllByText(/%$/).length).toBeGreaterThan(5)
    expect(document.body.textContent).not.toMatch(/残り\s*\d+\s*\/\s*\d+/)
    expect(screen.getByText('✦ 目玉')).toBeVisible()
    expect(screen.getAllByText(/残り/)[0]).toBeVisible()
  })

  test('存在しないガチャは見つからない画面になる', () => {
    start('#/gacha/unknown')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ページが見つかりません')
    go('#/nothing/here/at/all')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ページが見つかりません')
  })
})

describe('ひとりで回す', () => {
  test('3回転してカプセルを開けると、当てたものに記録され、コインが減る', () => {
    start('#/gacha/melody-anniv/spin')
    expect(screen.getByText(/0 \/ 3 回転/)).toBeInTheDocument()
    spinAndOpen()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('使ったコイン', { exact: false })).toBeVisible()
    expect(saved().coins).toBe(1500)
    expect(saved().wins).toHaveLength(1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'もう1回まわす' }))
    expect(screen.getByText(/0 \/ 3 回転/)).toBeInTheDocument()
    spinAndOpen()
    expect(saved().coins).toBe(0)
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /コインが足りないか/ })).toBeDisabled()
  })

  test('コインが足りないと、回す前にマイページへ案内する', () => {
    store.setItem(STORAGE_KEY, JSON.stringify({ ...JSON.parse(JSON.stringify({})), version: 2 }))
    start('#/gacha/melody-anniv')
    go('#/me')
    for (let i = 0; i < 1; i += 1) fireEvent.click(button('データを最初に戻す'))
    fireEvent.click(button('最初に戻す'))
    const data = saved()
    store.setItem(STORAGE_KEY, JSON.stringify({ ...data, coins: 100 }))
    cleanup()
    start('#/gacha/melody-anniv/spin')
    expect(screen.getByText(/コインが足りません/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'マイページでコインを追加' })).toHaveAttribute('href', '#/me')
    go('#/gacha/melody-anniv')
    expect(screen.getByText(/コインが足りません。/)).toBeVisible()
  })
})

describe('友達と回す（デモ）', () => {
  test('ルームを作り、全員そろったら回せる。目玉なら確定演出と結果の一覧が出る', async () => {
    start('#/me')
    fireEvent.click(button(/次の1回を目玉確定にする/))
    expect(saved().forceFeaturedNext).toBe(true)
    go('#/gacha/melody-anniv/room')
    const sheet = screen.getByRole('dialog', { name: '友達と いっしょに回そう' })
    expect(within(sheet).getByRole('link', { name: 'LINEで送る' })).toHaveAttribute('href', expect.stringContaining('line.me'))
    await act(async () => { fireEvent.click(within(sheet).getByRole('button', { name: 'リンクをコピー' })) })
    expect(within(sheet).getByText(/コピーできませんでした|コピーしました/)).toBeInTheDocument()
    const startButton = within(sheet).getByRole('button', { name: /みんなで回す/ })
    expect(startButton).toBeDisabled()
    for (let i = 0; i < 4; i += 1) tick(TIMING.roomStep)
    expect(startButton).toBeEnabled()
    fireEvent.click(startButton)
    go(window.location.hash)
    expect(screen.getByText(/ROOM・3人でいっしょに/)).toBeVisible()
    fireEvent.click(button(/1タップで1回転/))
    fireEvent.click(button(/1タップで1回転/))
    expect(screen.getByText('目玉 確定')).toBeInTheDocument()
    fireEvent.click(button('かわいい！'))
    expect(screen.getByText('かわいい！', { selector: '.member-bubble' })).toBeInTheDocument()
    fireEvent.click(button(/1タップで1回転/))
    tick(TIMING.drop)
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole('button', { name: /カプセルをあける/ }))
    tick(TIMING.open)
    expect(screen.getByText('おめでとうございます！', { selector: '.congrats' })).toBeVisible()
    fireEvent.click(button('みんなの結果を見る'))
    const board = screen.getByRole('dialog', { name: /みんなの結果/ })
    expect(within(board).getAllByText(/カプセルを開けています/)).toHaveLength(2)
    tick(TIMING.friendReveal)
    tick(TIMING.friendReveal)
    expect(within(board).queryByText(/カプセルを開けています/)).toBeNull()
    fireEvent.click(within(board).getAllByRole('button', { name: /いいな〜/ })[0])
    expect(within(board).getByText('送った♡')).toBeVisible()
    expect(saved().wins[0].companions).toEqual(['ゆい', 'さき'])
    expect(saved().forceFeaturedNext).toBe(false)
    fireEvent.click(within(board).getByRole('button', { name: /もう1回、みんなで回す/ }))
    expect(screen.queryByRole('dialog', { name: /みんなの結果/ })).toBeNull()
  })

  test('招待リンクを開いた人は、ニックネームを入れて待ち合わせに入る', () => {
    start('#/room/sumikko-sakura')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('いっしょに回そう♡')
    fireEvent.click(button('ルームに入る'))
    expect(screen.getByText('ニックネームを入れてください')).toBeVisible()
    fireEvent.change(screen.getByLabelText(/ニックネーム/), { target: { value: 'さくら' } })
    fireEvent.click(button('ルームに入る'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('みんなを待っています')
    expect(screen.getByText('さくら（あなた）')).toBeVisible()
    expect(saved().nickname).toBe('さくら')
    go('#/room/unknown')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ページが見つかりません')
  })
})

describe('当てたもの', () => {
  function withWins() {
    start('#/gacha/sanrio-capsule/spin')
    spinAndOpen()
    fireEvent.click(button('もう1回まわす'))
    spinAndOpen()
    go('#/collection')
  }

  test('最初は空。回すと記録され、コインに交換（一律20%）と届けてもらうができる', () => {
    start('#/collection')
    expect(screen.getByText('まだ当てたものはありません。')).toBeVisible()
    cleanup()
    withWins()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    const coins = saved().coins
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(button('コインに交換'))
    const sheet = screen.getByRole('dialog', { name: 'コインに交換しますか？' })
    expect(within(sheet).getByText(/出金はできません/)).toBeVisible()
    expect(within(sheet).getByText(/× 20%/)).toBeVisible()
    fireEvent.click(within(sheet).getByRole('button', { name: 'やめる' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(button('コインに交換'))
    fireEvent.click(button('コインに交換する'))
    expect(saved().coins).toBe(coins + Math.floor(400 * 0.2))
    expect(screen.getByRole('status')).toHaveTextContent('コインに交換しました')
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(button('届けてもらう'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(button('届けてもらう'))
    fireEvent.click(button('届け待ちにする'))
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    fireEvent.click(button(/^✓?\s*届け待ち 1/))
    expect(screen.getAllByText('届け待ち', { selector: '.win-status' })).toHaveLength(1)
    fireEvent.click(button(/交換済み 1/))
    expect(screen.getByText(/コインに交換済み/)).toBeVisible()
    fireEvent.click(button('ちいかわ'))
    expect(screen.getByText('この条件のものはありません。')).toBeVisible()
  })
})

describe('マイページ・はじめて・いっしょに', () => {
  test('コインの追加（デモ）、名前の変更、声と音、データのリセット', () => {
    start('#/me')
    fireEvent.click(button(/\+5,000/))
    expect(saved().coins).toBe(8000)
    const input = screen.getByLabelText(/ルームで友達に見える名前/)
    fireEvent.change(input, { target: { value: ' ' } })
    fireEvent.click(button('保存'))
    expect(screen.getByText('ニックネームを入れてください')).toBeVisible()
    fireEvent.change(input, { target: { value: 'みお' } })
    fireEvent.click(button('保存'))
    expect(saved().nickname).toBe('みお')
    fireEvent.click(button(/ピピの声/))
    fireEvent.click(button(/チャイムと振動/))
    expect(saved()).toMatchObject({ voiceOn: true, soundOn: true })
    fireEvent.click(button('データを最初に戻す'))
    fireEvent.click(button('やめる'))
    fireEvent.click(button('データを最初に戻す'))
    fireEvent.click(button('最初に戻す'))
    expect(saved()).toMatchObject({ coins: 3000, nickname: 'あなた', voiceOn: false })
  })

  test('はじめての画面でニックネームを決めると、ホームの案内が消える', () => {
    start()
    expect(screen.getByRole('link', { name: /はじめての方へ/ })).toHaveAttribute('href', '#/welcome')
    go('#/welcome')
    fireEvent.click(button('はじめる'))
    expect(screen.getByText('ニックネームを入れてください')).toBeVisible()
    fireEvent.change(screen.getByLabelText(/ニックネーム/), { target: { value: 'あや' } })
    fireEvent.click(button('はじめる'))
    go('#/')
    expect(screen.queryByRole('link', { name: /はじめての方へ/ })).toBeNull()
  })

  test('いっしょに：ガチャを選んでルームを作れる', () => {
    start('#/together')
    expect(screen.getByText(/まだありません/)).toBeVisible()
    expect(screen.getAllByRole('link', { name: /友達と回す/ })[0]).toHaveAttribute('href', '#/gacha/melody-anniv/room')
  })

  test('保存できない端末では、その旨を伝えて遊べる', () => {
    const broken = { getItem: () => null, setItem: () => { throw new Error('quota') } }
    window.location.hash = '#/'
    render(<App storage={broken} />)
    expect(screen.getByRole('status')).toHaveTextContent('記録を保存できません')
  })
})
