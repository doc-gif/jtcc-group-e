// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { AnalyticsWindow, TrackEnv } from './analytics'
import { analyticsHash, CLARITY_PROJECT_ID, clarityBlocked, INTERNAL_KEY, MEASUREMENT_ID, pageFields, shouldTrack } from './analytics'
import { paths } from './router'

const PRODUCTION = 'https://doc-gif.github.io/jtcc-group-e/'
const CHROME_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
    values,
  }
}

function env(url: string, overrides: Partial<TrackEnv> = {}): TrackEnv {
  const { hostname, pathname, search } = new URL(url)
  return { hostname, pathname, search, webdriver: false, userAgent: CHROME_UA, storage: memoryStorage(), ...overrides }
}

describe('shouldTrack', () => {
  test('本番の公開 URL（固定版・UTM 付きを含む）だけで送る', () => {
    expect(shouldTrack(env(PRODUCTION))).toBe(true)
    expect(shouldTrack(env(`${PRODUCTION}?utm_source=lp&utm_medium=cta#/gacha`))).toBe(true)
    expect(shouldTrack(env(`${PRODUCTION}versions/v0.2.0/`))).toBe(true)
    expect(shouldTrack(env(PRODUCTION, { storage: null }))).toBe(true)
  })

  test('除外: localhost・127.0.0.1・自動操作・jsdom・確認用プレビュー・internal=1', () => {
    expect(shouldTrack(env('http://localhost:5173/jtcc-group-e/'))).toBe(false)
    expect(shouldTrack(env('http://127.0.0.1:4173/jtcc-group-e/'))).toBe(false)
    expect(shouldTrack(env('http://[::1]:4173/jtcc-group-e/'))).toBe(false)
    expect(shouldTrack(env(PRODUCTION, { webdriver: true }))).toBe(false)
    expect(shouldTrack(env(PRODUCTION, { userAgent: navigator.userAgent }))).toBe(false)
    expect(navigator.userAgent).toMatch(/jsdom/)
    expect(shouldTrack(env('https://doc-gif.github.io/jtcc-group-e-preview/pr-42/runs/1/app/'))).toBe(false)
    expect(shouldTrack(env(`${PRODUCTION}?internal=1`))).toBe(false)
  })

  test('本番以外のホスト・パス（LP や別サイト）では送らない', () => {
    expect(shouldTrack(env('https://doc-gif.github.io/lastpiece-lp/'))).toBe(false)
    expect(shouldTrack(env('https://example.com/jtcc-group-e/'))).toBe(false)
    expect(shouldTrack(env('file:///C:/jtcc-group-e/index.html'))).toBe(false)
  })

  test('?internal=1 で storage にフラグが書かれ以後も除外、?internal=0 で消えて送る', () => {
    const storage = memoryStorage()
    expect(shouldTrack(env(`${PRODUCTION}?internal=1`, { storage }))).toBe(false)
    expect(storage.values.get(INTERNAL_KEY)).toBe('1')
    expect(shouldTrack(env(PRODUCTION, { storage }))).toBe(false)
    expect(shouldTrack(env(`${PRODUCTION}?internal=0`, { storage }))).toBe(true)
    expect(storage.values.has(INTERNAL_KEY)).toBe(false)
    expect(shouldTrack(env(PRODUCTION, { storage }))).toBe(true)
  })

  test('LP で保存した内部フラグ（同じオリジン）も除外する', () => {
    expect(shouldTrack(env(PRODUCTION, { storage: memoryStorage({ [INTERNAL_KEY]: '1' }) }))).toBe(false)
  })

  test('storage が例外を投げても止まらず、URL の internal=1 だけで除外する', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
    expect(shouldTrack(env(`${PRODUCTION}?internal=1`, { storage: broken }))).toBe(false)
    expect(shouldTrack(env(PRODUCTION, { storage: broken }))).toBe(true)
  })
})

