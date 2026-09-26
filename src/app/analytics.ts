import { parseHash, paths, type Route } from './router'

/**
 * アクセス解析（GA4）。LP（doc-gif/lastpiece-lp）と同じプロパティ・測定 ID で、本番の公開 URL だけで送る。
 * ローカル・CI（自動操作）・Vitest（jsdom）・確認用プレビュー・?internal=1 の端末では gtag.js を読み込まず、何も送らない。
 * 計測が失敗してもアプリの動作に影響させないよう、ここの例外はすべて握りつぶす。
 * イベントのパラメータにニックネーム・自由入力・招待コード・ホストキーを入れない（ページの場所からも取り除く）。
 */
export const MEASUREMENT_ID = 'G-3DDS1NJZXS'
/** LP と共通の「内部の端末」フラグ（同じオリジン doc-gif.github.io の localStorage）。 */
export const INTERNAL_KEY = 'lp_internal'
const PRODUCTION_HOST = 'doc-gif.github.io'
const PRODUCTION_PATH = '/jtcc-group-e/'
const PREVIEW_PATH = '/jtcc-group-e-preview/'
const ONCE_PREFIX = 'lastpiece_analytics_once:'

type Params = Record<string, string | number | boolean>

export type TrackEnv = {
  hostname: string
  pathname: string
  search: string
  webdriver: boolean
  userAgent: string
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
}

/**
 * 送ってよい環境かを決める。`?internal=1` は storage にフラグを保存し（以後ずっと除外）、`?internal=0` で消す。
 * storage が使えなくても、その URL に `?internal=1` があれば除外する。
 */
export function shouldTrack(env: TrackEnv): boolean {
  const internalParam = new URLSearchParams(env.search).get('internal')
  let internal = internalParam === '1'
  try {
    if (internalParam === '1') env.storage?.setItem(INTERNAL_KEY, '1')
    else if (internalParam === '0') env.storage?.removeItem(INTERNAL_KEY)
    internal ||= env.storage?.getItem(INTERNAL_KEY) === '1'
  } catch {
    // storage が使えない（プライベートモードなど）。URL の指定だけで判断する。
  }
  if (internal || env.webdriver || /jsdom/i.test(env.userAgent)) return false
  if (env.hostname === 'localhost' || env.hostname === '127.0.0.1' || env.hostname === '[::1]') return false
  if (env.pathname.startsWith(PREVIEW_PATH)) return false
  return env.hostname === PRODUCTION_HOST && env.pathname.startsWith(PRODUCTION_PATH)
}

/** GA4 に送る画面のハッシュ。招待コードとホストキーは伏せ、解釈できないハッシュは中身を送らない。 */
export function analyticsHash(hash: string): string {
  const route: Route = parseHash(hash)
  switch (route.name) {
    case 'room': return '#/room/:invite'
    case 'host': return route.key === null ? paths.host() : '#/host/:key'
    case 'notfound': return '#/notfound'
    case 'town': return paths.town
    case 'gachaList': return paths.gachaList
    case 'welcome': return paths.welcome
    case 'gacha': return paths.gacha(route.id)
    case 'odds': return paths.odds(route.id)
    case 'spin': return paths.soloSpin(route.id)
    case 'roomNew': return paths.createRoom
    case 'collection': return paths.collection
    case 'shelf': return paths.shelf
    case 'shelfShare': return paths.shelfShare
    case 'shelfItem': return paths.shelfItem(route.id)
    case 'friend': return paths.friend(route.id)
    case 'friendItem': return paths.friendItem(route.id, route.item)
    case 'together': return paths.together
    case 'me': return paths.me
  }
}

/** page_location（UTM などの検索部分は残す）と page_path（`/jtcc-group-e/#/gacha/...` の形）。 */
export function pageFields(location: Pick<Location, 'origin' | 'pathname' | 'search' | 'hash'>) {
  const hash = analyticsHash(location.hash)
  return { page_location: location.origin + location.pathname + location.search + hash, page_path: location.pathname + hash }
}

type Gtag = (...args: unknown[]) => void
/** initAnalytics が読む window の一部（テストでは本番の URL を持つ偽物を渡す）。 */
export type AnalyticsWindow = Pick<Window, 'location' | 'navigator' | 'document' | 'localStorage' | 'sessionStorage' | 'addEventListener'> & { dataLayer?: unknown[]; gtag?: Gtag }

let active: { gtag: Gtag; win: AnalyticsWindow } | null = null
const sentOnce = new Set<string>()

function safeStorage(read: () => Storage): Storage | null {
  try {
    return read()
  } catch {
    return null
  }
}

/** 本番の公開 URL でだけ gtag.js を読み込み、初回と画面（ハッシュ）が変わるたびに page_view を送る。 */
export function initAnalytics(win: AnalyticsWindow | undefined = typeof window === 'undefined' ? undefined : window): void {
  try {
    if (active || !win) return
    const env: TrackEnv = {
      hostname: win.location.hostname,
      pathname: win.location.pathname,
      search: win.location.search,
      webdriver: win.navigator.webdriver === true,
      userAgent: win.navigator.userAgent,
      storage: safeStorage(() => win.localStorage),
    }
    if (!shouldTrack(env)) return
    const dataLayer = (win.dataLayer ??= [])
    // gtag.js は arguments オブジェクトを受け取る決まり
    const gtag: Gtag = win.gtag = function () {
      dataLayer.push(arguments)
    }
    active = { gtag, win }
    const script = win.document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`
    win.document.head.appendChild(script)
    gtag('js', new Date())
    // 自動の page_view と以後のイベントが、招待コード・キーを伏せた場所を使うよう config より前に set する
    gtag('set', pageFields(win.location))
    gtag('config', MEASUREMENT_ID, { send_page_view: true, allow_google_signals: false, allow_ad_personalization_signals: false })
    win.addEventListener('hashchange', () => {
      try {
        const fields = pageFields(win.location)
        gtag('set', fields)
        gtag('event', 'page_view', fields)
      } catch {
        // 計測の失敗は画面に影響させない
      }
    })
  } catch {
    // 計測の失敗は画面に影響させない
  }
}

/** イベントを送る。initAnalytics が送らない環境と判断した（または未初期化の）ときは何もしない。 */
export function track(event: string, params?: Params): void {
  try {
    active?.gtag('event', event, params ?? {})
  } catch {
    // 計測の失敗は画面に影響させない
  }
}

/** 1 セッション（sessionStorage）で 1 回だけ送る。spin_first など。送らない環境では記録もしない。 */
export function trackOnce(key: string, event: string, params?: Params): void {
  try {
    if (!active) return
    const storageKey = ONCE_PREFIX + key
    const { win } = active
    const storage = safeStorage(() => win.sessionStorage)
    try {
      if (storage?.getItem(storageKey) === '1') return
      storage?.setItem(storageKey, '1')
    } catch {
      // sessionStorage が使えなければ、このページを開いている間だけ 1 回にする
    }
    if (sentOnce.has(storageKey)) return
    sentOnce.add(storageKey)
    track(event, params)
  } catch {
    // 計測の失敗は画面に影響させない
  }
}
