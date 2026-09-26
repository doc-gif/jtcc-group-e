import { catalog, findGacha, findPrize } from './catalog'
import { exchangeCoins, pickPrize, remainingOf } from './odds'
import type { AppState, Gacha, Prize, Stock, WinRecord } from './types'

/** はじめての人に入れておく体験用コイン（デモ。決済はしない）。 */
export const STARTER_COINS = 3000
export const COIN_PACKS = [1000, 5000, 10000] as const
export const NICKNAME_MAX = 12
/** ルームの友達（デモ）。実在の利用者ではない。ルームは自分を含めて最大4人。 */
export const DEMO_FRIENDS = ['ゆい', 'さき']
export const ROOM_CAPACITY = 4

export function initialStock(): Stock {
  return Object.fromEntries(catalog.map((gacha) => [gacha.id, Object.fromEntries(gacha.prizes.map((prize) => [prize.id, prize.startRemaining]))]))
}

export function createInitialState(): AppState {
  return { version: 1, coins: STARTER_COINS, nickname: 'あなた', stock: initialStock(), wins: [], forceFeaturedNext: false, nextWinSeq: 1, welcomed: false, voiceOn: false, soundOn: false }
}

export type SpinError = 'not-found' | 'sold-out' | 'insufficient-coins'

export interface FriendResult { name: string; prize: Prize | null }

export type SpinOutcome =
  | { ok: true; state: AppState; win: WinRecord; prize: Prize; friends: FriendResult[] }
  | { ok: false; error: SpinError }

function takeOne(stock: Stock, gachaId: string, prizeId: string): Stock {
  return { ...stock, [gachaId]: { ...stock[gachaId], [prizeId]: remainingOf(stock, gachaId, prizeId) - 1 } }
}

export function spinCheck(state: AppState, gachaId: string): SpinError | null {
  const gacha = findGacha(gachaId)
  if (!gacha) return 'not-found'
  if (gacha.prizes.every((prize) => remainingOf(state.stock, gacha.id, prize.id) === 0)) return 'sold-out'
  if (state.coins < gacha.price) return 'insufficient-coins'
  return null
}

export interface SpinQuote { price: number; balance: number; after: number; shortBy: number }

/** 支払う前に見せる金額。1回のコイン・いまの残高・引いた後の残高・足りない分。 */
export function spinQuote(state: AppState, gacha: Pick<Gacha, 'price'>): SpinQuote {
  const shortBy = Math.max(0, gacha.price - state.coins)
  return { price: gacha.price, balance: state.coins, after: Math.max(0, state.coins - gacha.price), shortBy }
}

/** 目玉の候補。残っている目玉のうち参考価格がいちばん高いもの（なければ目玉の先頭）。 */
export function featuredCandidate(gacha: Gacha, stock: Stock): Prize | null {
  const featured = [...gacha.prizes].filter((prize) => prize.glow === 'featured').sort((a, b) => b.refPrice - a.refPrice)
  return featured.find((prize) => remainingOf(stock, gacha.id, prize.id) > 0) ?? featured[0] ?? null
}

/**
 * 1 回まわす。自分の結果を先に決め、同じルームの友達（デモ）の結果も同じ在庫から引く。
 * `random` は 0 以上 1 未満を返す関数（テストでは固定値を渡す）。
 */
export function spin(state: AppState, gachaId: string, random: () => number, companions: string[], now: Date): SpinOutcome {
  const error = spinCheck(state, gachaId)
  if (error) return { ok: false, error }
  const gacha = findGacha(gachaId)!
  const prize = pickPrize(gacha, state.stock, random(), state.forceFeaturedNext)!
  let stock = takeOne(state.stock, gacha.id, prize.id)
  const friends = companions.map((name) => {
    const friendPrize = pickPrize(gacha, stock, random())
    if (friendPrize) stock = takeOne(stock, gacha.id, friendPrize.id)
    return { name, prize: friendPrize }
  })
  const win: WinRecord = { id: `w${state.nextWinSeq}`, gachaId: gacha.id, prizeId: prize.id, spent: gacha.price, wonAt: now.toISOString(), companions, status: 'kept' }
  return {
    ok: true,
    prize,
    friends,
    win,
    state: { ...state, coins: state.coins - gacha.price, stock, wins: [win, ...state.wins], forceFeaturedNext: false, nextWinSeq: state.nextWinSeq + 1 },
  }
}

export function refPriceOf(win: WinRecord): number {
  return findPrize(win.gachaId, win.prizeId)?.prize.refPrice ?? 0
}

/** 手元にある物だけが対象。交換額は参考価格の一律 20%。取り消しはできない。 */
export function exchangeQuote(state: AppState, winIds: string[]): Array<{ win: WinRecord; coins: number }> {
  const ids = new Set(winIds)
  return state.wins.filter((win) => ids.has(win.id) && win.status === 'kept').map((win) => ({ win, coins: exchangeCoins(refPriceOf(win)) }))
}

export function exchange(state: AppState, winIds: string[]): AppState {
  const quote = exchangeQuote(state, winIds)
  if (quote.length === 0) return state
  const coinsById = new Map(quote.map(({ win, coins }) => [win.id, coins]))
  return {
    ...state,
    coins: state.coins + quote.reduce((sum, row) => sum + row.coins, 0),
    wins: state.wins.map((win) => coinsById.has(win.id) ? { ...win, status: 'exchanged', exchangedCoins: coinsById.get(win.id) } : win),
  }
}

export function requestDelivery(state: AppState, winIds: string[]): AppState {
  const ids = new Set(winIds)
  if (!state.wins.some((win) => ids.has(win.id) && win.status === 'kept')) return state
  return { ...state, wins: state.wins.map((win) => ids.has(win.id) && win.status === 'kept' ? { ...win, status: 'delivery' } : win) }
}

/** デモ：決済をせずにコインを増やす。決められたパック以外は受け付けない。 */
export function addDemoCoins(state: AppState, amount: number): AppState {
  if (!(COIN_PACKS as readonly number[]).includes(amount)) return state
  return { ...state, coins: state.coins + amount }
}

export type NicknameResult = { ok: true; state: AppState } | { ok: false; message: string }

export function setNickname(state: AppState, input: string): NicknameResult {
  const name = input.trim()
  if (name.length === 0) return { ok: false, message: 'ニックネームを入れてください' }
  if ([...name].length > NICKNAME_MAX) return { ok: false, message: `ニックネームは${NICKNAME_MAX}文字までです` }
  return { ok: true, state: { ...state, nickname: name } }
}

export function setForceFeatured(state: AppState, on: boolean): AppState {
  return { ...state, forceFeaturedNext: on }
}

export interface CollectionSummary { spent: number; refTotal: number; count: number }

export function summarize(wins: WinRecord[]): CollectionSummary {
  return wins.reduce((acc, win) => ({ spent: acc.spent + win.spent, refTotal: acc.refTotal + refPriceOf(win), count: acc.count + 1 }), { spent: 0, refTotal: 0, count: 0 })
}

/** 確定演出を出してよいか。本当に目玉が出るときだけ（ガセ演出はしない）。 */
export function shouldShowKakutei(prize: Prize): boolean {
  return prize.glow === 'featured'
}

export function completeWelcome(state: AppState, nickname: string): NicknameResult {
  const result = setNickname(state, nickname)
  return result.ok ? { ok: true, state: { ...result.state, welcomed: true } } : result
}

export function toggleSetting(state: AppState, key: 'voiceOn' | 'soundOn'): AppState {
  return { ...state, [key]: !state[key] }
}
