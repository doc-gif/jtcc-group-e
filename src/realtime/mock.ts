import {
  RoomContractError, SHARED_CAPACITY, SHARED_ONLINE_WINDOW_MS, SHARED_PRICE,
  SHARED_ROUND_LOCK_MS, SHARED_START_DELAY_MS,
  type RoomTransport, type SharedPrize, type Snapshot,
} from './protocol'

type MockMember = { id: string; nickname: string; balance: number; ready: boolean; active: boolean; seenAt: number }
type MockResult = { userId: string; nickname: string; prize: SharedPrize }
type MockRound = { number: number; request: string; startsAt: number; nextReadyAt: number; results: MockResult[] }
type MockRoom = {
  id: string; invite: string; host: string; expiresAt: number; roundNo: number
  members: Map<string, MockMember>; stock: Record<SharedPrize, number>; round: MockRound | null; rounds: MockRound[]
}

/** One-device simulation only. Each asUser() adapter obeys the same RoomTransport contract as Supabase. */
export class MockRoomServer {
  private rooms = new Map<string, MockRoom>()
  private listeners = new Map<string, Set<() => void>>()
  private readonly now: () => number
  private readonly id: () => string
  private readonly random: () => number
  constructor(
    now: () => number = () => Date.now(),
    id: () => string = () => crypto.randomUUID(),
    random: () => number = () => Math.random(),
  ) { this.now = now; this.id = id; this.random = random }

  asUser(userId: string): RoomTransport {
    if (!userId) throw new RoomContractError('auth-required')
    const current = (roomId: string) => {
      const room = this.rooms.get(roomId)
      if (!room || room.expiresAt <= this.now() || !room.members.get(userId)?.active) throw new RoomContractError('room-unavailable')
      return room
    }
    const snapshot = (roomId: string): Snapshot => {
      const room = current(roomId)
      const now = this.now()
      const self = room.members.get(userId)!
      self.seenAt = now
      const pending = room.round !== null && now < room.round.startsAt
      return {
        id: room.id, invite: room.invite, host: room.host, expiresAt: new Date(room.expiresAt).toISOString(),
        serverTime: new Date(now).toISOString(), self: userId, balance: self.balance, roundNo: room.roundNo,
        myResults: room.rounds.filter(round => round.startsAt <= now).flatMap(round => round.results.filter(result => result.userId === userId).map(result => ({ roundNo: round.number, prize: result.prize }))),
        members: [...room.members.values()].filter(member => member.active).map(member => ({
          id: member.id, nickname: member.nickname, ready: member.ready,
          online: member.seenAt > now - SHARED_ONLINE_WINDOW_MS,
        })),
        stock: pending ? null : (Object.entries(room.stock) as [SharedPrize, number][]).map(([prize, remaining]) => ({ prize, remaining })),
        round: room.round && {
          number: room.round.number, startsAt: new Date(room.round.startsAt).toISOString(),
          nextReadyAt: new Date(room.round.nextReadyAt).toISOString(),
          results: pending ? null : room.round.results.map(result => ({ ...result })),
        },
      }
    }
    const wake = (roomId: string) => this.listeners.get(roomId)?.forEach(listener => listener())
    const validName = (name: string) => {
      const clean = name?.trim()
      if (!clean || [...clean].length > 12) throw new RoomContractError('invalid-name')
      return clean
    }
    const assertIdle = (room: MockRoom) => {
      if (room.round && room.round.nextReadyAt > this.now()) throw new RoomContractError('round-active')
    }
    return {
      create: async (request, name) => {
        if (!request) throw new RoomContractError('invalid-request')
        const nickname = validName(name)
        const existing = this.rooms.get(request)
        if (existing) {
          if (existing.host !== userId) throw new RoomContractError('room-unavailable')
          return snapshot(request)
        }
        const room: MockRoom = {
          id: request, invite: this.id(), host: userId, expiresAt: this.now() + 2 * 60 * 60_000,
          roundNo: 0, members: new Map([[userId, { id: userId, nickname, balance: 3000, ready: false, active: true, seenAt: this.now() }]]),
          stock: { plush: 10, pouch: 30, badge: 60 }, round: null, rounds: [],
        }
        this.rooms.set(request, room)
        return snapshot(request)
      },
      join: async (invite, name) => {
        const nickname = validName(name)
        const room = [...this.rooms.values()].find(candidate => candidate.invite === invite && candidate.expiresAt > this.now())
        if (!room) throw new RoomContractError('room-unavailable')
        const previous = room.members.get(userId)
        if (!previous?.active && [...room.members.values()].filter(member => member.active).length >= SHARED_CAPACITY) throw new RoomContractError('room-full')
        if (previous) { previous.nickname = nickname; previous.active = true; previous.seenAt = this.now() }
        else room.members.set(userId, { id: userId, nickname, balance: 3000, ready: false, active: true, seenAt: this.now() })
        wake(room.id)
        return snapshot(room.id)
      },
      snapshot: async roomId => snapshot(roomId),
      ready: async (roomId, ready) => {
        const room = current(roomId)
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
        const room = current(roomId)
        if (room.host !== userId) throw new RoomContractError('host-required')
        if (room.round?.request === request) return snapshot(roomId)
        if (room.roundNo !== expected) throw new RoomContractError('stale-round')
        assertIdle(room)
        const entrants = [...room.members.values()].filter(member => member.active && member.ready && member.seenAt > this.now() - SHARED_ONLINE_WINDOW_MS)
        if (!entrants.length) throw new RoomContractError('nobody-ready')
        const available = Object.values(room.stock).reduce((sum, n) => sum + n, 0)
        if (available < entrants.length) throw new RoomContractError('sold-out')
        if (entrants.some(member => member.balance < SHARED_PRICE)) throw new RoomContractError('insufficient-coins')
        const stock = { ...room.stock }
        const results: MockResult[] = []
        for (const member of entrants) {
          const total = Object.values(stock).reduce((sum, n) => sum + n, 0)
          let pick = Math.floor(this.random() * total)
          let selected: SharedPrize | null = null
          for (const prize of Object.keys(stock) as SharedPrize[]) {
            if (pick < stock[prize]) { selected = prize; break }
            pick -= stock[prize]
          }
          if (!selected) throw new RoomContractError('sold-out')
          stock[selected]--
          results.push({ userId: member.id, nickname: member.nickname, prize: selected })
        }
        const startsAt = this.now() + SHARED_START_DELAY_MS
        room.stock = stock
        room.roundNo++
        room.round = { number: room.roundNo, request, startsAt, nextReadyAt: startsAt + SHARED_ROUND_LOCK_MS, results }
        room.rounds.push(room.round)
        for (const member of room.members.values()) member.ready = false
        for (const member of entrants) member.balance -= SHARED_PRICE
        wake(roomId)
        return snapshot(roomId)
      },
      claim: async roomId => {
        const room = current(roomId)
        const host = room.members.get(room.host)
        if (host?.active && host.seenAt > this.now() - SHARED_ONLINE_WINDOW_MS) throw new RoomContractError('host-online')
        room.host = userId
        wake(roomId)
        return snapshot(roomId)
      },
      leave: async roomId => {
        const room = current(roomId)
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