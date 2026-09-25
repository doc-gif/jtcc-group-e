// Add every new screen and meaningful state here; also test its user journey.
export const uxScenarios = [
  { name: 'home', path: './', scalableText: '.home-lead' },
  { name: 'archived-home', path: './versions/v0.0.0/', scalableText: '.home-lead' },
  { name: 'version-history', path: './versions/', scalableText: 'h1' },
  { name: 'welcome', path: './#/welcome', scalableText: '.welcome-lead' },
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
