// Add every new screen and meaningful state here; also test its user journey.
// pauseTimers: 時間で切り替わる画面（街の導入）を、検査の途中で次の画面へ進めずに確認する。
export const uxScenarios: Array<{ name: string; path: string; scalableText: string; pauseTimers?: boolean }> = [
  { name: 'town-opening', path: './', scalableText: '.opening-lead', pauseTimers: true },
  { name: 'archived-town-opening', path: './versions/v0.0.0/', scalableText: '.opening-lead', pauseTimers: true },
  { name: 'town-home', path: './#/', scalableText: '.town-disclaimer' },
  { name: 'version-history', path: './versions/', scalableText: 'h1' },
  { name: 'welcome', path: './#/welcome', scalableText: '.welcome-lead' },
  { name: 'gacha-list', path: './#/gacha', scalableText: '.shop-lead' },
  { name: 'gacha-detail', path: './#/gacha/melody-anniv', scalableText: '.detail-lead' },
  { name: 'room-create-sheet', path: './#/gacha/melody-anniv/room', scalableText: '.sheet-lead' },
  { name: 'room-invite', path: './#/room/melody-anniv', scalableText: '.room-lead' },
  { name: 'spin-solo', path: './#/gacha/melody-anniv/spin', scalableText: '.spin-lead' },
  { name: 'spin-room', path: './#/room/melody-anniv/spin', scalableText: '.spin-lead' },
  { name: 'collection-empty', path: './#/collection', scalableText: '.collection-lead' },
  { name: 'together', path: './#/together', scalableText: '.together-lead' },
  { name: 'my-page', path: './#/me', scalableText: '.mypage-lead' },
  { name: 'not-found', path: './#/unknown/page', scalableText: '.notfound-lead' },
]