describe('送る画面の場所', () => {
  test('招待コードとホストキーを伏せ、ほかの画面はそのまま', () => {
    expect(analyticsHash(paths.room('0f8e-a1b2'))).toBe('#/room/:invite')
    expect(analyticsHash(paths.host('Secret_Key-1'))).toBe('#/host/:key')
    expect(analyticsHash('#/host/A B')).toBe('#/host/:key')
    expect(analyticsHash(paths.host())).toBe('#/host')
    expect(analyticsHash('#/room/Secret/extra')).toBe('#/notfound')
    expect(analyticsHash('')).toBe('#/')
    expect(analyticsHash('#/gacha/a-1/room')).toBe('#/room/new')
    for (const path of [paths.town, paths.gachaList, paths.welcome, paths.gacha('a-1'), paths.odds('a-1'), paths.soloSpin('a-1'), paths.createRoom,
      paths.collection, paths.shelf, paths.shelfShare, paths.shelfItem('p-1'), paths.friend('yui'), paths.friendItem('yui', 'p-1'), paths.together, paths.me]) {
      expect(analyticsHash(path)).toBe(path)
    }
  })

  test('page_path は /jtcc-group-e/#/... の形、page_location は UTM を残す', () => {
    const url = new URL(`${PRODUCTION}?utm_source=lp#/host/Secret_Key-1`)
    expect(pageFields(url)).toEqual({
      page_location: 'https://doc-gif.github.io/jtcc-group-e/?utm_source=lp#/host/:key',
      page_path: '/jtcc-group-e/#/host/:key',
    })
  })

  test('固定版の page_path は公開ルートにそろえ、page_location には版のパスを残す', () => {
    expect(pageFields(new URL(`${PRODUCTION}versions/v0.2.0/#/gacha/a-1`))).toEqual({
      page_location: 'https://doc-gif.github.io/jtcc-group-e/versions/v0.2.0/#/gacha/a-1',
      page_path: '/jtcc-group-e/#/gacha/a-1',
    })
    expect(pageFields(new URL('http://127.0.0.1:4173/other/#/me')).page_path).toBe('/other/#/me')
  })
})

type Loaded = typeof import('./analytics')

function fakeWindow(url: string, overrides: { webdriver?: boolean; sessionStorage?: () => Storage } = {}) {
  const location = new URL(url)
  const listeners: Record<string, ((event?: unknown) => void)[]> = {}
  const local = memoryStorage()
  const session = memoryStorage()
  const win = {
    location,
    navigator: { webdriver: overrides.webdriver ?? false, userAgent: CHROME_UA },
    document,
    get localStorage() { return local as unknown as Storage },
    get sessionStorage() { return overrides.sessionStorage ? overrides.sessionStorage() : session as unknown as Storage },
    addEventListener: (type: string, listener: (event?: unknown) => void) => { (listeners[type] ??= []).push(listener) },
  }
  const goTo = (hash: string) => { location.hash = hash; for (const listener of listeners.hashchange ?? []) listener() }
  const click = (target: Element) => { for (const listener of listeners.click ?? []) listener({ target }) }
  return { win: win as unknown as AnalyticsWindow & { dataLayer?: IArguments[] }, goTo, click, session }
}

const calls = (win: { dataLayer?: IArguments[] }) => (win.dataLayer ?? []).map((args) => [...args])
const gtagScripts = () => document.head.querySelectorAll('script[src^="https://www.googletagmanager.com/gtag/js"]')
const clarityScripts = () => document.head.querySelectorAll('script[src^="https://www.clarity.ms/tag/"]')

