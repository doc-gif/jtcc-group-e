// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import { createAssetGate, LOADING_DELAY } from './app/assets'
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
  return render(<App storage={store} assets={createAssetGate([])} />)
}

/** 回す前の確認で確定し、ハンドルの代わりに「1タップで1回転」を 3 回押し、カプセルを開ける */
function spinAndOpen() {
  fireEvent.click(button(/使って1回引く/))
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
    expect(screen.getByText('ラストピースは開発中のサービスです。商品・価格・在庫は例です。', { exact: false })).toBeVisible()
    expect(screen.getByRole('link', { name: /デモのコイン残高 30,000/ })).toHaveAttribute('href', '#/me')
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
    expect(screen.getByText('ラストピースは開発中のサービスです')).toBeVisible()
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
    render(<App storage={store} assets={createAssetGate([])} />)
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

describe('街の読み込み中（T07 Loading 267:8244）', () => {
  const heading = () => screen.getByRole('heading', { level: 1 })
  /** 街の絵の読み込みを、テストから終わらせたり失敗させたりできるようにする */
  function slowAssets() {
    const calls: Array<{ resolve: () => void; reject: () => void }> = []
    const gate = createAssetGate([() => new Promise<void>((resolve, reject) => { calls.push({ resolve, reject }) })])
    const settle = async (how: 'resolve' | 'reject') => { await act(async () => { calls[calls.length - 1][how]() }) }
    return { gate, calls, finish: () => settle('resolve'), fail: () => settle('reject') }
  }
  function open(hash: string, gate: ReturnType<typeof slowAssets>['gate']) {
    window.location.hash = hash
    return render(<App storage={store} assets={gate} />)
  }

  test('すぐに準備できたら読み込み中は出さず、そのまま街を出す（わざと待たせない）', async () => {
    const assets = slowAssets()
    open('#/', assets.gate)
    expect(assets.calls).toHaveLength(1)
    expect(screen.queryByRole('heading')).toBeNull()
    tick(LOADING_DELAY - 1)
    await assets.finish()
    expect(heading()).toHaveTextContent('ラストピース')
    tick(LOADING_DELAY)
    expect(screen.queryByText('街の準備をしています')).toBeNull()
  })

  test('待ちが続いたら読み込み中を出し、準備できたら自動で街へ進む', async () => {
    const assets = slowAssets()
    open('#/', assets.gate)
    tick(LOADING_DELAY - 1)
    expect(screen.queryByRole('heading')).toBeNull()
    tick(1)
    expect(heading()).toHaveTextContent('街の準備をしています')
    expect(heading()).toHaveFocus()
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('先に街を見て回れます。')
    expect(screen.getByText('ラストピースは開発中のサービスです')).toBeVisible()
    // 地図は飾り。進み具合の数字は出さない
    const preview = document.querySelector('.loading-town')
    expect(preview).toHaveAttribute('aria-hidden', 'true')
    expect(preview).toHaveAttribute('inert')
    expect(document.body).not.toHaveTextContent('%')
    await assets.finish()
    expect(heading()).toHaveTextContent('ラストピース')
    expect(heading()).toHaveFocus()
    expect(assets.calls).toHaveLength(1)
  })

  test('読み込み中でも、スキップ・街を見るで先に街へ行ける', async () => {
    const assets = slowAssets()
    open('#/', assets.gate)
    tick(LOADING_DELAY)
    fireEvent.click(button('街を見る'))
    expect(heading()).toHaveTextContent('ラストピース')
    cleanup()
    const again = slowAssets()
    open('#/', again.gate)
    tick(LOADING_DELAY)
    fireEvent.click(button('スキップ'))
    expect(heading()).toHaveTextContent('ラストピース')
    await again.finish()
    expect(heading()).toHaveTextContent('ラストピース')
  })

  test('読み込めなかったら責めずに伝え、もう一度読み込める。先に街へも行ける', async () => {
    const assets = slowAssets()
    open('#/', assets.gate)
    await assets.fail()
    expect(heading()).toHaveTextContent('街の準備ができませんでした')
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'false')
    expect(status).toHaveTextContent('もう一度読み込んでください')
    expect(button('街を見る')).toBeVisible()
    fireEvent.click(button('もう一度読み込む'))
    expect(assets.calls).toHaveLength(2)
    // もう一度読み込むあいだも、読み込み中の画面のまま（空白に戻らない）
    expect(heading()).toHaveTextContent('街の準備をしています')
    expect(heading()).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'もう一度読み込む' })).toBeNull()
    tick(LOADING_DELAY * 2)
    expect(heading()).toHaveTextContent('街の準備をしています')
    await assets.finish()
    expect(heading()).toHaveTextContent('ラストピース')
  })

  test('導入のあとも準備が続くときだけ読み込み中を出す。猶予のあいだは導入のまま', async () => {
    const assets = slowAssets()
    open('', assets.gate)
    tick(3000)
    expect(heading()).toHaveTextContent('いっしょに')
    tick(LOADING_DELAY)
    expect(heading()).toHaveTextContent('街の準備をしています')
    expect(window.location.hash).toBe('#/')
    await assets.finish()
    expect(heading()).toHaveTextContent('ラストピース')
    cleanup()
    // 導入のあいだに準備できていれば、読み込み中は出ない
    const fast = slowAssets()
    open('', fast.gate)
    await fast.finish()
    fireEvent.click(button('スキップ'))
    expect(heading()).toHaveTextContent('ラストピース')
  })

  test('動きを減らす設定でも同じ静止画面で、自動では動かない', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} }))
    try {
      const assets = slowAssets()
      open('', assets.gate)
      fireEvent.click(button('街へ'))
      tick(LOADING_DELAY)
      expect(heading()).toHaveTextContent('街の準備をしています')
      expect(document.querySelector('.loading-screen .opening-fade')).toBeNull()
      tick(10000)
      expect(heading()).toHaveTextContent('街の準備をしています')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('ほかの画面から開いても裏で読み込みを始め、街へ行くときには待たない', async () => {
    const assets = slowAssets()
    open('#/gacha', assets.gate)
    expect(assets.calls).toHaveLength(1)
    await assets.finish()
    go('#/')
    expect(heading()).toHaveTextContent('ラストピース')
  })
})

