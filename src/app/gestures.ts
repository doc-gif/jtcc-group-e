/**
 * アプリのような触り心地（F16）: iOS Safari は viewport の user-scalable=no も touch-action のピンチ制限も
 * 画面全体には効かないので、独自のジェスチャーイベント（gesturestart など）の既定動作を止めてピンチで拡大させない。
 * ほかのブラウザは src/index.css の `touch-action: pan-x pan-y` で止まる。文字の拡大は OS の文字サイズに任せる。
 */
const GESTURE_EVENTS = ['gesturestart', 'gesturechange', 'gestureend'] as const

const preventDefault = (event: Event) => { event.preventDefault() }

/** 画面全体のピンチ拡大を止める。戻り値で解除できる（テスト用） */
export function installGestureGuards(target: Pick<Document, 'addEventListener' | 'removeEventListener'> = document): () => void {
  for (const type of GESTURE_EVENTS) target.addEventListener(type, preventDefault, { passive: false })
  return () => {
    for (const type of GESTURE_EVENTS) target.removeEventListener(type, preventDefault)
  }
}
