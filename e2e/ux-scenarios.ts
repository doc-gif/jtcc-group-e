// Add every new screen and meaningful state here; also test its user journey.
// pauseTimers: 時間で切り替わる画面（街の導入）を、検査の途中で次の画面へ進めずに確認する。
// seed: 開く前にこの端末の保存データ（localStorage）へ入れる状態。棚・フレンドの「持っている」状態や、ガチャの売り切れ・コイン不足の確認に使う。

/** 2点を当て、1回はゆい・さき（デモ）といっしょに回した状態 */
function demoState(extra: Record<string, unknown> = {}): string {
  const win = (id: string, prizeId: string, companions: string[]) => ({ id, gachaId: 'sanrio-capsule', prizeId, spent: 500, wonAt: '2026-09-20T00:00:00.000Z', companions, status: 'kept' })
  return JSON.stringify({
    version: 1, coins: 2000, nickname: 'あなた', stock: {}, forceFeaturedNext: false, nextWinSeq: 3, welcomed: true, voiceOn: false, soundOn: false,
    wins: [win('w2', 'sanrio-capsule-2', ['ゆい', 'さき']), win('w1', 'sanrio-capsule-1', [])], favorites: [], reactions: [], ...extra,
  })
}
export const SEED_STORAGE_KEY = 'lastpiece_app_v1'

/** ガチャの流れ（F03）用：売り切れ・コイン不足を再現する状態 */
const gachaState = (extra: Record<string, unknown> = {}) => JSON.stringify({ version: 1, coins: 3000, nickname: 'あなた', stock: {}, wins: [], forceFeaturedNext: false, nextWinSeq: 1, ...extra })
const soldOutStock = { 'sanrio-capsule': Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`sanrio-capsule-${i + 1}`, 0])) }

// goods: 商品の絵（assets/goods）の読み込みを止める（hold）か失敗させる（fail）。街の読み込み中（T07 Loading）の確認に使う。

export const uxScenarios: Array<{ name: string; path: string; scalableText: string; pauseTimers?: boolean; seed?: string; goods?: 'hold' | 'fail' }> = [
  { name: 'town-opening', path: './', scalableText: '.opening-lead', pauseTimers: true },
  { name: 'town-loading', path: './#/', scalableText: '.loading-lead', goods: 'hold' },
  { name: 'town-loading-error', path: './#/', scalableText: '.loading-lead', goods: 'fail' },
  { name: 'archived-town-opening', path: './versions/v0.0.0/', scalableText: '.opening-lead', pauseTimers: true },
  { name: 'town-home', path: './#/', scalableText: '.town-disclaimer' },
  { name: 'version-history', path: './versions/', scalableText: 'h1' },
  { name: 'welcome', path: './#/welcome', scalableText: '.welcome-lead' },
  { name: 'gacha-list', path: './#/gacha', scalableText: '.shop-lead' },
  { name: 'gacha-detail', path: './#/gacha/melody-anniv', scalableText: '.detail-lead' },
  { name: 'gacha-odds', path: './#/gacha/sanrio-capsule/odds', scalableText: '.odds-lead' },
  { name: 'room-create-sheet', path: './#/gacha/melody-anniv/room', scalableText: '.sheet-lead' },
  { name: 'room-invite', path: './#/room/melody-anniv', scalableText: '.room-lead' },
  { name: 'spin-solo-confirm', path: './#/gacha/melody-anniv/spin', scalableText: '.confirm-lead' },
  { name: 'spin-room-confirm', path: './#/room/melody-anniv/spin', scalableText: '.confirm-lead' },
  { name: 'spin-sold-out', path: './#/gacha/sanrio-capsule/spin', scalableText: '.problem-lead', seed: gachaState({ stock: soldOutStock }) },
  { name: 'spin-insufficient-coins', path: './#/gacha/sanrio-capsule/spin', scalableText: '.problem-lead', seed: gachaState({ coins: 100 }) },
  { name: 'gacha-detail-insufficient-coins', path: './#/gacha/sanrio-capsule', scalableText: '.detail-lead', seed: gachaState({ coins: 100 }) },
  { name: 'collection-empty', path: './#/collection', scalableText: '.collection-lead' },
  { name: 'collection-list', path: './#/collection', scalableText: '.collection-lead', seed: demoState() },
  { name: 'shelf-empty', path: './#/shelf', scalableText: '.shelf-lead' },
  { name: 'shelf-owned', path: './#/shelf', scalableText: '.shelf-lead', seed: demoState() },
  { name: 'shelf-other-set', path: './#/shelf', scalableText: '.shelf-lead', seed: demoState({ wins: [{ id: 'w3', gachaId: 'melody-anniv', prizeId: 'melody-anniv-12', spent: 1500, wonAt: '2026-09-21T00:00:00.000Z', companions: [], status: 'kept' }] }) },
  { name: 'shelf-item', path: './#/shelf/sanrio-capsule-1', scalableText: '.item-lead', seed: demoState() },
  { name: 'shelf-item-favorite', path: './#/shelf/sanrio-capsule-1', scalableText: '.item-lead', seed: demoState({ favorites: ['sanrio-capsule-1'] }) },
  { name: 'shelf-share-preview', path: './#/shelf/share', scalableText: '.share-lead', seed: demoState() },
  { name: 'friends-none', path: './#/together', scalableText: '.together-lead' },
  { name: 'friends-hub', path: './#/together', scalableText: '.together-lead', seed: demoState() },
  { name: 'friend-shelf', path: './#/friend/yui', scalableText: '.friend-lead', seed: demoState() },
  { name: 'friend-item', path: './#/friend/yui/sanrio-capsule-2', scalableText: '.item-lead', seed: demoState() },
  { name: 'friend-item-reacted', path: './#/friend/yui/sanrio-capsule-2', scalableText: '.item-eyebrow', seed: demoState({ reactions: ['yui:sanrio-capsule-2'] }) },
  { name: 'friend-shelf-unavailable', path: './#/friend/saki', scalableText: '.unavailable-lead', seed: demoState() },
  { name: 'my-page', path: './#/me', scalableText: '.mypage-lead' },
  { name: 'not-found', path: './#/unknown/page', scalableText: '.notfound-lead' },
]