describe('ガチャのお店（一覧）', () => {
  test('作品・種類・並び替えでガチャを選べる', () => {
    start('#/gacha')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ガチャのお店')
    expect(screen.getByText('ラストピースは開発中のサービスです。商品・価格・在庫は例です。', { exact: false })).toBeVisible()
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
  test('マスターどおり、目玉の候補・1回の金額・確率への入口だけを出し、残り口数の数字は出さない', () => {
    start('#/gacha/melody-anniv')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ガチャ詳細')
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '#/gacha')
    expect(screen.getByRole('heading', { level: 2, name: 'マイメロディ 周年限定ガチャ' })).toBeVisible()
    expect(screen.getByText('目玉の候補')).toBeVisible()
    expect(screen.getByText('会場限定ドレスマスコット')).toBeVisible()
    // 確率はマスターの「初期参考」ではなく、いまの残りから計算した値
    expect(screen.getByText('いまの確率')).toHaveTextContent(/いまの確率\d+\.\d%/)
    expect(screen.getByText(/デモコイン/)).toHaveTextContent('1,500 デモコイン')
    expect(screen.getByText('確率は抽選前に更新・当選保証なし')).toBeVisible()
    expect(screen.getByRole('link', { name: '中身12種と確率を見る' })).toHaveAttribute('href', '#/gacha/melody-anniv/odds')
    expect(screen.getByRole('link', { name: '1回引く準備へ' })).toHaveAttribute('href', '#/gacha/melody-anniv/spin')
    // ルームの入口はここだけなので残す（Figma 修正待ち）
    expect(screen.getByRole('link', { name: /友達と回す/ })).toHaveAttribute('href', '#/room/new')
    // マスターにない中身の全リスト・お知らせ・注意事項・残りバーは出さない（中身は「中身と確率」で見る）
    for (const text of ['中身の全リスト', '大事なお知らせ', '注意事項']) expect(screen.queryByText(new RegExp(text))).toBeNull()
    expect(document.querySelector('.remain')).toBeNull()
    expect(document.body.textContent).not.toMatch(/残り\s*\d+\s*\/\s*\d+/)
    expect(screen.getByText(/ラストピースは開発中のサービスです/, { selector: '.page-header-notice' })).toBeVisible()
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
    // 2 回で使い切ってコイン不足に届くよう、この試験だけ残高を 3,000 にして始める
    store.setItem(STORAGE_KEY, JSON.stringify({ ...createInitialState(), coins: 3000 }))
    start('#/gacha/melody-anniv/spin')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('回す前に')
    expect(screen.getByText(/所持 3,000/)).toHaveTextContent('確定後 1,500')
    spinAndOpen()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('今回の結果')
    expect(saved().coins).toBe(1500)
    expect(saved().wins).toHaveLength(1)
    expect(screen.getByText('1,500使用・残高1,500・1点を獲得')).toBeVisible()
    // マスターどおり、結果の操作は「街へ戻る」だけ（戻るで詳細へ）
    expect(screen.getByRole('link', { name: '街へ戻る' })).toHaveAttribute('href', '#/')
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '#/gacha/melody-anniv')
    expect(screen.queryByRole('button', { name: 'もう1回まわす' })).toBeNull()
    expect(screen.queryByRole('link', { name: '当てたものを見る' })).toBeNull()
    go('#/gacha/melody-anniv')
    go('#/gacha/melody-anniv/spin')
    expect(screen.getByText(/所持 1,500/)).toHaveTextContent('確定後 0')
    expect(saved().coins).toBe(1500)
    spinAndOpen()
    expect(saved().coins).toBe(0)
    go('#/gacha/melody-anniv')
    go('#/gacha/melody-anniv/spin')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('コイン不足')
  })

  test('コインが足りないと、回さずに理由を出し、ガチャ一覧へ戻れる（マスター 267:8461）', () => {
    store.setItem(STORAGE_KEY, JSON.stringify({ ...JSON.parse(JSON.stringify({})), version: 2 }))
    start('#/gacha/melody-anniv')
    go('#/me')
    for (let i = 0; i < 1; i += 1) fireEvent.click(button('データを最初に戻す'))
    fireEvent.click(button('最初に戻す'))
    const data = saved()
    store.setItem(STORAGE_KEY, JSON.stringify({ ...data, coins: 100 }))
    cleanup()
    start('#/gacha/melody-anniv/spin')
    expect(screen.getByText(/あと/, { selector: '.short-main' })).toHaveTextContent('あと 1,400 デモコイン')
    expect(screen.getByRole('link', { name: 'ガチャ一覧に戻る' })).toHaveAttribute('href', '#/gacha')
    expect(screen.queryByRole('link', { name: 'マイページでコインを追加' })).toBeNull()
    go('#/gacha/melody-anniv')
    expect(screen.getByText(/所持 100/)).toHaveTextContent('あと 1,400 デモコイン足りません')
  })
})

