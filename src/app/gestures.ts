/**
 * アプリのような触り心地（F16）: iOS Safari は viewport の user-scalable=no も touch-action のピンチ制限も
 * 画面全体には効かないので、独自のジェスチャーイベント（gesturestart など）の既定動作を止めてピンチで拡大させない。
 * ほかのブラウザは src/index.css の `touch-action: pan-x pan-y` で止まる。文字の拡大は OS の文字サイズに任せる。
 * Android は -webkit-touch-callout が効かないので、ボタンと絵の長押しメニュー（contextmenu）もここで止める。
 * リンク・入力欄・本文はメニューを出せるまま（新しいタブで開く・コピー・貼り付けのため）。
 */
const GESTURE_EVENTS = ['gesturestart', 'gesturechange', 'gestureend'] as const
const NO_MENU = 'button, [role="button"], img, svg'
const KEEP_MENU = 'a, input, textarea, select, [contenteditable]'

const preventDefault = (event: Event) => { event.preventDefault() }

const preventPressMenu = (event: Event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest(KEEP_MENU) || !target.closest(NO_MENU)) return
  event.preventDefault()
}

/** 画面全体のピンチ拡大と、ボタン・絵の長押しメニューを止める。戻り値で解除できる（テスト用） */
export function installGestureGuards(target: Pick<Document, 'addEventListener' | 'removeEventListener'> = document): () => void {
  for (const type of GESTURE_EVENTS) target.addEventListener(type, preventDefault, { passive: false })
  target.addEventListener('contextmenu', preventPressMenu)
  return () => {
    for (const type of GESTURE_EVENTS) target.removeEventListener(type, preventDefault)
    target.removeEventListener('contextmenu', preventPressMenu)
  }
}
