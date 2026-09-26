import { expect, test } from 'vitest'
import { browserHostKeyStore, HOST_KEY_STORAGE, hostLinkHash, parseHostLink } from './hostKey'
import {
  cleanName, errorMessage, nameKey, nameSuggestion, RoomContractError, scheduleMessage, secondsUntil, serverOffset, worldSize,
  type RoomTransport,
} from './protocol'
import { AUTO_NAME_WORDS, MockRoomServer } from './mock'
/** Test-only key for the in-memory mock. Real keys come from scripts/host-key.mjs and are never committed. */
const KEY = 'mock_host_key_for_tests_only_000000000001'
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
 server.addHostKey(KEY)
 const users = Array.from({ length: 101 }, (_, i) => server.asUser(`user-${i}`))
 const first = await users[0].create('room-1', KEY, 'ホスト')
 expect(first).toMatchObject({ scheduledAt: null, pitchMode: false, lastSchedule: null })
 expect(first.stock?.reduce((sum, stock) => sum + stock.remaining, 0)).toBe(300)
 expect((await users[0].create('room-1', KEY, 'ホスト')).id).toBe(first.id)
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
 // F10: nobody takes over from an absent host.
 const absent = await users[1].snapshot(first.id)
 expect(absent.host).toBe('user-0')
 expect(absent.members.find(member => member.id === 'user-0')?.online).toBe(false)
 expect('claim' in users[1]).toBe(false)
})

