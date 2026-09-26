import { HOST_KEY_PATTERN } from './hostKey'
import {
  cleanName, nameKey, RoomContractError, SHARED_CAPACITY, SHARED_NAME_MAX, SHARED_INITIAL_STOCK, SHARED_ONLINE_WINDOW_MS, SHARED_PRICE,
  SHARED_ROUND_LOCK_MS, SHARED_SCHEDULE_EXPIRY_MARGIN_MS, SHARED_SCHEDULE_MINUTES, SHARED_START_DELAY_MS, SHARED_TOP_PRIZE,
  type RoomErrorCode, type RoomTransport, type ScheduleOutcome, type SharedPrize, type Snapshot,
} from './protocol'

type MockMember = { id: string; nickname: string; balance: number; ready: boolean; active: boolean; seenAt: number }
type MockResult = { userId: string; nickname: string; prize: SharedPrize }
type MockRound = { number: number; request: string; startsAt: number; nextReadyAt: number; results: MockResult[]; guaranteed: boolean }
type MockRoom = {
  id: string; invite: string; host: string; hostKey: string; expiresAt: number; roundNo: number
  members: Map<string, MockMember>; stock: Record<SharedPrize, number>; round: MockRound | null; rounds: MockRound[]
  scheduledAt: number | null; pitchMode: boolean; lastSchedule: ScheduleOutcome | null
}

/** Same friendly names as lp_auto_name: "ゲスト さくら12". */
export const AUTO_NAME_WORDS = ['さくら', 'もも', 'いちご', 'りんご', 'みかん', 'ぶどう', 'ゆず', 'くるみ', 'あんず', 'すもも', 'れもん', 'めろん'] as const
/** Failed host-key checks allowed per user per minute (lp_host_key_check). */
export const HOST_KEY_ATTEMPTS_PER_MINUTE = 5

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

  /** All-or-nothing draw, like lp_draw: nothing changes unless every entrant gets a prize. */
  private draw(room: MockRoom, request: string) {
    const now = this.now()
    if (room.round && room.round.nextReadyAt > now) throw new RoomContractError('round-active')
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
    room.stock = stock
    room.roundNo++
    room.round = { number: room.roundNo, request, startsAt, nextReadyAt: startsAt + SHARED_ROUND_LOCK_MS, results, guaranteed: lucky !== null }
    room.rounds.push(room.round)
    room.scheduledAt = null
    for (const member of room.members.values()) member.ready = false
    for (const member of entrants) member.balance -= SHARED_PRICE
  }

  /** Like lp_fire_schedule: the first snapshot at or after scheduledAt starts the round once. */
  private fireSchedule(room: MockRoom) {
    const at = room.scheduledAt
    if (at === null || at > this.now()) return
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
      const pending = room.round !== null && now < room.round.startsAt
      return {
        id: room.id, invite: room.invite, host: room.host, expiresAt: new Date(room.expiresAt).toISOString(),
        serverTime: new Date(now).toISOString(), self: userId, balance: self.balance, roundNo: room.roundNo,
        scheduledAt: room.scheduledAt === null ? null : new Date(room.scheduledAt).toISOString(),
        pitchMode: room.pitchMode, lastSchedule: room.lastSchedule && { ...room.lastSchedule },
        myResults: room.rounds.filter(round => round.startsAt <= now).flatMap(round => round.results.filter(result => result.userId === userId).map(result => ({ roundNo: round.number, prize: result.prize }))),
        members: [...room.members.values()].filter(member => member.active).map(member => ({
          id: member.id, nickname: member.nickname, ready: member.ready,
          online: member.seenAt > now - SHARED_ONLINE_WINDOW_MS,
        })),
        stock: pending ? null : (Object.entries(room.stock) as [SharedPrize, number][]).map(([prize, remaining]) => ({ prize, remaining })),
        round: room.round && {
          number: room.round.number, startsAt: new Date(room.round.startsAt).toISOString(),
          nextReadyAt: new Date(room.round.nextReadyAt).toISOString(), guaranteed: room.round.guaranteed,
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
        room.members.set(userId, { id: userId, nickname: chosen ?? this.autoName(room, userId), balance: 3000, ready: false, active: true, seenAt: this.now() })
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
          else room.members.set(userId, { id: userId, nickname, balance: 3000, ready: false, active: true, seenAt: now })
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
        else room.members.set(userId, { id: userId, nickname, balance: 3000, ready: false, active: true, seenAt: this.now() })
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
      leave: async roomId => {
        const room = locked(roomId)
        const member = room.members.get(userId)!
        member.active = false
        member.ready = false
        wake(roomId)
      },
      subscribe: (roomId, refresh) => {
        current(roomId)
        const listeners = this.listeners.get(roomId) ?? new Set<() => void>()
        listeners.add(refresh)
        this.listeners.set(roomId, listeners)
        return () => { listeners.delete(refresh); if (!listeners.size) this.listeners.delete(roomId) }
      },
    }
  }
}
