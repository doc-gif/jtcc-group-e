/** 街の導入の切り替え時間（デザインマスター 267:8224 → 267:8234 → 267:8203 の遷移）。 */
export const OPENING_TIMING = { second: 1200, end: 3000 }

/** アプリを開いた直後（URL にハッシュがない）だけ導入を出す。タブ・戻る・リンクで街に来たときは出さない。 */
export function shouldShowOpening(hash: string) {
  return hash === '' || hash === '#'
}