describe('initAnalytics・track・trackOnce', () => {
  let analytics: Loaded
  beforeEach(async () => {
    vi.resetModules()
    analytics = await import('./analytics')
  })
  afterEach(() => { for (const script of [...gtagScripts(), ...clarityScripts()]) script.remove() })

  test('未初期化・送らない環境では例外を投げず、何も読み込まない', () => {
    expect(() => analytics.track('demo_start', { source: 'test' })).not.toThrow()
    expect(() => analytics.trackOnce('spin_first', 'spin_first')).not.toThrow()
    // この Vitest（jsdom・localhost）の window そのもの
    analytics.initAnalytics()
    const { win } = fakeWindow('https://doc-gif.github.io/jtcc-group-e-preview/pr-1/')
    analytics.initAnalytics(win)
    const automated = fakeWindow(PRODUCTION, { webdriver: true })
    analytics.initAnalytics(automated.win)
    analytics.track('demo_start')
    expect(gtagScripts()).toHaveLength(0)
    expect(win.dataLayer).toBeUndefined()
    expect(automated.win.dataLayer).toBeUndefined()
    expect('gtag' in window).toBe(false)
    expect(clarityScripts()).toHaveLength(0)
    expect(win.clarity).toBeUndefined()
    expect(automated.win.clarity).toBeUndefined()
  })

  test('本番では gtag.js を 1 回だけ挿入し、キーを伏せた場所で config と page_view を送る', () => {
    const { win, goTo } = fakeWindow(`${PRODUCTION}?utm_source=lp#/host/Secret_Key-1`)
    analytics.initAnalytics(win)
    analytics.initAnalytics(win)
    expect(gtagScripts()).toHaveLength(1)
    expect((gtagScripts()[0] as HTMLScriptElement).async).toBe(true)
    expect(gtagScripts()[0].getAttribute('src')).toBe(`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`)
    const [js, set, config] = calls(win)
    expect(js[0]).toBe('js')
    expect(set).toEqual(['set', { page_location: 'https://doc-gif.github.io/jtcc-group-e/?utm_source=lp#/host/:key', page_path: '/jtcc-group-e/#/host/:key' }])
    expect(config).toEqual(['config', MEASUREMENT_ID, { send_page_view: true, allow_google_signals: false, allow_ad_personalization_signals: false }])

    goTo(paths.room('0f8e-a1b2'))
    const fields = { page_location: 'https://doc-gif.github.io/jtcc-group-e/?utm_source=lp#/room/:invite', page_path: '/jtcc-group-e/#/room/:invite' }
    expect(calls(win).slice(3)).toEqual([['set', fields], ['event', 'page_view', fields]])
    expect(JSON.stringify(calls(win))).not.toMatch(/Secret_Key|0f8e/)

    analytics.track('demo_start', { entry: 'welcome', first: true, count: 1 })
    analytics.track('room_create')
    expect(calls(win).slice(5)).toEqual([['event', 'demo_start', { entry: 'welcome', first: true, count: 1 }], ['event', 'room_create', {}]])
  })

  test('trackOnce は 1 セッションに 1 回だけ送る', () => {
    const { win, session } = fakeWindow(PRODUCTION)
    analytics.initAnalytics(win)
    const before = calls(win).length
    analytics.trackOnce('spin_first', 'spin_first', { gacha: 'a-1' })
    analytics.trackOnce('spin_first', 'spin_first', { gacha: 'a-1' })
    analytics.trackOnce('room_first', 'room_first')
    expect(calls(win).slice(before)).toEqual([['event', 'spin_first', { gacha: 'a-1' }], ['event', 'room_first', {}]])
    expect(session.values.get('lastpiece_analytics_once:spin_first')).toBe('1')
  })

  test('sessionStorage が使えなくても、開いている間は 1 回だけ送る', () => {
    const { win } = fakeWindow(PRODUCTION, { sessionStorage: () => { throw new Error('denied') } })
    analytics.initAnalytics(win)
    const before = calls(win).length
    analytics.trackOnce('spin_first', 'spin_first')
    analytics.trackOnce('spin_first', 'spin_first')
    expect(calls(win).slice(before)).toEqual([['event', 'spin_first', {}]])
  })

  test('gtag が壊れていても画面の処理に例外を返さない', () => {
    const { win, goTo } = fakeWindow(PRODUCTION)
    analytics.initAnalytics(win)
    win.dataLayer!.push = () => { throw new Error('broken') }
    expect(() => analytics.track('spin')).not.toThrow()
    expect(() => analytics.trackOnce('spin_first', 'spin_first')).not.toThrow()
    expect(() => goTo(paths.gachaList)).not.toThrow()
    const broken = { ...fakeWindow(PRODUCTION).win, document: undefined } as unknown as AnalyticsWindow
    vi.resetModules()
    return import('./analytics').then((fresh) => expect(() => fresh.initAnalytics(broken)).not.toThrow())
  })
})

