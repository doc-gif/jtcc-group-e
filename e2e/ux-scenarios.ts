// Add every new screen and meaningful state here; also test its user journey.
// pauseTimers: 時間で切り替わる画面（街の導入）を、検査の途中で次の画面へ進めずに確認する。
// saved: 開く前にこの端末の保存データ（lastpiece_app_v1）へ入れる状態。売り切れ・コイン不足などを再現する。
const demoState = { version: 1, coins: 3000, nickname: 'あなた', stock: {}, wins: [], forceFeaturedNext: false, nextWinSeq: 1 }
const soldOutStock = { 'sanrio-capsule': Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`sanrio-capsule-${i + 1}`, 0])) }

export const uxScenarios: Array<{ name: string; path: string; scalableText: string; pauseTimers?: boolean; saved?: Record<string, unknown> }> = [
  { name: 'town-opening', path: './', scalableText: '.opening-lead', pauseTimers: true },
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
  { name: 'spin-sold-out', path: './#/gacha/sanrio-capsule/spin', scalableText: '.problem-lead', saved: { ...demoState, stock: soldOutStock } },
  { name: 'spin-insufficient-coins', path: './#/gacha/sanrio-capsule/spin', scalableText: '.problem-lead', saved: { ...demoState, coins: 100 } },
  { name: 'gacha-detail-insufficient-coins', path: './#/gacha/sanrio-capsule', scalableText: '.detail-lead', saved: { ...demoState, coins: 100 } },
  { name: 'collection-empty', path: './#/collection', scalableText: '.collection-lead' },
  { name: 'together', path: './#/together', scalableText: '.together-lead' },
  { name: 'my-page', path: './#/me', scalableText: '.mypage-lead' },
  { name: 'not-found', path: './#/unknown/page', scalableText: '.notfound-lead' },
]
