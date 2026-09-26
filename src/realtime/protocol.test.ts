import { expect, test } from 'vitest'
import { errorMessage, scheduleMessage, secondsUntil, serverOffset, worldSize } from './protocol'
import { MockRoomServer } from './mock'
test('server clock midpoint and countdown tolerate local clock drift',()=>{
 const offset=serverOffset('2026-01-01T00:00:00Z',Date.parse('2026-01-01T00:01:00Z'),Date.parse('2026-01-01T00:01:00.200Z'))
 expect(secondsUntil('2026-01-01T00:00:08Z',Date.parse('2026-01-01T00:01:00.100Z'),offset)).toBe(8)
 expect(secondsUntil('2026-01-01T00:00:08Z',Date.parse('2026-01-01T00:01:09Z'),offset)).toBe(0)
})
test('world remains four viewport widths in both axes',()=>{
 expect(worldSize(390)).toEqual({width:1560,height:1560})
 expect(worldSize(430)).toEqual({width:1720,height:1720})
 expect(()=>worldSize(NaN)).toThrow();expect(()=>worldSize(0)).toThrow()
})
test('safe user errors do not expose backend details or the seat limit',()=>{
 expect(errorMessage(new Error('room-full'))).toBe('ただいま満員です。これ以上は入れません。')
 expect(errorMessage(new Error('private database detail'))).not.toContain('private')
 expect(errorMessage('Anonymous sign-ins are disabled')).toContain('準備中')
 expect(errorMessage(new Error('P0001: invalid-schedule'))).toContain('1・3・5・10分後')
 expect(scheduleMessage('nobody-ready')).toContain('準備OKの人がいなかった')
 expect(scheduleMessage('failed')).toContain('今すぐ開始')
 expect(scheduleMessage('started')).toBeNull()
 expect(scheduleMessage('cancelled')).toBeNull()
})

test('mock and real contract: 100 seats, one committed result, delayed reveal and reconnect', async () => {
 let now = Date.parse('2026-01-01T00:00:00Z')
 let nextId = 0
 const server = new MockRoomServer(() => now, () => `invite-${++nextId}`, () => 0)
 const users = Array.from({ length: 101 }, (_, i) => server.asUser(`user-${i}`))
 const first = await users[0].create('room-1', 'ホスト')
 expect(first).toMatchObject({ scheduledAt: null, pitchMode: false, lastSchedule: null })
 expect(first.stock?.reduce((sum, stock) => sum + stock.remaining, 0)).toBe(300)
 expect((await users[0].create('room-1', 'ホスト')).id).toBe(first.id)
 for (let i = 1; i < 100; i++) await users[i].join(first.invite, `友だち${i}`)
 await expect(users[100].join(first.invite, '満員')).rejects.toThrow('room-full')
 expect((await users[99].join(first.invite, '復帰')).members).toHaveLength(100)
 for (let i = 0; i < 100; i++) await users[i].ready(first.id, true)
 await expect(users[1].start(first.id, 'other-request', 0)).rejects.toThrow('host-required')
 const started = await users[0].start(first.id, 'start-1', 0)
 expect(started.round?.results).toBeNull()
 expect(started.round?.guaranteed).toBe(false)
 expect(started.stock).toBeNull()
 expect(started.myResults).toEqual([])
 expect(started.balance).toBe(2500)
 expect(Date.parse(started.round!.nextReadyAt) - Date.parse(started.round!.startsAt)).toBe(15000)
 expect((await users[0].start(first.id, 'start-1', 0)).balance).toBe(2500)
 await expect(users[0].start(first.id, 'start-2', 0)).rejects.toThrow('stale-round')
 await expect(users[0].ready(first.id, true)).rejects.toThrow('round-active')
 now += 8000
 const revealed = await users[1].snapshot(first.id)
 expect(revealed.round?.results).toHaveLength(100)
 expect(revealed.myResults).toHaveLength(1)
 expect(revealed.stock?.reduce((sum, stock) => sum + stock.remaining, 0)).toBe(200)
 expect((await users[1].join(first.invite, '再接続')).myResults).toEqual(revealed.myResults)
 now += 15000
 expect((await users[1].ready(first.id, true)).members.find(member => member.id === 'user-1')?.ready).toBe(true)
 now += 46000
 expect((await users[1].claim(first.id)).host).toBe('user-1')
})

