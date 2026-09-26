import { HOST_KEY_PATTERN } from './hostKey'
import {
  cleanName, nameKey, RoomContractError, SHARED_CAPACITY, SHARED_NAME_MAX, SHARED_INITIAL_STOCK, SHARED_MIN_GUESTS, SHARED_ONLINE_WINDOW_MS, SHARED_OPEN_TIMEOUT_MS, SHARED_PRICE,
  SHARED_ROUND_LOCK_MS, SHARED_SCHEDULE_EXPIRY_MARGIN_MS, SHARED_SCHEDULE_MINUTES, SHARED_START_DELAY_MS, SHARED_TOP_PRIZE,
  type RoomErrorCode, type RoomTransport, type ScheduleOutcome, type SharedPrize, type Snapshot,
} from './protocol'

type MockMember = { id: string; nickname: string; balance: number; ready: boolean; active: boolean; seenAt: number; openedRound: number }
type MockResult = { userId: string; nickname: string; prize: SharedPrize }
type MockRound = { number: number; request: string; startsAt: number; revealAt: number; nextReadyAt: number; results: MockResult[]; guaranteed: boolean }
type MockRoom = {
  id: string; invite: string; host: string; hostKey: string; expiresAt: number; roundNo: number
  members: Map<string, MockMember>; stock: Record<SharedPrize, number>; round: MockRound | null; rounds: MockRound[]
  scheduledAt: number | null; pitchMode: boolean; lastSchedule: ScheduleOutcome | null
}

/** Same friendly names as lp_auto_name: "ゲスト さくら12". */
export const AUTO_NAME_WORDS = ['さくら', 'もも', 'いちご', 'りんご', 'みかん', 'ぶどう', 'ゆず', 'くるみ', 'あんず', 'すもも', 'れもん', 'めろん'] as const
/** Failed host-key checks allowed per user per minute (lp_host_key_check). */
export const HOST_KEY_ATTEMPTS_PER_MINUTE = 5

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0
const isPrize = (value: unknown): value is SharedPrize => typeof value === 'string' && Object.hasOwn(SHARED_INITIAL_STOCK, value)

function savedMember(value: unknown): MockMember | null {
  if (!isObject(value)) return null
  const { id, nickname, balance, ready, active, seenAt, openedRound } = value
  return typeof id === 'string' && typeof nickname === 'string' && isTime(balance) && typeof ready === 'boolean' && typeof active === 'boolean' && isTime(seenAt)
    // Saved before #88: nothing opened yet.
    ? { id, nickname, balance, ready, active, seenAt, openedRound: isCount(openedRound) ? openedRound : 0 } : null
}

function savedRound(value: unknown): MockRound | null {
  if (!isObject(value)) return null
  const { number, request, startsAt, revealAt, nextReadyAt, results, guaranteed } = value
  if (!isCount(number) || typeof request !== 'string' || !isTime(startsAt) || !isTime(nextReadyAt) || !Array.isArray(results)) return null
  const parsed = results.map(result => isObject(result) && typeof result.userId === 'string' && typeof result.nickname === 'string' && isPrize(result.prize)
    ? { userId: result.userId, nickname: result.nickname, prize: result.prize } : null)
  if (parsed.some(result => result === null)) return null
  // Saved before #88: all results were shown at startsAt.
  return { number, request, startsAt, revealAt: isTime(revealAt) ? revealAt : startsAt, nextReadyAt, results: parsed as MockResult[], guaranteed: guaranteed === true }
}

