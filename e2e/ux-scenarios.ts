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

// room: 共有ルーム（T10）の端末内デモの保存データと端末の時刻（e2e/room-seeds.ts）。steps: 開いたあとの操作。heading: 確かめる見出し。
import type { Page } from '@playwright/test'
import { fullRoom, revealedRound, ROOM_INVITE, ROOM_T0, roomSeed, type RoomSeed } from './room-seeds.ts'

const roomPath = `./#/room/${ROOM_INVITE}`
const hostSeed = (extra: Parameters<typeof roomSeed>[0] = {}, clock?: number) => roomSeed({
  self: 'host', host: 'host',
  members: [{ id: 'host', nickname: 'ミオ' }, { id: 'yui', nickname: 'ゆい', ready: true }, { id: 'saki', nickname: 'さき' }],
  ...extra,
}, clock)
export type RoomStep = { click: string | RegExp } | { fill: [string, string] }

// goods: 商品の絵（assets/goods）の読み込みを止める（hold）か失敗させる（fail）。街の読み込み中（T07 Loading）の確認に使う。

export const uxScenarios: Array<{
  name: string; path: string; scalableText: string; pauseTimers?: boolean; seed?: string; goods?: 'hold' | 'fail'
  room?: RoomSeed; steps?: RoomStep[]; heading?: string | RegExp
}> = [
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
  // 共有ルーム（T10 の24画面、マスター node は docs/ADOPTED_DESIGN.md）
  { name: 'room-create', path: './#/room/new', scalableText: '.room-create-lead', heading: 'ルームを作る' },
  { name: 'room-invite', path: roomPath, scalableText: '.room-card-title', room: roomSeed({ joined: false }), heading: 'ルームへの招待' },
  { name: 'room-name-choose', path: roomPath, scalableText: '.room-hint', room: roomSeed({ joined: false }), steps: [{ click: 'ルームに入る' }], heading: 'ルームへの招待' },
  { name: 'room-name-taken', path: roomPath, scalableText: '.room-hint', room: roomSeed({ joined: false }), steps: [{ click: 'ルームに入る' }, { fill: ['表示する名前', 'ゆい'] }, { click: 'この名前で入る' }], heading: 'ルームへの招待' },
  { name: 'room-name-auto', path: roomPath, scalableText: '.room-body', room: roomSeed({ joined: false }), steps: [{ click: 'ルームに入る' }, { click: '名前を決めずに入る' }], heading: 'ルームへの招待' },
  { name: 'room-lobby', path: roomPath, scalableText: '.room-body', room: roomSeed(), heading: 'みんなの開封ルーム' },
  { name: 'room-rename', path: roomPath, scalableText: '.room-hint', room: roomSeed(), steps: [{ click: '名前を変える' }], heading: '名前を変える' },
  { name: 'room-ready', path: roomPath, scalableText: '.room-body', room: roomSeed({ members: [{ id: 'host', nickname: 'ミオ' }, { id: 'me', nickname: 'もも', ready: true }] }), heading: '準備できたよ' },
  { name: 'room-watching', path: roomPath, scalableText: '.room-body', room: roomSeed({ watching: true }), heading: '見守り中です' },
  { name: 'room-full', path: roomPath, scalableText: '.room-body', room: fullRoom(), steps: [{ click: 'ルームに入る' }, { fill: ['表示する名前', 'もも'] }, { click: 'この名前で入る' }], heading: 'ただいま満員です' },
  { name: 'room-countdown', path: roomPath, scalableText: '.room-body', room: roomSeed({ round: { ...revealedRound(true), startsAt: ROOM_T0 + 18_000 }, pitchMode: true }), heading: 'もうすぐ開封！' },
  { name: 'room-opening', path: roomPath, scalableText: '.room-body', room: roomSeed({ round: revealedRound(), seen: [1] }), heading: 'せーので、ひらこう！' },
  { name: 'room-my-result', path: roomPath, scalableText: '.room-body', room: roomSeed({ round: revealedRound(), seen: [1] }), steps: [{ click: '結果を見る' }], heading: 'みんなの結果' },
  { name: 'room-my-result-pitch', path: roomPath, scalableText: '.room-body', room: roomSeed({ round: revealedRound(true), seen: [1], pitchMode: true }), steps: [{ click: '結果を見る' }], heading: 'みんなの結果' },
  { name: 'room-all-results', path: roomPath, scalableText: '.room-card-title', room: roomSeed({ round: revealedRound(), seen: [1] }), steps: [{ click: 'みんなの反応を見る' }], heading: 'みんなのピース' },
  { name: 'room-history', path: roomPath, scalableText: '.room-card-title', room: roomSeed({ round: revealedRound(), seen: [1] }), steps: [{ click: '結果を見る' }, { click: '自分の履歴を見る' }], heading: '自分の履歴' },
  { name: 'room-reconnecting', path: roomPath, scalableText: '.room-body', room: roomSeed({}, undefined, true), heading: '接続を確認しています' },
  { name: 'room-recover', path: roomPath, scalableText: '.room-body', room: roomSeed({ round: revealedRound() }, ROOM_T0 + 60_000), heading: 'おかえりなさい' },
  { name: 'room-host-away', path: roomPath, scalableText: '.room-body', room: roomSeed({ members: [{ id: 'host', nickname: 'ミオ', seenAt: ROOM_T0 - 60_000 }, { id: 'me', nickname: 'もも' }] }), heading: 'ホストが離れています' },
  { name: 'room-host-resume', path: roomPath, scalableText: '.room-body', room: hostSeed(), heading: 'ホストとして戻りました' },
  { name: 'room-expired', path: roomPath, scalableText: '.room-body', room: roomSeed({}, ROOM_T0 + 2 * 60 * 60_000 + 1_000), heading: 'ルームは終了しました' },
  { name: 'room-host-start', path: roomPath, scalableText: '.room-body', room: hostSeed(), steps: [{ click: '参加者を確認する' }], heading: '開封の準備ができたよ' },
  { name: 'room-host-schedule', path: roomPath, scalableText: '.room-card-title', room: hostSeed(), steps: [{ click: '参加者を確認する' }, { click: /開始の時間を予約する/ }], heading: '開始を予約しよう' },
  { name: 'room-host-scheduled', path: roomPath, scalableText: '.room-body', room: hostSeed({ scheduledAt: ROOM_T0 + 175_000, pitchMode: true }), heading: /に開始$/ },
  { name: 'room-guest-scheduled', path: roomPath, scalableText: '.room-body', room: roomSeed({ scheduledAt: ROOM_T0 + 175_000, pitchMode: true }), heading: /に開始$/ },
  { name: 'room-schedule-failed', path: roomPath, scalableText: '.room-body', room: hostSeed({ lastSchedule: { status: 'nobody-ready', scheduledAt: new Date(ROOM_T0).toISOString(), roundNo: null } }), heading: '開始できませんでした' },
  // 開始の人数（F13：ホストのほかに2人以上）
  { name: 'room-host-waiting-players', path: roomPath, scalableText: '.room-body', room: hostSeed({ members: [{ id: 'host', nickname: 'ミオ' }, { id: 'yui', nickname: 'ゆい', ready: true }] }), steps: [{ click: '参加者を確認する' }], heading: 'あと1人で始められます' },
  { name: 'room-guest-waiting-players', path: roomPath, scalableText: '.room-body', room: roomSeed({ members: [{ id: 'host', nickname: 'ミオ' }, { id: 'me', nickname: 'もも' }] }), heading: 'みんなの開封ルーム' },
  { name: 'room-host-schedule-waiting', path: roomPath, scalableText: '.room-body', room: hostSeed({ members: [{ id: 'host', nickname: 'ミオ' }, { id: 'yui', nickname: 'ゆい', ready: true }], scheduledAt: ROOM_T0, pitchMode: true }), heading: /になりました$/ },
  { name: 'room-guest-schedule-waiting', path: roomPath, scalableText: '.room-body', room: roomSeed({ members: [{ id: 'host', nickname: 'ミオ' }, { id: 'me', nickname: 'もも', ready: true }], scheduledAt: ROOM_T0, pitchMode: true }), heading: /になりました$/ },
  { name: 'room-host-link-invalid', path: './#/host/old-key', scalableText: '.room-body', heading: 'ホスト用リンクが無効です' },
  { name: 'spin-solo-confirm', path: './#/gacha/melody-anniv/spin', scalableText: '.confirm-lead' },
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

/** 場面を開く。共有ルームでは時刻を固定して端末内デモの保存データを入れ、決めた操作のあと見出しを確かめる。 */
export async function openScenario(page: Page, scenario: typeof uxScenarios[number], expectHeading: (heading: string | RegExp) => Promise<void>) {
  if (scenario.room) {
    await page.clock.setFixedTime(scenario.room.clock)
    await page.addInitScript(({ demo, session, offline }) => {
      localStorage.setItem('lastpiece_room_demo_v1', demo)
      for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, value)
      if (offline) Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false })
    }, scenario.room)
  }
  await page.goto(scenario.path)
  await page.getByRole('heading', { level: 1 }).waitFor()
  for (const step of scenario.steps ?? []) {
    if ('click' in step) await page.getByRole('button', { name: step.click, exact: typeof step.click === 'string' }).click()
    else await page.getByLabel(step.fill[0]).fill(step.fill[1])
  }
  if (scenario.heading) await expectHeading(scenario.heading)
}
