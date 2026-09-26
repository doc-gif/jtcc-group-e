import { useEffect, useState, useSyncExternalStore } from 'react'

/**
 * 画面を出す前に本当に待つもの（絵・文字）の準備状況。
 * 待つものがなければ最初から ready。時間を足して待たせることはしない。
 */
export type AssetStatus = 'loading' | 'ready' | 'error'

export interface AssetGate {
  getStatus(): AssetStatus
  subscribe(listener: () => void): () => void
  /** まだなら読み込みを始める。失敗のあとに呼ぶと、もう一度読み込む。読み込み中・準備済みなら何もしない。 */
  load(): void
}

/** 読み込み中の画面を出すまでの待ち時間。これより早く準備できたら、読み込み中の画面は出さない（ちらつき防止）。 */
export const LOADING_DELAY = 300

export function createAssetGate(tasks: ReadonlyArray<() => Promise<unknown>>): AssetGate {
  let status: AssetStatus = tasks.length === 0 ? 'ready' : 'loading'
  let running = false
  const listeners = new Set<() => void>()
  const set = (next: AssetStatus) => {
    status = next
    for (const listener of listeners) listener()
  }
  return {
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    load() {
      if (status === 'ready' || running) return
      running = true
      if (status === 'error') set('loading')
      Promise.all(tasks.map((task) => task())).then(
        () => { running = false; set('ready') },
        () => { running = false; set('error') },
      )
    },
  }
}

/** 画像を読み込み、表示できる状態（デコード済み）になるまで待つ。読み込めなければ失敗にする。 */
export function loadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      // デコードに失敗しても、読み込めた絵は表示できるので準備済みとする
      if (typeof image.decode === 'function') image.decode().then(() => resolve(), () => resolve())
      else resolve()
    }
    image.onerror = () => reject(new Error(`画像を読み込めませんでした: ${url}`))
    image.src = url
  })
}

/** 使っている文字（フォント）の読み込みが終わるまで待つ。対応していないブラウザでは待たない。 */
export function fontsReady(): Promise<unknown> {
  return typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve()
}

export function useAssetStatus(gate: AssetGate): AssetStatus {
  return useSyncExternalStore(gate.subscribe, gate.getStatus, gate.getStatus)
}

/** active が delay ミリ秒続いたら true。途中で false に戻ったら数え直す。 */
export function useDelayed(active: boolean, delay: number): boolean {
  const [passed, setPassed] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => setPassed(true), delay)
    return () => { window.clearTimeout(timer); setPassed(false) }
  }, [active, delay])
  return active && passed
}