describe('Clarity', () => {
  let analytics: Loaded
  const config = { projectId: CLARITY_PROJECT_ID, upload: 'https://g.clarity.ms/collect' }
  beforeEach(async () => {
    vi.resetModules()
    analytics = await import('./analytics')
  })
  afterEach(() => { for (const script of [...gtagScripts(), ...clarityScripts()]) script.remove(); document.body.replaceChildren() })

  /** clarity.ms/tag/<id> の読み込み用タグと同じ呼び方（start を待ち行列の先頭へ移す）。 */
  function runLoaderTag(win: AnalyticsWindow) {
    const clarity = win.clarity!
    clarity('metadata', () => {}, false, true)
    clarity('start', config)
    clarity.q!.unshift(clarity.q!.pop()!)
    clarity('set', 'C_IS', '0')
  }
  const startsIn = (win: AnalyticsWindow) => (win.clarity!.q ?? []).filter((args) => args[0] === 'start')

  test('招待・ホスト・解釈できないハッシュでは記録しない', () => {
    expect(clarityBlocked(paths.room('0f8e-a1b2'))).toBe(true)
    expect(clarityBlocked(paths.host('Secret_Key-1'))).toBe(true)
    expect(clarityBlocked(paths.host())).toBe(true)
    expect(clarityBlocked('#/room/Secret/extra')).toBe(true)
    for (const hash of ['', paths.town, paths.gachaList, paths.createRoom, paths.me, paths.welcome, paths.soloSpin('a-1'), paths.collection]) expect(clarityBlocked(hash)).toBe(false)
  })

  test('本番では LP と同じプロジェクトのタグを 1 回だけ読み込み、記録してよい画面ならそのまま開始する', () => {
    const { win } = fakeWindow(`${PRODUCTION}#/gacha`)
    analytics.initAnalytics(win)
    analytics.initAnalytics(win)
    expect(clarityScripts()).toHaveLength(1)
    expect(clarityScripts()[0].getAttribute('src')).toBe('https://www.clarity.ms/tag/yo6yjo7ath')
    runLoaderTag(win)
    expect(win.clarity!.q![0]).toEqual(['start', config])
  })

  test('招待・ホスト用リンクで開いたら、本体に start を渡さず、このページでは記録しない', () => {
    const { win, goTo } = fakeWindow(`${PRODUCTION}#/host/Secret_Key-1`)
    analytics.initAnalytics(win)
    runLoaderTag(win)
    expect(startsIn(win)).toEqual([])
    goTo(paths.town)
    goTo(paths.gachaList)
    expect(startsIn(win)).toEqual([])
  })

  test('本体の読み込み前に招待の画面へ移るときは、積んである start を取り除く（stop は積まない）', async () => {
    const router = await import('./router')
    const { win } = fakeWindow(`${PRODUCTION}#/room/new`)
    analytics.initAnalytics(win)
    runLoaderTag(win)
    expect(startsIn(win)).toHaveLength(1)
    router.navigate(paths.room('0f8e-a1b2'))
    expect(startsIn(win)).toEqual([])
    expect((win.clarity!.q ?? []).some((args) => args[0] === 'stop')).toBe(false)
  })

  test('本体の読み込み後は、URL が変わる前（アプリの navigate）に stop し、戻っても再開しない', async () => {
    const router = await import('./router')
    const { win, goTo } = fakeWindow(`${PRODUCTION}#/room/new`)
    analytics.initAnalytics(win)
    runLoaderTag(win)
    const real = vi.fn()
    win.clarity = real
    goTo(paths.gachaList)
    router.navigate(paths.createRoom)
    expect(real).not.toHaveBeenCalled()
    router.navigate(paths.room('0f8e-a1b2'))
    expect(real.mock.calls).toEqual([['stop']])
    // 止めた時点で URL はまだ招待の画面になっていない（止めたときの送信に招待コードが入らない）
    expect(win.location.hash).toBe('#/gacha')
    goTo(paths.room('0f8e-a1b2'))
    goTo(paths.town)
    router.navigate(paths.host('Secret_Key-1'))
    expect(real.mock.calls).toEqual([['stop']])
  })

  test('招待・ホストの画面へのリンクを押したら、Clarity がリンク先を記録する前に止める', () => {
    const { win, click } = fakeWindow(`${PRODUCTION}#/room/new`)
    analytics.initAnalytics(win)
    runLoaderTag(win)
    const real = vi.fn()
    win.clarity = real
    document.body.innerHTML = '<a id="safe" href="#/gacha"><span>ガチャ</span></a><a id="room" href="#/room/0f8e-a1b2"><b>いまのルームに戻る</b></a><a id="out" href="https://github.com/doc-gif">外部</a>'
    click(document.querySelector('#safe span')!)
    click(document.querySelector('#out')!)
    click(document.body)
    expect(real).not.toHaveBeenCalled()
    click(document.querySelector('#room b')!)
    expect(real.mock.calls).toEqual([['stop']])
  })

  test('Navigation API があれば、戻る・進む・アドレス欄でも URL が変わる前に止める', () => {
    const { win } = fakeWindow(`${PRODUCTION}#/gacha`)
    const navigation = new EventTarget()
    Object.assign(win, { navigation })
    analytics.initAnalytics(win)
    runLoaderTag(win)
    const real = vi.fn()
    win.clarity = real
    const go = (url: string) => navigation.dispatchEvent(Object.assign(new Event('navigate'), { destination: { url } }))
    go(`${PRODUCTION}#/me`)
    go(`${PRODUCTION}`)
    expect(real).not.toHaveBeenCalled()
    go(`${PRODUCTION}#/room/0f8e-a1b2`)
    expect(real.mock.calls).toEqual([['stop']])
  })

  test('onBeforeNavigate は URL が変わる前に呼ばれ、解除できる', async () => {
    const router = await import('./router')
    const before = window.location.hash
    const seen: string[] = []
    const off = router.onBeforeNavigate((to) => seen.push(`${to} from ${window.location.hash}`))
    router.navigate(paths.me)
    off()
    router.navigate(paths.town)
    expect(seen).toEqual([`#/me from ${before}`])
    expect(window.location.hash).toBe('#/')
  })

  test('ほかの方法をすり抜けて招待の画面になったら、ハッシュの変化で止める', () => {
    const { win, goTo } = fakeWindow(`${PRODUCTION}#/`)
    analytics.initAnalytics(win)
    runLoaderTag(win)
    const real = vi.fn()
    win.clarity = real
    goTo(paths.room('0f8e-a1b2'))
    expect(real.mock.calls).toEqual([['stop']])
  })
})