test('mock shortage is atomic and ready can be cancelled', async () => {
 let now = 0
 const server = new MockRoomServer(() => now, () => 'invite', () => 0)
 const users = Array.from({ length: 100 }, (_, i) => server.asUser(`user-${i}`))
 const room = await users[0].create('room-short', 'ホスト')
 for (let i = 1; i < 100; i++) await users[i].join(room.invite, `友だち${i}`)
 await expect(users[0].ready(room.id, null as unknown as boolean)).rejects.toThrow('invalid-ready')
 await expect(users[0].start(room.id, 'start', -1)).rejects.toThrow('invalid-round')
 for (let round = 0; round < 3; round++) {
   for (const user of users) await user.ready(room.id, true)
   await users[0].start(room.id, `start-${round}`, round)
   now += 23000
 }
 const oldRetry = await users[0].start(room.id, 'start-0', 3)
 expect(oldRetry.roundNo).toBe(3)
 expect(oldRetry.balance).toBe(1500)
 await users[0].ready(room.id, true)
 await expect(users[0].start(room.id, 'start-3', 3)).rejects.toThrow('sold-out')
 const unchanged = await users[0].snapshot(room.id)
 expect(unchanged.roundNo).toBe(3)
 expect(unchanged.balance).toBe(1500)
 expect(unchanged.stock?.reduce((sum, item) => sum + item.remaining, 0)).toBe(0)
 expect(unchanged.members.find(member => member.id === 'user-0')?.ready).toBe(true)
 // A due schedule that cannot draw changes nothing either and says why.
 await users[0].setPitchMode(room.id, true)
 await users[7].ready(room.id, true)
 await users[0].schedule(room.id, 1)
 now += 60_000
 const afterSchedule = await users[7].snapshot(room.id)
 expect(afterSchedule).toMatchObject({ roundNo: 3, scheduledAt: null, lastSchedule: { status: 'sold-out', roundNo: null } })
 expect((await users[0].snapshot(room.id)).balance).toBe(1500)
 expect((await users[0].ready(room.id, false)).members.find(member => member.id === 'user-0')?.ready).toBe(false)
})

test('mock schedule parity: host only, change, cancel, expiry bound, one start by any member snapshot', async () => {
 let now = Date.parse('2026-01-01T00:00:00Z')
 const server = new MockRoomServer(() => now, () => 'invite', () => 0)
 const [host, friend, watcher] = ['host', 'friend', 'watcher'].map(id => server.asUser(id))
 const room = await host.create('room-s', 'ホスト')
 await friend.join(room.invite, '友だち')
 await watcher.join(room.invite, '見守り')
 await expect(friend.schedule(room.id, 3)).rejects.toThrow('host-required')
 await expect(friend.setPitchMode(room.id, true)).rejects.toThrow('host-required')
 await expect(host.setPitchMode(room.id, null as unknown as boolean)).rejects.toThrow('invalid-request')
 await expect(host.schedule(room.id, 2 as 1)).rejects.toThrow('invalid-schedule')
 expect((await host.schedule(room.id, 3)).scheduledAt).toBe('2026-01-01T00:03:00.000Z')
 expect((await watcher.snapshot(room.id)).scheduledAt).toBe('2026-01-01T00:03:00.000Z')
 expect((await host.schedule(room.id, 1)).scheduledAt).toBe('2026-01-01T00:01:00.000Z')
 expect((await host.schedule(room.id, null)).lastSchedule).toEqual({ status: 'cancelled', scheduledAt: '2026-01-01T00:01:00.000Z', roundNo: null })
 expect((await host.schedule(room.id, null)).lastSchedule?.status).toBe('cancelled')

 // Nobody ready at the time: the schedule clears and says why.
 await host.schedule(room.id, 1)
 now += 60_000
 expect(await watcher.snapshot(room.id)).toMatchObject({ roundNo: 0, scheduledAt: null, lastSchedule: { status: 'nobody-ready', roundNo: null } })

 // The host goes quiet; a watcher's poll after the time starts the round once for the online ready members.
 await host.ready(room.id, true)
 await friend.ready(room.id, true)
 await host.schedule(room.id, 1)
 now += 50_000
 await friend.snapshot(room.id)
 now += 10_000
 const started = await watcher.snapshot(room.id)
 expect(started).toMatchObject({ roundNo: 1, scheduledAt: null, lastSchedule: { status: 'started', roundNo: 1 } })
 expect(started.round?.results).toBeNull()
 expect(Date.parse(started.round!.startsAt) - Date.parse(started.lastSchedule!.scheduledAt)).toBe(8000)
 expect((await friend.snapshot(room.id)).balance).toBe(2500)
 expect((await host.snapshot(room.id)).balance).toBe(3000)
 expect((await watcher.snapshot(room.id)).roundNo).toBe(1)
 await expect(host.schedule(room.id, 1)).rejects.toThrow('round-active')

 // Starting now replaces a schedule; the schedule must end a minute before the room expires.
 now += 23_000
 await friend.ready(room.id, true)
 await host.schedule(room.id, 5)
 expect(await host.start(room.id, 'now', 1)).toMatchObject({ roundNo: 2, scheduledAt: null, lastSchedule: null })
 now = Date.parse('2026-01-01T01:56:00Z')
 await expect(host.schedule(room.id, 5)).rejects.toThrow('invalid-schedule')
 expect((await host.schedule(room.id, 3)).scheduledAt).toBe('2026-01-01T01:59:00.000Z')
})