test('mock shortage is atomic and ready can be cancelled', async () => {
 let now = 0
 const server = new MockRoomServer(() => now, () => 'invite', () => 0)
 server.addHostKey(KEY)
 const users = Array.from({ length: 100 }, (_, i) => server.asUser(`user-${i}`))
 const room = await users[0].create('room-short', KEY, 'ホスト')
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
 server.addHostKey(KEY)
 const [host, friend, watcher] = ['host', 'friend', 'watcher'].map(id => server.asUser(id))
 const room = await host.create('room-s', KEY, 'ホスト')
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
 server.addHostKey(KEY)
 const [host, friend, watcher] = ['host', 'friend', 'watcher'].map(id => server.asUser(id))
 const open = async (id: string) => {
   const room = await host.create(id, KEY, 'ホスト')
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
 server.addHostKey(KEY)
 const users = Array.from({ length: 31 }, (_, i) => server.asUser(`user-${i}`))
 const room = await users[0].create('room-p', KEY, 'ホスト')
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
 greedy.addHostKey(KEY)
 const players = Array.from({ length: 31 }, (_, i) => greedy.asUser(`g-${i}`))
 const other = await players[0].create('room-g', KEY, 'ホスト')
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

test('host link: key in the fragment only, stored per device, tolerant of blocked storage', () => {
 expect(parseHostLink(`#/host/${KEY}`)).toBe(KEY)
 expect(parseHostLink(`#/host/${KEY}/`)).toBe(KEY)
 for (const hash of ['#/host/short', `#/host/${KEY}/x`, `#/room/${KEY}`, `#/host/${KEY}!`, '']) expect(parseHostLink(hash)).toBeNull()
 expect(hostLinkHash(KEY)).toBe(`#/host/${KEY}`)
 expect(() => hostLinkHash('bad key')).toThrow()
 const values = new Map<string, string>()
 const storage = {
  getItem: (name: string) => values.get(name) ?? null,
  setItem: (name: string, value: string) => { values.set(name, value) },
  removeItem: (name: string) => { values.delete(name) },
 } as Storage
 const store = browserHostKeyStore(() => storage)
 expect(store.get()).toBeNull()
 store.set(KEY)
 expect(values.get(HOST_KEY_STORAGE)).toBe(KEY)
 expect(store.get()).toBe(KEY)
 values.set(HOST_KEY_STORAGE, 'tampered value')
 expect(store.get()).toBeNull()
 store.set(null)
 expect(values.has(HOST_KEY_STORAGE)).toBe(false)
 const blocked = browserHostKeyStore(() => { throw new Error('SecurityError') })
 expect(blocked.get()).toBeNull()
 expect(() => blocked.set(KEY)).not.toThrow()
 expect(browserHostKeyStore(() => undefined).get()).toBeNull()
})

test('names: display form, comparison across width, case and spaces, and Japanese messages', () => {
 expect(cleanName('  もも　 ちゃん ')).toBe('もも ちゃん')
 for (const name of ['', '   ', 'あ'.repeat(13), 'a\u0007b', null, undefined]) expect(cleanName(name)).toBeNull()
 expect(cleanName('あ'.repeat(12))).toBe('あ'.repeat(12))
 const cp = String.fromCodePoint
 for (const code of [0x600, 0x200b, 0x202e, 0xfeff, 0x2060, 0xe0001, 0xad, 0x85, 0x2066, 0x1d173]) expect(cleanName(`ゆ${cp(code)}ず`)).toBeNull()
 expect(cleanName(`ゆ${cp(0x2028)}${cp(0x2029)}ず`)).toBe('ゆ ず')
 expect(errorMessage(new Error('rename-locked'))).toBe('ニックネームは開封が終わってから、ロビーで変えられます。')
 expect(cleanName(`${cp(0x3000)}ゆ${cp(0x2003)}${cp(0x9)}ず${cp(0xa0)}`)).toBe('ゆ ず')
 expect(nameKey(`も${cp(0xa0)}も`)).toBe(nameKey('もも'))
 expect(nameKey('Ｍｏｍｏ　２')).toBe(nameKey('momo2'))
 expect(nameKey('ｱｲ')).toBe(nameKey('アイ'))
 const taken = new RoomContractError('name-taken', 'もも2')
 expect(nameSuggestion(taken)).toBe('もも2')
 expect(nameSuggestion(new RoomContractError('invalid-name'))).toBeNull()
 expect(errorMessage(taken)).toBe('このルームに同じニックネームの人がいます。別のニックネームにしてください。「もも2」なら使えます。')
 expect(errorMessage(new Error('name-taken'))).not.toContain('「')
 expect(errorMessage(new Error('host-key-invalid'))).toContain('ホスト用リンクが無効')
 expect(errorMessage(new Error('too-many-attempts'))).toContain('1分ほど待って')
 expect(errorMessage(new Error('no-room'))).toContain('新しくルームを作れます')
})

test('mock host key: only the key holder creates; wrong keys are limited per user; revoked keys fail', async () => {
 let now = 0
 const server = new MockRoomServer(() => now, () => 'invite-k', () => 0)
 server.addHostKey(KEY)
 expect(() => server.addHostKey('short')).toThrow()
 const guest = server.asUser('guest')
 for (const key of ['wrong_key_but_well_formed_000000000000001', 'short', '', null as unknown as string]) {
  await expect(guest.create('room-x', key, 'ゲスト')).rejects.toThrow('host-key-invalid')
 }
 await expect(guest.resumeHost('wrong_key_but_well_formed_000000000000001', null)).rejects.toThrow('host-key-invalid')
 await expect(guest.create('room-x', KEY, 'ゲスト')).rejects.toThrow('too-many-attempts')
 await expect(guest.snapshot('room-x')).rejects.toThrow('room-unavailable')
 expect((await server.asUser('owner').create('room-o', KEY, null)).host).toBe('owner')
 now += 61_000
 expect((await guest.create('room-x', KEY, 'ゲスト')).host).toBe('guest')
 server.revokeHostKey(KEY)
 // A retry of an already created room returns it; anything new needs a valid key.
 expect((await server.asUser('owner').create('room-o', KEY, null)).id).toBe('room-o')
 await expect(guest.create('room-o', KEY, null)).rejects.toThrow('host-key-invalid')
 await expect(server.asUser('owner').create('room-y', KEY, 'オーナー')).rejects.toThrow('host-key-invalid')
 await expect(server.asUser('owner').resumeHost(KEY, null)).rejects.toThrow('host-key-invalid')
})

test('mock resume: the owner becomes host on a new device and keeps seats, coins and results', async () => {
 let now = 0
 const server = new MockRoomServer(() => now, () => 'invite-r', () => 0)
 server.addHostKey(KEY)
 const [laptop, phone, friend] = ['laptop', 'phone', 'friend'].map(id => server.asUser(id)) as [RoomTransport, RoomTransport, RoomTransport]
 const room = await laptop.create('room-r', KEY, 'オーナー')
 await friend.join(room.invite, '友だち')
 await laptop.ready(room.id, true)
 await friend.ready(room.id, true)
 await laptop.start(room.id, 'start-r', 0)
 now += 23_000
 const before = await laptop.snapshot(room.id)
 const friendBefore = await friend.snapshot(room.id)
 await expect(phone.resumeHost(KEY, 'room-unknown')).rejects.toThrow('no-room')
 const resumed = await phone.resumeHost(KEY, null)
 expect(resumed).toMatchObject({ id: room.id, host: 'phone', self: 'phone', balance: before.balance, myResults: before.myResults })
 expect(resumed.members.map(member => [member.id, member.nickname])).toEqual([['phone', 'オーナー'], ['friend', '友だち']])
 expect(resumed.round?.results?.some(result => result.userId === 'laptop')).toBe(false)
 expect(await friend.snapshot(room.id)).toMatchObject({ host: 'phone', balance: friendBefore.balance, myResults: friendBefore.myResults })
 await expect(laptop.snapshot(room.id)).rejects.toThrow('room-unavailable')
 expect((await phone.resumeHost(KEY, room.id)).host).toBe('phone')
 // A device that joined as a participant keeps its own seat; the old host seat is released.
 await laptop.join(room.invite, 'ノートPC')
 const back = await laptop.resumeHost(KEY, room.id)
 expect(back).toMatchObject({ host: 'laptop', balance: 3000 })
 expect(back.members.map(member => member.nickname)).toEqual(['友だち', 'ノートPC'])
 expect((await phone.resumeHost(KEY, room.id)).members.map(member => member.nickname)).toEqual(['オーナー', '友だち'])
 now += 2 * 60 * 60_000
 await expect(phone.resumeHost(KEY, null)).rejects.toThrow('no-room')
})

test('mock names: unique per room, suggestion, auto names and rename like the SQL', async () => {
 let n = 0
 const server = new MockRoomServer(() => 0, () => 'invite-n', () => (n++ % 7) / 7)
 server.addHostKey(KEY)
 const user = (id: string) => server.asUser(id)
 const room = await user('owner').create('room-n', KEY, 'もも')
 const taken = await user('a').join(room.invite, 'もも').catch((error: unknown) => error)
 expect(taken).toBeInstanceOf(RoomContractError)
 expect(nameSuggestion(taken)).toBe('もも2')
 await user('a').join(room.invite, ' もも2 ')
 for (const name of ['もも２', 'も も2', 'も　も２']) await expect(user('b').join(room.invite, name)).rejects.toMatchObject({ code: 'name-taken' })
 await expect(user('b').join(room.invite, 'もも２')).rejects.toMatchObject({ suggestion: 'もも3' })
 await user('b').join(room.invite, 'Momo')
 await expect(user('c').join(room.invite, 'ｍｏｍｏ')).rejects.toMatchObject({ suggestion: 'ｍｏｍｏ2' })
 await user('c').join(room.invite, 'あいうえおかきくけこさし')
 await expect(user('d').join(room.invite, 'あいうえおかきくけこさし')).rejects.toMatchObject({ suggestion: 'あいうえおかきくけこさ2' })
 await expect(user('d').join(room.invite, '   ')).rejects.toThrow('invalid-name')
 expect((await user('b').rename(room.id, 'MOMO')).members.find(member => member.id === 'b')?.nickname).toBe('MOMO')
 await expect(user('b').rename(room.id, 'もも')).rejects.toMatchObject({ code: 'name-taken', suggestion: 'もも3' })
 await expect(user('b').rename(room.id, '')).rejects.toThrow('invalid-name')
 await expect(user('d').rename(room.id, 'よそ者')).rejects.toThrow('room-unavailable')
 // Without a name: a friendly unique one, kept on rejoin while free.
 const auto = (await user('d').join(room.invite, null)).members.find(member => member.id === 'd')!.nickname
 expect(auto).toMatch(new RegExp(`^ゲスト (${AUTO_NAME_WORDS.join('|')})\\d+$`))
 await user('d').leave(room.id)
 expect((await user('d').join(room.invite, null)).members.find(member => member.id === 'd')?.nickname).toBe(auto)
 await user('a').leave(room.id)
 await user('e').join(room.invite, 'もも2')
 expect((await user('a').join(room.invite, null)).members.find(member => member.id === 'a')?.nickname).not.toBe('もも2')
 // A full room of auto names stays unique even when random picks repeat.
 const crowded = new MockRoomServer(() => 0, () => 'invite-c', () => 0)
 crowded.addHostKey(KEY)
 const full = await crowded.asUser('h').create('room-c', KEY, null)
 for (let i = 1; i < 100; i++) await crowded.asUser(`u${i}`).join(full.invite, null)
 const names = (await crowded.asUser('h').snapshot(full.id)).members.map(member => member.nickname)
 expect(new Set(names.map(nameKey)).size).toBe(100)
 expect(names.every(name => [...name].length <= 12)).toBe(true)
})

test('mock parity: rename is refused while a round is active, like lp_rename', async () => {
 let now = 0
 const server = new MockRoomServer(() => now, () => 'invite-l', () => 0)
 server.addHostKey(KEY)
 const owner = server.asUser('owner')
 const friend = server.asUser('friend')
 const room = await owner.create('room-l', KEY, 'オーナー')
 await friend.join(room.invite, '友だち')
 await friend.ready(room.id, true)
 await owner.start(room.id, 'start-l', 0)
 for (const user of [owner, friend]) await expect(user.rename(room.id, '新しい名前')).rejects.toThrow('rename-locked')
 now += 23_000
 const done = await friend.snapshot(room.id)
 expect(done.round?.results?.find(result => result.userId === 'friend')?.nickname).toBe('友だち')
 expect((await friend.rename(room.id, '新しい名前')).members.find(member => member.id === 'friend')?.nickname).toBe('新しい名前')
 // A due schedule starts first, then the rename is refused (the mock keeps the start; SQL rolls it back and restarts it).
 await friend.ready(room.id, true)
 await owner.schedule(room.id, 1)
 now += 40_000
 await friend.snapshot(room.id)
 now += 20_000
 await expect(friend.rename(room.id, '予約中の名前')).rejects.toThrow('rename-locked')
 expect(await owner.snapshot(room.id)).toMatchObject({ roundNo: 2, lastSchedule: { status: 'started' } })
})