/** 端末内デモの保存データから部屋を1つ読む。契約の形に合わなければ null（その部屋は使わない）。 */
function savedRoom(value: unknown): MockRoom | null {
  if (!isObject(value)) return null
  const { id, invite, host, hostKey, expiresAt, roundNo, members, stock, round, rounds, scheduledAt, pitchMode, lastSchedule } = value
  if (typeof id !== 'string' || typeof invite !== 'string' || typeof host !== 'string' || !isTime(expiresAt) || !isCount(roundNo)) return null
  if (!Array.isArray(members) || !Array.isArray(rounds) || !isObject(stock)) return null
  const memberList = members.map(savedMember)
  const roundList = rounds.map(savedRound)
  if (memberList.some(member => member === null) || roundList.some(entry => entry === null)) return null
  const stockCounts = Object.keys(SHARED_INITIAL_STOCK).map(prize => stock[prize])
  if (!stockCounts.every(isCount)) return null
  const current = round === null || round === undefined ? null : savedRound(round)
  if (round !== null && round !== undefined && current === null) return null
  if (scheduledAt !== null && scheduledAt !== undefined && !isTime(scheduledAt)) return null
  let outcome: ScheduleOutcome | null = null
  if (lastSchedule !== null && lastSchedule !== undefined) {
    if (!isObject(lastSchedule) || typeof lastSchedule.status !== 'string' || typeof lastSchedule.scheduledAt !== 'string'
      || !(lastSchedule.roundNo === null || isCount(lastSchedule.roundNo))) return null
    outcome = { status: lastSchedule.status as ScheduleOutcome['status'], scheduledAt: lastSchedule.scheduledAt, roundNo: lastSchedule.roundNo as number | null }
  }
  const stockRecord = Object.fromEntries(Object.keys(SHARED_INITIAL_STOCK).map(prize => [prize, stock[prize] as number])) as Record<SharedPrize, number>
  return {
    id, invite, host, hostKey: typeof hostKey === 'string' ? hostKey : '', expiresAt, roundNo,
    members: new Map((memberList as MockMember[]).map(member => [member.id, member])),
    stock: stockRecord, round: current,
    // 最新ラウンドは rounds の最後と同じ物として扱う（結果の書き換えが両方に届くように）
    rounds: (roundList as MockRound[]).map(entry => current && entry.number === current.number ? current : entry),
    scheduledAt: isTime(scheduledAt) ? scheduledAt : null, pitchMode: pitchMode === true, lastSchedule: outcome,
  }
}

/** One-device simulation only. Each asUser() adapter obeys the same RoomTransport contract as Supabase. */
export class MockRoomServer {
  private rooms = new Map<string, MockRoom>()
  private listeners = new Map<string, Set<() => void>>()
  /** In-memory simulation only. The real database stores a salted hash, never the key. */
  private hostKeys = new Set<string>()
  private attempts = new Map<string, number[]>()
  private readonly now: () => number
  private readonly id: () => string
  private readonly random: () => number
  constructor(
    now: () => number = () => Date.now(),
    id: () => string = () => crypto.randomUUID(),
    random: () => number = () => Math.random(),
  ) { this.now = now; this.id = id; this.random = random }

  private wake(roomId: string) { this.listeners.get(roomId)?.forEach(listener => listener()) }

  /**
   * 端末内デモの保存用。部屋とホスト用キーを JSON にできる形で返す（Map・Set は配列にする）。
   * ブラウザのタブ間で同じ模擬サーバーを共有するためだけに使い、別の端末とはつながらない。
   */
  exportState(): unknown {
    return { rooms: [...this.rooms.values()].map(room => ({ ...room, members: [...room.members.values()] })), hostKeys: [...this.hostKeys] }
  }

  /** exportState の値で置き換える（部屋だけの配列も読む）。契約の形に合わない部屋は丸ごと捨てる（壊れた保存データ）。 */
  importState(data: unknown) {
    this.rooms = new Map()
    this.hostKeys = new Set()
    const saved = data && typeof data === 'object' && !Array.isArray(data) ? data as { rooms?: unknown; hostKeys?: unknown } : { rooms: data }
    if (Array.isArray(saved.hostKeys)) for (const key of saved.hostKeys) if (typeof key === 'string' && HOST_KEY_PATTERN.test(key)) this.hostKeys.add(key)
    if (!Array.isArray(saved.rooms)) return
    for (const value of saved.rooms) {
      const room = savedRoom(value)
      if (room) this.rooms.set(room.id, room)
    }
  }

  /** Registers a host key (tests and local demos). */
  addHostKey(key: string) {
    if (!HOST_KEY_PATTERN.test(key)) throw new Error('Invalid host key')
    this.hostKeys.add(key)
  }

  revokeHostKey(key: string) { this.hostKeys.delete(key) }

  /** Like lp_host_key_check: at most 5 failures per user per minute, then even the right key waits. */
  private checkHostKey(userId: string, key: string) {
    const now = this.now()
    const recent = (this.attempts.get(userId) ?? []).filter(at => at > now - 60_000)
    this.attempts.set(userId, recent)
    if (recent.length >= HOST_KEY_ATTEMPTS_PER_MINUTE) throw new RoomContractError('too-many-attempts')
    if (typeof key === 'string' && HOST_KEY_PATTERN.test(key) && this.hostKeys.has(key)) return key
    recent.push(now)
    throw new RoomContractError('host-key-invalid')
  }

