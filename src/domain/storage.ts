import { catalog, findPrize } from './catalog'
import { createInitialState, initialStock } from './game'
import { cleanFavorites, cleanReactions } from './shelf'
import type { AppState, WinRecord } from './types'

/** Preview runs must not read or overwrite production/browser demo progress. */
export function storageKeyForPath(pathname: string): string {
  const preview = /^\/jtcc-group-e-preview\/pr-(\d+)\/runs\/(\d+)\/app(?:\/|$)/.exec(pathname)
  return preview ? `lastpiece_preview_pr_${preview[1]}_run_${preview[2]}_v1` : 'lastpiece_app_v1'
}

export const STORAGE_KEY = storageKeyForPath(typeof window === 'undefined' ? '' : window.location.pathname)

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

function isWin(value: unknown): value is WinRecord {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' && typeof value.gachaId === 'string' && typeof value.prizeId === 'string' && isCount(value.spent)
    && typeof value.wonAt === 'string' && Array.isArray(value.companions) && value.companions.every((name) => typeof name === 'string')
    && (value.status === 'kept' || value.status === 'delivery' || value.status === 'exchanged')
}

/** 保存データが壊れていても、アプリは最初の状態で動く。 */
export function parseState(raw: string | null): AppState {
  if (!raw) return createInitialState()
  try {
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data) || data.version !== 1 || !isCount(data.coins) || typeof data.nickname !== 'string' || !isRecord(data.stock)
      || !Array.isArray(data.wins) || !data.wins.every(isWin) || typeof data.forceFeaturedNext !== 'boolean' || !isCount(data.nextWinSeq)) return createInitialState()
    const flag = (value: unknown) => value === true
    const stock = initialStock()
    for (const gacha of catalog) {
      const saved = data.stock[gacha.id]
      if (!isRecord(saved)) continue
      for (const prize of gacha.prizes) {
        const count = saved[prize.id]
        if (isCount(count)) stock[gacha.id][prize.id] = Math.min(count, prize.total)
      }
    }
    const known = data.wins.filter((win) => findPrize(win.gachaId, win.prizeId) !== undefined)
    return { version: 1, coins: data.coins, nickname: data.nickname || 'あなた', stock, wins: known, forceFeaturedNext: data.forceFeaturedNext, nextWinSeq: data.nextWinSeq, welcomed: flag(data.welcomed), voiceOn: flag(data.voiceOn), soundOn: flag(data.soundOn),
      // F04 で追加。前の版の保存データにはないので、なければ空にする（同じ version 1 のまま読める）
      favorites: cleanFavorites(data.favorites), reactions: cleanReactions(data.reactions) }
  } catch {
    return createInitialState()
  }
}

export function loadState(store: KeyValueStore | undefined): AppState {
  try {
    return parseState(store?.getItem(STORAGE_KEY) ?? null)
  } catch {
    return createInitialState()
  }
}

export function saveState(store: KeyValueStore | undefined, state: AppState): boolean {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(state))
    return store !== undefined
  } catch {
    return false
  }
}