test('mock: every operation runs an overdue schedule first, so a late change or cancel cannot drop it', async () => {
 let now = Date.parse('2026-01-01T00:00:00Z')
 let rooms = 0
 const server = new MockRoomServer(() => now, () => `invite-${++rooms}`, () => 0)
 const [host, friend, watcher] = ['host', 'friend', 'watcher'].map(id => server.asUser(id))
 const open = async (id: string) => {
   const room = await host.create(id, 'ホスト')
   await friend.join(room.invite, '友だち')
   await watcher.join(room.invite, '見守り')
   await friend.ready(id, true)
   await host.schedule(id, 1)
   now += 40_000
   await friend.snapshot(id)
   now += 20_000
   return id
 }
 const a = await open('late-cancel')
 expect(await host.schedule(a, null)).toMatchObject({ roundNo: 1, scheduledAt: null, lastSchedule: { status: 'started', roundNo: 1 } })
 const b = await open('late-change')
 await expect(host.schedule(b, 3)).rejects.toThrow('round-active')
 expect(await watcher.snapshot(b)).toMatchObject({ roundNo: 1, lastSchedule: { status: 'started' } })
 const c = await open('late-pitch')
 const toggled = await host.setPitchMode(c, true)
 expect(toggled).toMatchObject({ roundNo: 1, pitchMode: true })
 expect(toggled.round?.guaranteed).toBe(false)
 const d = await open('late-leave')
 await friend.leave(d)
 expect((await watcher.snapshot(d)).round?.number).toBe(1)
 now += 8_000
 expect((await watcher.snapshot(d)).round?.results?.map(result => result.userId)).toEqual(['friend'])
})

test('mock pitch mode guarantees a real top prize while stock lasts, then draws normally', async () => {
 let now = 0
 let draws = 0
 // Deterministic draws that never land on the top prize by chance (always the last prize with stock).
 const server = new MockRoomServer(() => now, () => 'invite', () => { draws++; return 0.999 })
 const users = Array.from({ length: 31 }, (_, i) => server.asUser(`user-${i}`))
 const room = await users[0].create('room-p', 'ホスト')
 for (let i = 1; i < users.length; i++) await users[i].join(room.invite, `友だち${i}`)
 expect((await users[0].setPitchMode(room.id, true)).pitchMode).toBe(true)
 expect((await users[5].snapshot(room.id)).pitchMode).toBe(true)
 const round = async (n: number) => {
   for (const user of users) await user.ready(room.id, true)
   const started = await users[0].start(room.id, `p-${n}`, n)
   now += 8000
   const shown = await users[1].snapshot(room.id)
   now += 15000
   return { started, shown }
 }
 // Draws here never land on the top prize by chance, so the guaranteed slot is the only one.
 const first = await round(0)
 expect(first.started.round?.guaranteed).toBe(true)
 expect(first.shown.round?.results?.filter(result => result.prize === 'plush')).toHaveLength(1)
 // The lucky entrant comes from the random source (0.999 → the last entrant).
 expect(first.shown.round?.results?.find(result => result.prize === 'plush')?.userId).toBe('user-30')
 expect(draws).toBe(31)
 expect(first.shown.stock?.find(item => item.prize === 'plush')?.remaining).toBe(29)
 expect((await round(1)).shown.round?.results?.filter(result => result.prize === 'plush')).toHaveLength(1)

 // Draws that always hit the top prize first: round 1 empties it, round 2 is honestly not guaranteed.
 const greedy = new MockRoomServer(() => now, () => 'invite-g', () => 0)
 const players = Array.from({ length: 31 }, (_, i) => greedy.asUser(`g-${i}`))
 const other = await players[0].create('room-g', 'ホスト')
 for (let i = 1; i < players.length; i++) await players[i].join(other.invite, `友だち${i}`)
 await players[0].setPitchMode(other.id, true)
 for (let n = 0; n < 2; n++) {
   for (const player of players) await player.ready(other.id, true)
   await players[0].start(other.id, `g-${n}`, n)
   now += 8000
   const shown = await players[1].snapshot(other.id)
   expect(shown.round?.guaranteed).toBe(n === 0)
   expect(shown.round?.results?.filter(result => result.prize === 'plush')).toHaveLength(n === 0 ? 30 : 0)
   now += 15000
 }
})