  private nameTaken(room: MockRoom, name: string, self: string) {
    const key = nameKey(name)
    return [...room.members.values()].some(member => member.active && member.id !== self && nameKey(member.nickname) === key)
  }

  /** Like lp_auto_name. */
  private autoName(room: MockRoom, self: string) {
    for (let i = 0; i < 40; i++) {
      const name = `ゲスト ${AUTO_NAME_WORDS[Math.floor(this.random() * AUTO_NAME_WORDS.length)]}${1 + Math.floor(this.random() * 99)}`
      if (!this.nameTaken(room, name, self)) return name
    }
    for (let i = 100; i < 10_000; i++) {
      const name = `ゲスト ${AUTO_NAME_WORDS[i % AUTO_NAME_WORDS.length]}${i}`
      if (!this.nameTaken(room, name, self)) return name
    }
    throw new RoomContractError('room-full')
  }

  /** Like lp_name_suggestion: "もも" -> "もも2", "もも2" -> "もも3", shortened to fit 12 characters. */
  private suggestName(room: MockRoom, name: string, self: string) {
    const base = name.replace(/[0-9０-９]+$/, '').trim() || name
    for (let n = 2; n < 1000; n++) {
      const candidate = [...base].slice(0, SHARED_NAME_MAX - String(n).length).join('').trim() + n
      if (!this.nameTaken(room, candidate, self)) return candidate
    }
    return this.autoName(room, self)
  }

  /** A chosen name must be free; null keeps the user's earlier name while free, else a friendly one. */
  private pickName(room: MockRoom, chosen: string | null, self: string) {
    if (chosen !== null) {
      if (this.nameTaken(room, chosen, self)) throw new RoomContractError('name-taken', this.suggestName(room, chosen, self))
      return chosen
    }
    const previous = room.members.get(self)?.nickname
    return previous !== undefined && !this.nameTaken(room, previous, self) ? previous : this.autoName(room, self)
  }

  /** Like lp_guest_count: active seats other than the host (not online presence). */
  private guestCount(room: MockRoom) {
    return [...room.members.values()].filter(member => member.active && member.id !== room.host).length
  }

  /** All-or-nothing draw, like lp_draw: nothing changes unless every entrant gets a prize. */
  private draw(room: MockRoom, request: string) {
    const now = this.now()
    if (room.round && room.round.nextReadyAt > now) throw new RoomContractError('round-active')
    if (this.guestCount(room) < SHARED_MIN_GUESTS) throw new RoomContractError('need-more-players')
    const entrants = [...room.members.values()].filter(member => member.active && member.ready && member.seenAt > now - SHARED_ONLINE_WINDOW_MS)
    if (!entrants.length) throw new RoomContractError('nobody-ready')
    const available = Object.values(room.stock).reduce((sum, n) => sum + n, 0)
    if (available < entrants.length) throw new RoomContractError('sold-out')
    if (entrants.some(member => member.balance < SHARED_PRICE)) throw new RoomContractError('insufficient-coins')
    const stock = { ...room.stock }
    // Pitch mode reserves one real top prize for one entrant chosen uniformly, before anyone else draws.
    const lucky = room.pitchMode && stock[SHARED_TOP_PRIZE] > 0 ? entrants[Math.floor(this.random() * entrants.length)] : null
    if (lucky) stock[SHARED_TOP_PRIZE]--
    const results: MockResult[] = []
    for (const member of entrants) {
      let selected: SharedPrize | null = member === lucky ? SHARED_TOP_PRIZE : null
      if (!selected) {
        const total = Object.values(stock).reduce((sum, n) => sum + n, 0)
        let pick = Math.floor(this.random() * total)
        for (const prize of Object.keys(stock) as SharedPrize[]) {
          if (pick < stock[prize]) { selected = prize; break }
          pick -= stock[prize]
        }
        if (!selected) throw new RoomContractError('sold-out')
        stock[selected]--
      }
      results.push({ userId: member.id, nickname: member.nickname, prize: selected })
    }
    const startsAt = now + SHARED_START_DELAY_MS
    // #88: all results by startsAt + 10 s at the latest (earlier once every entrant opened), the next ready 15 s after that.
    const revealAt = startsAt + SHARED_OPEN_TIMEOUT_MS
    room.stock = stock
    room.roundNo++
    room.round = { number: room.roundNo, request, startsAt, revealAt, nextReadyAt: revealAt + SHARED_ROUND_LOCK_MS, results, guaranteed: lucky !== null }
    room.rounds.push(room.round)
    room.scheduledAt = null
    for (const member of room.members.values()) member.ready = false
    for (const member of entrants) member.balance -= SHARED_PRICE
  }