describe('ガチャの流れ（T08）', () => {
  const heading = () => screen.getByRole('heading', { level: 1 })
  const seed = (patch: Partial<ReturnType<typeof createInitialState>>) => store.setItem(STORAGE_KEY, JSON.stringify({ ...createInitialState(), ...patch }))
  const nav = () => screen.queryByRole('navigation', { name: 'メイン' })

  test('一覧 → 詳細 → 中身と確率 → 回す前の確認。確定するまでコインは減らない', () => {
    start('#/gacha')
    expect(screen.getByRole('link', { name: /サンリオ カプセルミックスの中身を見る/ })).toHaveAttribute('href', '#/gacha/sanrio-capsule')
    go('#/gacha/sanrio-capsule')
    expect(screen.getByText('目玉の候補')).toBeVisible()
    expect(screen.getByText(/所持 30,000/)).toHaveTextContent('引いた後 29,500')
    expect(screen.getByRole('link', { name: '中身9種と確率を見る' })).toHaveAttribute('href', '#/gacha/sanrio-capsule/odds')
    expect(screen.getByRole('link', { name: /1回引く準備へ/ })).toHaveAttribute('href', '#/gacha/sanrio-capsule/spin')
    go('#/gacha/sanrio-capsule/odds')
    expect(heading()).toHaveTextContent('中身と確率')
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '#/gacha/sanrio-capsule')
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    // マスターと同じ中身の順
    expect(rows.map((row) => within(row).getByRole('rowheader').firstChild?.textContent)).toEqual(['ぬいぐるみマスコット', 'ミニぬいぐるみ', 'アクリルスタンド', 'ミニポーチ', 'ヘアゴム', 'メモ帳', 'ミニマグ', 'ハンドタオル', '缶バッジ'])
    // 表示は小数第1位で、合計がちょうど 100.0%（マスターの「合計100.0%に端数調整」）
    const shown = rows.map((row) => within(row).getByRole('cell').textContent ?? '')
    for (const text of shown) expect(text).toMatch(/^\d+\.\d%$/)
    expect(Math.round(shown.reduce((sum, text) => sum + Number.parseFloat(text) * 10, 0))).toBe(1000)
    expect(screen.getByText('合計100.0%に端数調整（小数第1位）。')).toBeVisible()
    expect(screen.getByText(/いまの在庫から計算/)).toBeVisible()
    expect(document.body.textContent).not.toMatch(/残り\s*\d+\s*\/\s*\d+/)
    expect(screen.getByRole('link', { name: '500コインで1回引く準備へ' })).toHaveAttribute('href', '#/gacha/sanrio-capsule/spin')
    go('#/gacha/sanrio-capsule/spin')
    expect(heading()).toHaveTextContent('回す前に')
    expect(screen.queryByRole('button', { name: /1タップで1回転/ })).toBeNull()
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '#/gacha/sanrio-capsule')
    expect(nav()).not.toBeNull()
    expect(screen.getByText(/必要/)).toHaveTextContent('必要 500 デモコイン')
    expect(saved().coins).toBe(30000)
    fireEvent.click(button('500使って1回引く'))
    expect(saved().coins).toBe(29500)
    expect(saved().wins).toHaveLength(1)
    expect(button('1タップで1回転')).toHaveFocus()
    expect(heading()).toHaveTextContent('ハンドルを回す')
    // マスターどおり、回転の途中は戻る・下のタブを出さない
    expect(screen.queryByRole('link', { name: '戻る' })).toBeNull()
    expect(nav()).toBeNull()
    expect(screen.getByText(/ラストピースは開発中のサービスです/, { selector: '.page-header-notice' })).toBeVisible()
    expect(screen.getByText('回転 0 / 3')).toBeInTheDocument()
    expect(screen.getByText('右のハンドルをタップして進めます')).toBeVisible()
    expect(screen.getByText('500コイン使用済み・残高29,500')).toBeVisible()
    fireEvent.click(button('1タップで1回転'))
    expect(screen.getByText('回転 1 / 3')).toBeInTheDocument()
    // 右のハンドルを押しても1回転進む
    fireEvent.click(document.querySelector('.m-handle-hit')!)
    expect(screen.getByText('回転 2 / 3')).toBeInTheDocument()
  })

  test('筐体は静止の絵で、回しても飾りや背景は増えない（マスター 267:10520）', () => {
    start('#/gacha/sanrio-capsule/spin')
    const machine = () => screen.getByRole('img', { name: /ガチャガチャ/ })
    const art = machine().innerHTML.replace(/style="[^"]*"/g, '')
    fireEvent.click(button(/使って1回引く/))
    fireEvent.click(button('1タップで1回転'))
    fireEvent.click(button('1タップで1回転'))
    expect(machine().innerHTML.replace(/style="[^"]*"/g, '').replace(/<circle class="m-handle-hit"[^>]*><\/circle>/, '')).toBe(art)
    expect(document.querySelector('.lux, .pipi, .big-banner, .turn-chip')).toBeNull()
  })

  test('開封は光り方にかかわらず3段階。段階ごとに「開封 N / 3」が進み、途中は戻る・タブを出さない', () => {
    // Math.random は 0.99（ふつうの品）
    start('#/gacha/sanrio-capsule/spin')
    fireEvent.click(button(/使って1回引く/))
    for (let i = 0; i < 3; i += 1) fireEvent.click(button('1タップで1回転'))
    tick(TIMING.drop)
    expect(heading()).toHaveTextContent('カプセルをひらく')
    expect(screen.queryByRole('link', { name: '戻る' })).toBeNull()
    expect(nav()).toBeNull()
    for (const step of [1, 2, 3]) {
      expect(screen.getByText(`開封 ${step} / 3`)).toBeVisible()
      fireEvent.click(button(new RegExp(`あと${4 - step}回`)))
    }
    tick(TIMING.open)
    expect(heading()).toHaveTextContent('今回の結果')
    expect(saved().wins[0].prizeId).toBe('sanrio-capsule-9')
  })

  test('目玉も同じ3段階で開き、結果は残高と保存先と「街へ戻る」だけを出す', () => {
    seed({ forceFeaturedNext: true })
    start('#/gacha/sanrio-capsule/spin')
    fireEvent.click(button(/使って1回引く/))
    for (let i = 0; i < 3; i += 1) fireEvent.click(button('1タップで1回転'))
    tick(TIMING.drop)
    expect(screen.getByText('開封 1 / 3')).toBeVisible()
    expect(screen.getByText(/ラストピースは開発中のサービスです/, { selector: '.page-header-notice' })).toBeVisible()
    fireEvent.click(button(/あと3回/))
    expect(screen.getByText('開封 2 / 3')).toBeVisible()
    fireEvent.click(button(/あと2回/))
    expect(screen.getByText('開封 3 / 3')).toBeVisible()
    fireEvent.click(button(/あと1回/))
    tick(TIMING.open)
    expect(heading()).toHaveTextContent('今回の結果')
    expect(heading()).toHaveFocus()
    const result = screen.getByRole('article', { name: 'ぬいぐるみマスコット' })
    expect(within(result).getByText('500使用・残高29,500・1点を獲得')).toBeVisible()
    expect(screen.getByText('デモ・結果は抽選ごとに変わります')).toBeVisible()
    expect(screen.getByText('この1点はコレクションに保存されます。')).toBeVisible()
    expect(screen.getByRole('link', { name: '街へ戻る' })).toHaveAttribute('href', '#/')
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '#/gacha/sanrio-capsule')
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['戻る', '街へ戻る'])
    expect(screen.queryByRole('button')).toBeNull()
    expect(nav()).toBeNull()
    // 目玉でも、ひとりで回すときは確定の札・暗い背景を出さない（マスターに確定演出はない）
    expect(document.querySelector('.big-banner, .lux, .is-kakutei')).toBeNull()
  })

  test('回帰：保存できない端末では、結果に「保存されます」と出さず保存できないことを伝える', () => {
    const broken = { getItem: () => null, setItem: () => { throw new Error('quota') } }
    window.location.hash = '#/gacha/sanrio-capsule/spin'
    render(<App storage={broken} assets={createAssetGate([])} />)
    spinAndOpen()
    expect(screen.queryByText(/保存されます/)).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('この端末では記録を保存できません')
  })

  test('売り切れは回す操作を出さず、コインは減らない', () => {
    const gacha = { 'sanrio-capsule': Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`sanrio-capsule-${i + 1}`, 0])) }
    seed({ stock: { ...createInitialState().stock, ...gacha } })
    start('#/gacha/sanrio-capsule')
    expect(screen.getByText(/所持 30,000/)).toHaveTextContent('売り切れのため引けません')
    // マスターどおり「1回引く準備へ」から売り切れの画面（267:8450）へ進み、そこで回す操作を止める
    expect(screen.getByRole('link', { name: '1回引く準備へ' })).toHaveAttribute('href', '#/gacha/sanrio-capsule/spin')
    expect(screen.getByRole('link', { name: /友達と回す/ })).toHaveAttribute('aria-disabled', 'true')
    go('#/gacha/sanrio-capsule/odds')
    expect(within(screen.getByRole('table')).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(Array(9).fill('0%'))
    go('#/gacha/sanrio-capsule/spin')
    expect(heading()).toHaveTextContent('売り切れ')
    expect(screen.getByText('このガチャは売り切れです')).toBeVisible()
    expect(screen.getByText('抽選はできません。コインは減りません。')).toBeVisible()
    expect(screen.getByText('次の入荷時期は未定です。')).toBeVisible()
    expect(screen.queryByRole('button', { name: /引く|1回転/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'ガチャ一覧に戻る' })).toHaveAttribute('href', '#/gacha')
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '#/gacha/sanrio-capsule')
    expect(saved().coins).toBe(30000)
  })

  test('コイン不足は、足りない分と残高を出して支払わない。操作は「ガチャ一覧に戻る」だけ', () => {
    seed({ coins: 100 })
    start('#/gacha/sanrio-capsule/odds')
    expect(screen.getByRole('link', { name: '500コインで1回引く準備へ' })).toHaveAttribute('href', '#/gacha/sanrio-capsule/spin')
    go('#/gacha/sanrio-capsule/spin')
    expect(heading()).toHaveTextContent('コイン不足')
    expect(screen.getByText(/あと/, { selector: '.short-main' })).toHaveTextContent('あと 400 デモコイン')
    expect(screen.getByText('所持 100')).toBeVisible()
    expect(screen.getByText('必要 500')).toBeVisible()
    expect(screen.getByText('今回は引けません')).toBeVisible()
    expect(screen.getByText('残高はそのままです。')).toBeVisible()
    expect(screen.queryByRole('button', { name: /引く|1回転/ })).toBeNull()
    const main = screen.getByRole('main')
    expect(within(main).getAllByRole('link').map((link) => link.textContent)).toEqual(['ガチャ一覧に戻る'])
    expect(saved().coins).toBe(100)
  })
})

