// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import { createInitialState } from './domain/game'
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

/** 回す前の確認で確定し、ハンドルの代わりに「1タップで1回転」を 3 回押し、カプセルを開ける */
function spinAndOpen() {
  fireEvent.click(button(/コイン使って1回引く/))
  for (let i = 0; i < 3; i += 1) fireEvent.click(button(/1タップで1回転/))
  tick(TIMING.drop)
  for (let i = 0; i < 3; i += 1) {
    const capsule = screen.queryByRole('button', { name: /カプセルをタップ/ })
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

describe('街（ホーム）と下のタブ', () => {
  const heading = () => screen.getByRole('heading', { level: 1 })

  test('街から、ガチャのお店・コレクション・フレンドと注目のピースへ行ける', () => {
    start()
    expect(heading()).toHaveTextContent('ラストピース')
    expect(screen.getByText('提案モック・公式サービスではありません。', { exact: false })).toBeVisible()
    expect(screen.getByRole('link', { name: /デモのコイン残高 3,000/ })).toHaveAttribute('href', '#/me')
    const map = screen.getByRole('region', { name: /街の地図/ })
    expect(within(map).getByRole('link', { name: 'ガチャのお店' })).toHaveAttribute('href', '#/gacha')
    expect(within(map).getByRole('link', { name: 'コレクション' })).toHaveAttribute('href', '#/shelf')
    expect(within(map).getByRole('link', { name: 'フレンド' })).toHaveAttribute('href', '#/together')
    expect(within(map).getByText('当てたもの 0')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /注目のピース/ })).toHaveAttribute('href', '#/gacha/melody-anniv')
    expect(screen.getByRole('link', { name: 'ガチャのお店へ' })).toHaveAttribute('href', '#/gacha')
    expect(screen.getByRole('link', { name: /当てたもの 0点/ })).toHaveAttribute('href', '#/collection')
  })

  test('街の地図はマウスでドラッグでき、ドラッグの終わりで場所のリンクを押したことにしない', () => {
    start()
    const map = screen.getByRole('region', { name: /街の地図/ })
    expect(map).toHaveAttribute('tabindex', '0')
    const shop = within(map).getByRole('link', { name: 'ガチャのお店' })
    const clicked = vi.fn((event: Event) => event.preventDefault())
    shop.addEventListener('click', clicked)
    fireEvent.pointerDown(map, { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(map, { pointerType: 'mouse', pointerId: 1, clientX: 60, clientY: 70 })
    expect(map).toHaveClass('is-dragging')
    fireEvent.pointerUp(map, { pointerType: 'mouse', pointerId: 1, clientX: 60, clientY: 70 })
    expect(map).not.toHaveClass('is-dragging')
    fireEvent.click(shop)
    expect(clicked).not.toHaveBeenCalled()
    tick(1)
    // ほとんど動かさないタップは、そのままリンクとして押せる
    fireEvent.pointerDown(map, { pointerType: 'mouse', button: 0, pointerId: 2, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(map, { pointerType: 'mouse', pointerId: 2, clientX: 101, clientY: 101 })
    fireEvent.pointerUp(map, { pointerType: 'mouse', pointerId: 2, clientX: 101, clientY: 101 })
    fireEvent.click(shop)
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  test('下のタブは4つ（街・ガチャ・コレクション・フレンド）で、いまの画面を示す', () => {
    start()
    const nav = () => screen.getByRole('navigation', { name: 'メイン' })
    expect(within(nav()).getAllByRole('link').map((link) => link.textContent)).toEqual(['街', 'ガチャ', 'コレクション', 'フレンド'])
    expect(within(nav()).getByRole('link', { name: '街' })).toHaveAttribute('aria-current', 'page')
    for (const [hash, name, title] of [['#/gacha', 'ガチャ', 'ガチャのお店'], ['#/shelf', 'コレクション', 'わたしの棚'], ['#/collection', 'コレクション', '当てたもの'], ['#/together', 'フレンド', 'フレンド']] as const) {
      go(hash)
      expect(heading()).toHaveTextContent(title)
      expect(within(nav()).getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
      expect(within(nav()).getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(1)
    }
    expect(within(nav()).getByRole('link', { name: 'コレクション' })).toHaveAttribute('href', '#/shelf')
    go('#/me')
    expect(within(nav()).queryAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(0)
  })

  test('アプリを開いた直後は導入が出て、3秒で街に着く。再読み込みでくり返さない', () => {
    start('')
    expect(heading()).toHaveTextContent('好きが集まる、あなたの街へ。')
    expect(screen.getByText('提案モック・公式サービスではありません')).toBeVisible()
    expect(screen.queryByRole('navigation', { name: 'メイン' })).toBeNull()
    // 導入の地図は飾りなので、読み上げと焦点の対象から外す
    const preview = document.querySelector('.opening-town')
    expect(preview).toHaveAttribute('aria-hidden', 'true')
    expect(preview).toHaveAttribute('inert')
    tick(1200)
    expect(heading()).toHaveTextContent('いっしょに、わくわくを開けよう。')
    tick(1799)
    expect(heading()).toHaveTextContent('いっしょに')
    tick(1)
    expect(heading()).toHaveTextContent('ラストピース')
    expect(window.location.hash).toBe('#/')
    expect(heading()).toHaveFocus()
    cleanup()
    render(<App storage={store} />)
    expect(heading()).toHaveTextContent('ラストピース')
  })

  test('導入はスキップでも、すぐに街へでも飛ばせる', () => {
    start('')
    fireEvent.click(button('スキップ'))
    expect(heading()).toHaveTextContent('ラストピース')
    expect(window.location.hash).toBe('#/')
    tick(5000)
    expect(heading()).toHaveTextContent('ラストピース')
    cleanup()
    start('')
    fireEvent.click(button('すぐに街へ'))
    expect(heading()).toHaveTextContent('ラストピース')
  })

  test('動きを減らす設定では、導入を1枚にして自動で進めない', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} }))
    try {
      start('')
      expect(heading()).toHaveTextContent('ようこそ、ラストピースへ。')
      tick(10000)
      expect(heading()).toHaveTextContent('ようこそ')
      fireEvent.click(button('街へ'))
      expect(heading()).toHaveTextContent('ラストピース')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('ガチャのお店（一覧）', () => {
  test('作品・種類・並び替えでガチャを選べる', () => {
    start('#/gacha')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ガチャのお店')
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
    start('#/gacha')
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
    expect(within(list).getByText('会場限定ドレスマスコット')).toBeVisible()
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
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('回す前に')
    expect(screen.getByText(/所持 3,000/)).toHaveTextContent('確定後 1,500')
    spinAndOpen()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('使ったコイン', { exact: false })).toBeVisible()
    expect(saved().coins).toBe(1500)
    expect(saved().wins).toHaveLength(1)
    expect(within(dialog).getByText(/残高 1,500/)).toBeVisible()
    fireEvent.click(within(dialog).getByRole('button', { name: 'もう1回まわす' }))
    expect(screen.getByText(/所持 1,500/)).toHaveTextContent('確定後 0')
    expect(saved().coins).toBe(1500)
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

describe('ガチャの流れ（T08）', () => {
  const heading = () => screen.getByRole('heading', { level: 1 })
  const seed = (patch: Partial<ReturnType<typeof createInitialState>>) => store.setItem(STORAGE_KEY, JSON.stringify({ ...createInitialState(), ...patch }))

  test('一覧 → 詳細 → 中身と確率 → 回す前の確認。確定するまでコインは減らない', () => {
    start('#/gacha')
    expect(screen.getByRole('link', { name: /サンリオ カプセルミックスの中身を見る/ })).toHaveAttribute('href', '#/gacha/sanrio-capsule')
    go('#/gacha/sanrio-capsule')
    expect(screen.getByText('目玉の候補')).toBeVisible()
    expect(screen.getByText(/所持 3,000/)).toHaveTextContent('引いた後 2,500')
    expect(screen.getByRole('link', { name: '中身9種と確率を見る' })).toHaveAttribute('href', '#/gacha/sanrio-capsule/odds')
    expect(screen.getByRole('link', { name: /1回引く準備へ/ })).toHaveAttribute('href', '#/gacha/sanrio-capsule/spin')
    go('#/gacha/sanrio-capsule/odds')
    expect(heading()).toHaveTextContent('中身と確率')
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(9)
    expect(rows[0]).toHaveTextContent(/ぬいぐるみマスコット.*%/)
    expect(document.body.textContent).not.toMatch(/残り\s*\d+\s*\/\s*\d+/)
    expect(screen.getByRole('link', { name: '500コインで1回引く準備へ' })).toHaveAttribute('href', '#/gacha/sanrio-capsule/spin')
    go('#/gacha/sanrio-capsule/spin')
    expect(heading()).toHaveTextContent('回す前に')
    expect(screen.queryByRole('button', { name: /1タップで1回転/ })).toBeNull()
    expect(screen.getByRole('link', { name: /詳細へ/ })).toHaveAttribute('href', '#/gacha/sanrio-capsule')
    expect(saved().coins).toBe(3000)
    fireEvent.click(button('500コイン使って1回引く'))
    expect(saved().coins).toBe(2500)
    expect(saved().wins).toHaveLength(1)
    expect(button('1タップで1回転')).toHaveFocus()
    expect(heading()).toHaveTextContent('ハンドルを回す')
    expect(screen.getByText('回転 0 / 3')).toBeInTheDocument()
    expect(screen.getByText(/500コイン使用済み・残高 2,500/)).toBeVisible()
    fireEvent.click(button('1タップで1回転'))
    expect(screen.getByText('回転 1 / 3')).toBeInTheDocument()
  })

  test('目玉は3段階で開き、段階ごとに「開封 N / 3」が進む。結果は残高と記録先を出す', () => {
    seed({ forceFeaturedNext: true })
    start('#/gacha/sanrio-capsule/spin')
    fireEvent.click(button(/コイン使って1回引く/))
    for (let i = 0; i < 3; i += 1) fireEvent.click(button('1タップで1回転'))
    tick(TIMING.drop)
    const dialog = screen.getByRole('dialog', { name: 'カプセルをひらく' })
    expect(within(dialog).getByText('開封 1 / 3')).toBeVisible()
    expect(within(dialog).getByText(/提案モック・公式サービスではありません/)).toBeVisible()
    fireEvent.click(within(dialog).getByRole('button', { name: /あと3回/ }))
    expect(within(dialog).getByText('開封 2 / 3')).toBeVisible()
    fireEvent.click(within(dialog).getByRole('button', { name: /あと2回/ }))
    expect(within(dialog).getByText('開封 3 / 3')).toBeVisible()
    fireEvent.click(within(dialog).getByRole('button', { name: /あと1回/ }))
    tick(TIMING.open)
    const result = screen.getByRole('dialog', { name: 'ぬいぐるみマスコット' })
    expect(within(result).getByText('今回の結果')).toBeVisible()
    expect(within(result).getByText('500コイン使用・残高 2,500・1点を獲得')).toBeVisible()
    expect(within(result).getByRole('heading', { name: 'ぬいぐるみマスコット' })).toHaveFocus()
    expect(within(result).getByRole('link', { name: '街へ戻る' })).toHaveAttribute('href', '#/')
    expect(within(result).getByText('この1点は「当てたもの」に記録しました。')).toBeVisible()
    expect(within(result).getByText(/提案モック・公式サービスではありません/)).toBeVisible()
  })

  test('回帰：保存できない端末では、結果に「記録しました」と出さず保存できないことを伝える', () => {
    const broken = { getItem: () => null, setItem: () => { throw new Error('quota') } }
    window.location.hash = '#/gacha/sanrio-capsule/spin'
    render(<App storage={broken} />)
    spinAndOpen()
    const result = screen.getByRole('dialog')
    expect(within(result).queryByText(/に記録しました/)).toBeNull()
    expect(within(result).getByRole('status')).toHaveTextContent('この端末では記録を保存できません')
  })

  test('売り切れは回す操作を出さず、コインは減らない', () => {
    const gacha = { 'sanrio-capsule': Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`sanrio-capsule-${i + 1}`, 0])) }
    seed({ stock: { ...createInitialState().stock, ...gacha } })
    start('#/gacha/sanrio-capsule')
    expect(screen.getByRole('status')).toHaveTextContent('このガチャは売り切れました')
    // 回帰：回せないときは、詳細と確率の画面でも回す操作を出さない
    expect(screen.getByText(/所持 3,000/)).toHaveTextContent('売り切れのため引けません')
    expect(screen.getByRole('link', { name: '1回引く準備へ' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('link', { name: '1回引く準備へ' })).not.toHaveAttribute('href')
    go('#/gacha/sanrio-capsule/odds')
    expect(screen.getByRole('status')).toHaveTextContent('抽選はできません')
    expect(screen.getByRole('link', { name: '500コインで1回引く準備へ' })).not.toHaveAttribute('href')
    go('#/gacha/sanrio-capsule/spin')
    expect(heading()).toHaveTextContent('売り切れ')
    expect(screen.getByText('抽選はできません。コインは減っていません。')).toBeVisible()
    expect(screen.getByText(/いまの残高/)).toHaveTextContent('いまの残高 3,000 コイン')
    expect(screen.queryByRole('button', { name: /引く|1回転/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'ガチャ一覧に戻る' })).toHaveAttribute('href', '#/gacha')
    expect(saved().coins).toBe(3000)
  })

  test('コイン不足は、足りない分と残高を出して支払わない', () => {
    seed({ coins: 100 })
    start('#/gacha/sanrio-capsule/odds')
    expect(screen.getByRole('status')).toHaveTextContent('コインが足りません')
    expect(screen.getByRole('link', { name: '500コインで1回引く準備へ' })).toHaveAttribute('aria-disabled', 'true')
    go('#/gacha/sanrio-capsule')
    expect(screen.getByRole('link', { name: '1回引く準備へ' })).not.toHaveAttribute('href')
    go('#/gacha/sanrio-capsule/spin')
    expect(heading()).toHaveTextContent('コイン不足')
    expect(screen.getByText(/あと/)).toHaveTextContent('あと 400 コイン')
    expect(screen.getByText('今回は引けません')).toBeVisible()
    expect(screen.queryByRole('button', { name: /引く|1回転/ })).toBeNull()
    expect(saved().coins).toBe(100)
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
    fireEvent.click(button(/コイン使って1回引く/))
    expect(screen.getByText(/ROOM・3人でいっしょに/)).toBeVisible()
    fireEvent.click(button(/1タップで1回転/))
    fireEvent.click(button(/1タップで1回転/))
    expect(screen.getByText('目玉 確定')).toBeInTheDocument()
    fireEvent.click(button('かわいい！'))
    expect(screen.getByText('かわいい！', { selector: '.member-bubble' })).toBeInTheDocument()
    fireEvent.click(button(/1タップで1回転/))
    tick(TIMING.drop)
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole('button', { name: /カプセルをタップ/ }))
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

  test('フレンド：まだ友だちがいないと、ガチャへ案内する（ルームはガチャ詳細の「友達と回す」から作る）', () => {
    start('#/together')
    expect(screen.getByText('まだ友だちはいません')).toBeVisible()
    expect(screen.getByRole('link', { name: 'ガチャを見る' })).toHaveAttribute('href', '#/gacha')
    go('#/gacha/melody-anniv')
    expect(screen.getByRole('link', { name: /友達と回す/ })).toHaveAttribute('href', '#/gacha/melody-anniv/room')
  })

  test('保存できない端末では、その旨を伝えて遊べる', () => {
    const broken = { getItem: () => null, setItem: () => { throw new Error('quota') } }
    window.location.hash = '#/'
    render(<App storage={broken} />)
    expect(screen.getByRole('status')).toHaveTextContent('記録を保存できません')
  })
})