  /** Like lp_settle_open: reveal the latest round now when no active entrant is left unopened. */
  private settleOpen(room: MockRoom) {
    const round = room.round
    const now = this.now()
    if (!round || round.revealAt <= now) return
    if (round.results.some(result => { const member = room.members.get(result.userId); return member?.active && member.openedRound < round.number })) return
    round.revealAt = Math.max(now, round.startsAt)
    round.nextReadyAt = round.revealAt + SHARED_ROUND_LOCK_MS
  }

  /**
   * Like lp_fire_schedule: the first snapshot at or after scheduledAt starts the round once. With fewer than
   * SHARED_MIN_GUESTS guests the schedule waits (stays set, no lastSchedule) until a join brings the last one.
   */
  private fireSchedule(room: MockRoom) {
    const at = room.scheduledAt
    if (at === null || at > this.now()) return
    if (this.guestCount(room) < SHARED_MIN_GUESTS) return
    room.scheduledAt = null
    const request = `schedule:${at}`
    if (room.rounds.some(round => round.request === request)) return
    const scheduledAt = new Date(at).toISOString()
    try {
      this.draw(room, request)
      room.lastSchedule = { status: 'started', scheduledAt, roundNo: room.roundNo }
    } catch (caught) {
      const code: RoomErrorCode | null = caught instanceof RoomContractError ? caught.code : null
      const status = code === 'nobody-ready' || code === 'sold-out' || code === 'insufficient-coins' ? code : 'failed'
      room.lastSchedule = { status, scheduledAt, roundNo: null }
    }
    this.wake(room.id)
  }