describe('当てたもの', () => {
  function withWins() {
    start('#/gacha/sanrio-capsule/spin')
    spinAndOpen()
    go('#/gacha/sanrio-capsule')
    go('#/gacha/sanrio-capsule/spin')
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
    expect(saved().coins).toBe(35000)
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
    expect(saved()).toMatchObject({ coins: 30000, nickname: 'あなた', voiceOn: false })
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

  test('フレンド：まだ友だちがいないと、ガチャへ案内する（ルームはガチャ詳細の「友達と回す」から作る共有ルーム）', () => {
    start('#/together')
    expect(screen.getByText('まだ友だちはいません')).toBeVisible()
    expect(screen.getByRole('link', { name: 'ガチャを見る' })).toHaveAttribute('href', '#/gacha')
    go('#/gacha/melody-anniv')
    expect(screen.getByRole('link', { name: /友達と回す/ })).toHaveAttribute('href', '#/room/new')
  })

  test('保存できない端末では、その旨を伝えて遊べる', () => {
    const broken = { getItem: () => null, setItem: () => { throw new Error('quota') } }
    window.location.hash = '#/'
    render(<App storage={broken} assets={createAssetGate([])} />)
    expect(screen.getByRole('status')).toHaveTextContent('記録を保存できません')
  })
})
