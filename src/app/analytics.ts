import { onBeforeNavigate, parseHash, paths, type Route } from './router'

/**
 * アクセス解析（GA4）。LP（doc-gif/lastpiece-lp）と同じプロパティ・測定 ID で、本番の公開 URL だけで送る。
 * Microsoft Clarity（LP と同じプロジェクト）も同じ条件で読み込む。
 * ローカル・CI（自動操作）・Vitest（jsdom）・確認用プレビュー・?internal=1 の端末では gtag.js も Clarity も読み込まず、何も送らない。
 * 計測が失敗してもアプリの動作に影響させないよう、ここの例外はすべて握りつぶす。
 * イベントのパラメータにニックネーム・自由入力・招待コード・ホストキーを入れない（ページの場所からも取り除く）。
 */
export const MEASUREMENT_ID = 'G-3DDS1NJZXS'
/** Microsoft Clarity（画面操作の録画・ヒートマップ）。LP と同じプロジェクト。 */
export const CLARITY_PROJECT_ID = 'yo6yjo7ath'
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

/**
 * page_location（固定版のパスや UTM などの検索部分は残す）と page_path（`/jtcc-group-e/#/gacha/...` の形）。
 * 固定版 `/jtcc-group-e/versions/vX.Y.Z/` の page_path も公開ルートにそろえ、同じ画面を 1 つのパスで集計する。
 */
export function pageFields(location: Pick<Location, 'origin' | 'pathname' | 'search' | 'hash'>) {
  const hash = analyticsHash(location.hash)
  const root = location.pathname.startsWith(PRODUCTION_PATH) ? PRODUCTION_PATH : location.pathname
  return { page_location: location.origin + location.pathname + location.search + hash, page_path: root + hash }
}

/**
 * Clarity を動かさない画面。Clarity は開始時の URL をハッシュ込みでそのまま記録し、伏せる設定がない（clarity-js の drop はクエリだけ）。
 * 招待コード・ホストキーを URL に含み得る画面と、解釈できないハッシュ（打ち間違えた招待など）では記録を止める。
 */
export function clarityBlocked(hash: string): boolean {
  const { name } = parseHash(hash)
  return name === 'room' || name === 'host' || name === 'notfound'
}

type Gtag = (...args: unknown[]) => void
type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] }
/** initAnalytics が読む window の一部（テストでは本番の URL を持つ偽物を渡す）。 */
export type AnalyticsWindow = Pick<Window, 'location' | 'navigator' | 'document' | 'localStorage' | 'sessionStorage' | 'addEventListener'> & { dataLayer?: unknown[]; gtag?: Gtag; clarity?: ClarityFn }

let active: { gtag: Gtag; win: AnalyticsWindow } | null = null
const sentOnce = new Set<string>()

function addScript(win: AnalyticsWindow, src: string) {
  const script = win.document.createElement('script')
  script.async = true
  script.src = src
  win.document.head.appendChild(script)
}

/**
 * Clarity を読み込み、秘密を含み得る画面（clarityBlocked）の URL を記録させない。
 * Clarity は開始時の URL と、送信のたびに「その時点の location.href」を記録する。止めたときの最後の送信も同じなので、
 * URL が招待・ホストの画面に変わってから止めたのでは遅い。そこで次のようにする。
 * - その画面で開いたときは、読み込み用タグの start を預かって本体に渡さない（タグは start を待ち行列の先頭に入れるので、
 *   後から stop を積む方法では開始を防げない）。
 * - その画面へ移る前に止める: リンクを押したとき（window の捕捉段階で Clarity より先）、アプリの navigate()、
 *   対応ブラウザでは Navigation API の navigate（戻る・進む・アドレス欄を含み、URL が変わる前に届く）。
 * - いったん止めたら、このページを開いている間は再開しない（古いブラウザで「戻る」から招待の画面に入っても記録しないため）。
 * 戻り値は、ハッシュが変わったときに呼ぶ関数（上の方法をすり抜けたときの最後の止め）。
 */
function setupClarity(win: AnalyticsWindow): () => void {
  let sealed = clarityBlocked(win.location.hash)
  let started = false
  const queue: unknown[][] = []
  const deferred: ClarityFn = function (...args: unknown[]) {
    if (args[0] === 'start') {
      if (sealed) return
      started = true
    }
    queue.push(args)
  }
  deferred.q = queue
  win.clarity = deferred
  const seal = () => {
    if (sealed) return
    sealed = true
    if (win.clarity === deferred) {
      // 本体の読み込み前: 積んである start を取り除けば記録は始まらない
      for (let index = queue.length - 1; index >= 0; index -= 1) if (queue[index][0] === 'start') queue.splice(index, 1)
    } else if (started) {
      win.clarity?.('stop')
    }
  }
  const sealIfBlocked = (hash: string) => {
    try {
      if (clarityBlocked(hash)) seal()
    } catch {
      // 計測の失敗は画面に影響させない
    }
  }
  win.addEventListener('click', (event) => {
    const target = event.target as Element | null
    const link = target?.closest?.('a[href]') as HTMLAnchorElement | null | undefined
    if (link?.hash) sealIfBlocked(link.hash)
  }, true)
  onBeforeNavigate((to) => sealIfBlocked(to))
  const navigation = (win as unknown as { navigation?: EventTarget }).navigation
  navigation?.addEventListener?.('navigate', (event) => {
    const destination = (event as Event & { destination?: { url?: string } }).destination?.url
    if (destination) sealIfBlocked(new URL(destination).hash)
  })
  addScript(win, `https://www.clarity.ms/tag/${encodeURIComponent(CLARITY_PROJECT_ID)}`)
  return () => sealIfBlocked(win.location.hash)
}

function safeStorage(read: () => Storage): Storage | null {
  try {
    return read()
  } catch {
    return null
  }
}

/**
 * 本番の公開 URL でだけ gtag.js と Clarity を読み込む。GA4 には初回と画面（ハッシュ）が変わるたびに page_view を送る。
 * Clarity は招待・ホストの画面へ移る前に止め、その URL を記録させない（setupClarity）。
 */
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
    addScript(win, `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`)
    gtag('js', new Date())
    // 自動の page_view と以後のイベントが、招待コード・キーを伏せた場所を使うよう config より前に set する
    gtag('set', pageFields(win.location))
    gtag('config', MEASUREMENT_ID, { send_page_view: true, allow_google_signals: false, allow_ad_personalization_signals: false })
    // 画面の React より先に登録されるので、招待・ホストの画面を描く前に Clarity を止められる
    const syncClarity = setupClarity(win)
    win.addEventListener('hashchange', () => {
      try {
        syncClarity()
      } catch {
        // 計測の失敗は画面に影響させない
      }
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
