// 共有ルーム（T10・F05）の端末内デモを、決まった状態から開くための保存データ。
// アプリは模擬サーバーを localStorage（lastpiece_room_demo_v1）に、参加者 ID と入ったルームの記録を
// sessionStorage（タブごと）に置く。ここではその形のまま作る（src/realtime/mock.ts の MockRoom と同じ形）。

export const ROOM_T0 = Date.parse('2026-09-26T12:00:00Z')
export const ROOM_INVITE = 'demo-invite'
const ROOM_ID = 'demo-room'
const HOUR = 60 * 60_000

type Prize = 'plush' | 'pouch' | 'badge'
interface SeedMember { id: string; nickname: string; balance?: number; ready?: boolean; active?: boolean; seenAt?: number }
interface SeedRound { number: number; startsAt: number; results: { userId: string; nickname: string; prize: Prize }[]; guaranteed?: boolean }

export interface RoomSeedOptions {
  /** 画面を開く人（self）。 */
  self?: string
  host?: string
  members?: SeedMember[]
  /** self がこのルームに入った記録を持つ（再読み込み後の復帰として開く）。 */
  joined?: boolean
  watching?: boolean
  /** 確認済みの自分の結果（ラウンド番号）。 */
  seen?: number[]
  round?: SeedRound | null
  scheduledAt?: number | null
  pitchMode?: boolean
  lastSchedule?: { status: string; scheduledAt: string; roundNo: number | null } | null
}

export interface RoomSeed {
  demo: string
  session: Record<string, string>
  /** 端末の時刻（固定）。 */
  clock: number
  /** 端末をオフラインとして開く。 */
  offline?: boolean
}

export function roomSeed(options: RoomSeedOptions = {}, clock = ROOM_T0 + 10_000, offline = false): RoomSeed {
  const self = options.self ?? 'me'
  const host = options.host ?? 'host'
  // まだ入っていない人（joined: false）は、ルームの席を持たない
  const others = [{ id: host, nickname: 'ミオ' }, { id: 'yui', nickname: 'ゆい', ready: true }, { id: 'saki', nickname: 'さき' }]
  const members = (options.members ?? (options.joined === false ? others : [...others, { id: self, nickname: 'もも' }])).map((member) => ({ balance: 3000, ready: false, active: true, seenAt: clock - 5_000, ...member }))
  const round = options.round ? {
    number: options.round.number, request: `seed-${options.round.number}`, startsAt: options.round.startsAt,
    nextReadyAt: options.round.startsAt + 15_000, results: options.round.results, guaranteed: options.round.guaranteed ?? false,
  } : null
  const room = {
    id: ROOM_ID, invite: ROOM_INVITE, host, expiresAt: ROOM_T0 + 2 * HOUR, roundNo: round?.number ?? 0, members,
    stock: { plush: 30, pouch: 90, badge: 180 }, round, rounds: round ? [round] : [],
    scheduledAt: options.scheduledAt ?? null, pitchMode: options.pitchMode ?? false, lastSchedule: options.lastSchedule ?? null,
  }
  const session: Record<string, string> = { lastpiece_room_demo_user: self }
  if (options.joined !== false) {
    session.lastpiece_rooms_v1 = JSON.stringify({ [ROOM_INVITE]: { roomId: ROOM_ID, watching: options.watching ?? false, seen: options.seen ?? [] } })
  }
  return { demo: JSON.stringify([room]), session, clock, offline }
}

/** 公開済みの1回目（ゆいとあなた）。 */
export function revealedRound(guaranteed = false): SeedRound {
  return {
    number: 1, startsAt: ROOM_T0, guaranteed,
    results: [{ userId: 'yui', nickname: 'ゆい', prize: 'badge' }, { userId: 'me', nickname: 'もも', prize: guaranteed ? 'plush' : 'pouch' }],
  }
}

/** 満員（ホストを含め 100 人）。画面を開く人はまだ入っていない。 */
export function fullRoom(): RoomSeed {
  const members: SeedMember[] = [{ id: 'host', nickname: 'ミオ' }]
  for (let i = 1; i < 100; i += 1) members.push({ id: `m${i}`, nickname: `参加者${i}`, ready: i % 3 === 0 })
  return roomSeed({ members, joined: false })
}
