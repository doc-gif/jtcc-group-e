import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { STORAGE_KEY } from '../domain/storage'

/**
 * 「ホーム画面に追加」の案内（#57、マスター 448:14192・448:14267）。
 * ブラウザのタブで開いたときだけ出し、閉じたら（または追加が済んだら）その端末では二度と出さない。
 * ホーム画面から開いたとき（display-mode: standalone、iOS は navigator.standalone）は出さない。
 * ブラウザが追加の画面を出せるとき（Android の Chrome などの beforeinstallprompt）は、ボタンでその画面を出す。
 */

/** 閉じたことを覚えるキー。確認用プレビューは版ごとに分かれる（STORAGE_KEY と同じ分け方）。 */
export const INSTALL_GUIDE_KEY = `${STORAGE_KEY}_install_guide_closed`

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>
type DisplayWindow = { matchMedia?: Window['matchMedia']; navigator: Navigator & { standalone?: boolean } }

/** ホーム画面から開いている（リンクバーのない全画面）なら true。 */
export function isStandalone(win: DisplayWindow = window): boolean {
  if (win.navigator.standalone === true) return true
  if (typeof win.matchMedia !== 'function') return false
  return ['standalone', 'fullscreen', 'minimal-ui'].some((mode) => win.matchMedia!(`(display-mode: ${mode})`).matches)
}

function defaultStore(): KeyValueStore | undefined {
  try { return window.localStorage } catch { return undefined }
}

export function isGuideClosed(store: KeyValueStore | undefined = defaultStore()): boolean {
  try { return store?.getItem(INSTALL_GUIDE_KEY) === '1' } catch { return false }
}

export function closeGuide(store: KeyValueStore | undefined = defaultStore()): void {
  try { store?.setItem(INSTALL_GUIDE_KEY, '1') } catch { /* 保存できなくても、この画面では閉じる */ }
}

/** Chrome などの beforeinstallprompt。標準の型にないので必要な分だけ書く。 */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// beforeinstallprompt はアプリの描画より先に来ることがあるので、起動時から受け取っておく
let deferred: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => { for (const listener of listeners) listener() }

/** 追加の画面を出せる合図（beforeinstallprompt）と、追加が済んだ合図（appinstalled）を受け取る。戻り値で解除できる（テスト用）。 */
export function captureInstallPrompt(target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const onPrompt = (event: Event) => {
    // ブラウザが自分で出す案内の代わりに、この案内のボタンから出す
    event.preventDefault()
    deferred = event as InstallPromptEvent
    notify()
  }
  const onInstalled = () => { deferred = null; installed = true; notify() }
  target.addEventListener('beforeinstallprompt', onPrompt)
  target.addEventListener('appinstalled', onInstalled)
  return () => {
    target.removeEventListener('beforeinstallprompt', onPrompt)
    target.removeEventListener('appinstalled', onInstalled)
  }
}

/** テスト用: 受け取った合図を消す。 */
export function resetInstallPrompt(): void { deferred = null; installed = false; notify() }

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => (installed ? 'installed' : deferred ? 'prompt' : 'none')

export interface InstallGuideState {
  /** 案内を出すか */
  show: boolean
  /** ボタンで追加の画面を出せるか */
  canPrompt: boolean
  close: () => void
  install: () => Promise<void>
}

export function useInstallGuide(store?: KeyValueStore): InstallGuideState {
  const prompt = useSyncExternalStore(subscribe, snapshot, () => 'none')
  const [hidden, setHidden] = useState(() => isStandalone() || isGuideClosed(store))
  const close = useCallback(() => { closeGuide(store); setHidden(true) }, [store])
  // 追加が済んだら、次からも出さない
  useEffect(() => { if (prompt === 'installed') closeGuide(store) }, [prompt, store])
  const install = useCallback(async () => {
    const event = deferred
    if (!event) return
    deferred = null
    try {
      await event.prompt()
      const choice = await event.userChoice
      if (choice.outcome === 'accepted') close()
    } catch { /* 出せなかったら手順の案内に戻る */ }
    notify()
  }, [close])
  return { show: !hidden && prompt !== 'installed', canPrompt: prompt === 'prompt', close, install }
}