  asUser(userId: string): RoomTransport {
    if (!userId) throw new RoomContractError('auth-required')
    const current = (roomId: string) => {
      const room = this.rooms.get(roomId)
      if (!room || room.expiresAt <= this.now() || !room.members.get(userId)?.active) throw new RoomContractError('room-unavailable')
      return room
    }
    /**
     * Like lp_fire_due: every operation runs an overdue schedule first. (SQL rolls the start back with a
     * failing call and the next snapshot runs it; the mock keeps it. Either way it starts exactly once.)
     */
    const locked = (roomId: string) => {
      const room = current(roomId)
      this.fireSchedule(room)
      return room
    }
    const hosted = (roomId: string) => {
      const room = locked(roomId)
      if (room.host !== userId) throw new RoomContractError('host-required')
      return room
    }
    const snapshot = (roomId: string): Snapshot => {
      const room = current(roomId)
      const now = this.now()
      const self = room.members.get(userId)!
      self.seenAt = now
      this.fireSchedule(room)
      const pending = room.round !== null && now < room.round.revealAt
      return {
        id: room.id, invite: room.invite, host: room.host, expiresAt: new Date(room.expiresAt).toISOString(),
        serverTime: new Date(now).toISOString(), self: userId, balance: self.balance, roundNo: room.roundNo,
        scheduledAt: room.scheduledAt === null ? null : new Date(room.scheduledAt).toISOString(),
        pitchMode: room.pitchMode, lastSchedule: room.lastSchedule && { ...room.lastSchedule },
        // Like lp_snapshot (#88): rounds revealed to all, plus a round the caller opened.
        myResults: room.rounds.filter(round => round.revealAt <= now || (round.startsAt <= now && round.number <= self.openedRound)).flatMap(round => round.results.filter(result => result.userId === userId).map(result => ({ roundNo: round.number, prize: result.prize }))),
        members: [...room.members.values()].filter(member => member.active).map(member => ({
          id: member.id, nickname: member.nickname, ready: member.ready,
          online: member.seenAt > now - SHARED_ONLINE_WINDOW_MS,
        })),
        stock: pending ? null : (Object.entries(room.stock) as [SharedPrize, number][]).map(([prize, remaining]) => ({ prize, remaining })),
        round: room.round && {
          number: room.round.number, startsAt: new Date(room.round.startsAt).toISOString(),
          revealAt: new Date(room.round.revealAt).toISOString(),
          nextReadyAt: new Date(room.round.nextReadyAt).toISOString(), guaranteed: room.round.guaranteed,
          entrants: room.round.results.map(result => result.userId),
          opened: room.round.results.filter(result => (room.members.get(result.userId)?.openedRound ?? 0) >= room.round!.number).map(result => result.userId),
          results: pending ? null : room.round.results.map(result => ({ ...result })),
        },
      }
    }
    const wake = (roomId: string) => this.wake(roomId)
    const validName = (name: string | null) => {
      if (name === null) return null
      const clean = cleanName(name)
      if (clean === null) throw new RoomContractError('invalid-name')
      return clean
    }
    const seatFree = (room: MockRoom) => [...room.members.values()].filter(member => member.active).length < SHARED_CAPACITY
    const assertIdle = (room: MockRoom) => {
      if (room.round && room.round.nextReadyAt > this.now()) throw new RoomContractError('round-active')
    }
    return {
      create: async (request, hostKey, name) => {
        if (!request) throw new RoomContractError('invalid-request')
        const chosen = validName(name)
        const existing = this.rooms.get(request)
        // Like lp_create: a retry of this user's own open room needs no second key check.
        if (existing && existing.host === userId && existing.expiresAt > this.now()) return snapshot(request)
        const key = this.checkHostKey(userId, hostKey)
        if (existing) throw new RoomContractError('room-unavailable')
        const room: MockRoom = {
          id: request, invite: this.id(), host: userId, hostKey: key, expiresAt: this.now() + 2 * 60 * 60_000,
          roundNo: 0, members: new Map(),
          stock: { ...SHARED_INITIAL_STOCK }, round: null, rounds: [], scheduledAt: null, pitchMode: false, lastSchedule: null,
        }
        room.members.set(userId, { id: userId, nickname: chosen ?? this.autoName(room, userId), balance: 3000, ready: false, active: true, seenAt: this.now(), openedRound: 0 })
        this.rooms.set(request, room)
        return snapshot(request)
      },
      resumeHost: async (hostKey, roomId) => {
        const key = this.checkHostKey(userId, hostKey)
        const now = this.now()
        const room = [...this.rooms.values()]
          .filter(candidate => candidate.hostKey === key && candidate.expiresAt > now && (roomId === null || candidate.id === roomId))
          .sort((a, b) => b.expiresAt - a.expiresAt)[0]
        if (!room) throw new RoomContractError('no-room')
        this.fireSchedule(room)
        const old = room.host
        if (old !== userId) {
          const previous = room.members.get(old)
          if (room.members.has(userId)) {
            // This device already has its own seat here: keep it and release the old host seat.
            if (previous) { previous.active = false; previous.ready = false }
          } else if (previous) {
            // Move the host's seat (name, coins, ready) and saved results to this device, keeping the order.
            room.members = new Map([...room.members].map(([id, member]) => id === old ? [userId, { ...member, id: userId }] : [id, member]))
            for (const round of room.rounds) for (const result of round.results) if (result.userId === old) result.userId = userId
          }
          room.host = userId
        }
        const mine = room.members.get(userId)
        if (!mine?.active) {
          if (!seatFree(room)) throw new RoomContractError('room-full')
          const nickname = mine && !this.nameTaken(room, mine.nickname, userId) ? mine.nickname : this.autoName(room, userId)
          if (mine) { mine.nickname = nickname; mine.active = true }
          else room.members.set(userId, { id: userId, nickname, balance: 3000, ready: false, active: true, seenAt: now, openedRound: 0 })
        }
        room.members.get(userId)!.seenAt = now
        wake(room.id)
        return snapshot(room.id)
      },
      join: async (invite, name) => {
        const chosen = validName(name)
        const room = [...this.rooms.values()].find(candidate => candidate.invite === invite && candidate.expiresAt > this.now())
        if (!room) throw new RoomContractError('room-unavailable')
        this.fireSchedule(room)
        const previous = room.members.get(userId)
        if (!previous?.active && !seatFree(room)) throw new RoomContractError('room-full')
        const nickname = this.pickName(room, chosen, userId)
        if (previous) { previous.nickname = nickname; previous.active = true; previous.seenAt = this.now() }
        else room.members.set(userId, { id: userId, nickname, balance: 3000, ready: false, active: true, seenAt: this.now(), openedRound: 0 })
        // Like lp_join (F13): the new member may be the guest a due schedule was waiting for.
        this.fireSchedule(room)
        wake(room.id)
        return snapshot(room.id)
      },
      snapshot: async roomId => snapshot(roomId),
      ready: async (roomId, ready) => {
        const room = locked(roomId)
        assertIdle(room)
        if (typeof ready !== 'boolean') throw new RoomContractError('invalid-ready')
        const member = room.members.get(userId)!
        if (ready && member.balance < SHARED_PRICE) throw new RoomContractError('insufficient-coins')
        member.ready = ready
        member.seenAt = this.now()
        wake(roomId)
        return snapshot(roomId)
      },
      start: async (roomId, request, expected) => {
        if (!request) throw new RoomContractError('invalid-request')
        if (!Number.isInteger(expected) || expected < 0) throw new RoomContractError('invalid-round')
        const room = hosted(roomId)
        if (room.rounds.some(round => round.request === request)) return snapshot(roomId)
        if (room.roundNo !== expected) throw new RoomContractError('stale-round')
        this.draw(room, request)
        // Starting now replaces any schedule.
        room.lastSchedule = null
        wake(roomId)
        return snapshot(roomId)
      },
      schedule: async (roomId, minutes) => {
        const room = hosted(roomId)
        if (minutes === null) {
          if (room.scheduledAt !== null) {
            room.lastSchedule = { status: 'cancelled', scheduledAt: new Date(room.scheduledAt).toISOString(), roundNo: null }
            room.scheduledAt = null
            wake(roomId)
          }
          return snapshot(roomId)
        }
        if (!(SHARED_SCHEDULE_MINUTES as readonly number[]).includes(minutes)) throw new RoomContractError('invalid-schedule')
        assertIdle(room)
        const at = this.now() + minutes * 60_000
        if (at > room.expiresAt - SHARED_SCHEDULE_EXPIRY_MARGIN_MS) throw new RoomContractError('invalid-schedule')
        room.scheduledAt = at
        room.lastSchedule = null
        wake(roomId)
        return snapshot(roomId)
      },
      setPitchMode: async (roomId, on) => {
        const room = hosted(roomId)
        if (typeof on !== 'boolean') throw new RoomContractError('invalid-request')
        if (room.pitchMode !== on) { room.pitchMode = on; wake(roomId) }
        return snapshot(roomId)
      },
      rename: async (roomId, name) => {
        const room = locked(roomId)
        // Like lp_rename: only in the lobby, not until the round's next ready time.
        if (room.round && room.round.nextReadyAt > this.now()) throw new RoomContractError('rename-locked')
        const nickname = validName(typeof name === 'string' ? name : '')!
        const member = room.members.get(userId)!
        if (this.pickName(room, nickname, userId) !== member.nickname) { member.nickname = nickname; wake(roomId) }
        return snapshot(roomId)
      },
      open: async (roomId, roundNo) => {
        const room = locked(roomId)
        const round = room.round
        // Like lp_open: only an entrant of the latest round, from startsAt.
        if (!round || roundNo !== round.number || this.now() < round.startsAt || !round.results.some(result => result.userId === userId)) {
          throw new RoomContractError('invalid-round')
        }
        const member = room.members.get(userId)!
        member.seenAt = this.now()
        if (member.openedRound < roundNo) {
          member.openedRound = roundNo
          this.settleOpen(room)
          wake(roomId)
        }
        return snapshot(roomId)
      },
      leave: async roomId => {
        const room = locked(roomId)
        const member = room.members.get(userId)!
        member.active = false
        member.ready = false
        // Like lp_leave (#88): an entrant who leaves without opening is not waited for.
        this.settleOpen(room)
        wake(roomId)
      },
      subscribe: (roomId, refresh, onStatus) => {
        current(roomId)
        const listeners = this.listeners.get(roomId) ?? new Set<() => void>()
        listeners.add(refresh)
        this.listeners.set(roomId, listeners)
        // Like a private channel that joined: every later change calls refresh synchronously.
        onStatus?.('live')
        return () => { listeners.delete(refresh); if (!listeners.size) this.listeners.delete(roomId) }
      },
    }
  }
}
