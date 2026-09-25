import { expect, test } from 'vitest'
import { errorMessage, secondsUntil, serverOffset, worldSize } from './protocol'
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
test('safe user errors do not expose backend details',()=>{
 expect(errorMessage(new Error('room-full'))).toContain('40人')
 expect(errorMessage(new Error('private database detail'))).not.toContain('private')
 expect(errorMessage('Anonymous sign-ins are disabled')).toContain('準備中')
})

test('mock and real contract: 40 seats, one committed result, delayed reveal and reconnect', async () => {
 let now = Date.parse('2026-01-01T00:00:00Z')
 let nextId = 0
 const server = new MockRoomServer(() => now, () => `invite-${++nextId}`, () => 0)
 const users = Array.from({ length: 41 }, (_, i) => server.asUser(`user-${i}`))
 const first = await users[0].create('room-1', 'ホスト')
 expect((await users[0].create('room-1', 'ホスト')).id).toBe(first.id)
 for (let i = 1; i < 40; i++) await users[i].join(first.invite, `友だち${i}`)
 await expect(users[40].join(first.invite, '満員')).rejects.toThrow('room-full')
 expect((await users[39].join(first.invite, '復帰')).members).toHaveLength(40)
 for (let i = 0; i < 40; i++) await users[i].ready(first.id, true)
 await expect(users[1].start(first.id, 'other-request', 0)).rejects.toThrow('host-required')
 const started = await users[0].start(first.id, 'start-1', 0)
 expect(started.round?.results).toBeNull()
 expect(started.stock).toBeNull()
 expect(started.myResults).toEqual([])
 expect(started.balance).toBe(2500)
 expect(Date.parse(started.round!.nextReadyAt) - Date.parse(started.round!.startsAt)).toBe(15000)
 expect((await users[0].start(first.id, 'start-1', 0)).balance).toBe(2500)
 await expect(users[0].start(first.id, 'start-2', 0)).rejects.toThrow('stale-round')
 await expect(users[0].ready(first.id, true)).rejects.toThrow('round-active')
 now += 8000
 const revealed = await users[1].snapshot(first.id)
 expect(revealed.round?.results).toHaveLength(40)
 expect(revealed.myResults).toHaveLength(1)
 expect(revealed.stock?.reduce((sum, stock) => sum + stock.remaining, 0)).toBe(60)
 expect((await users[1].join(first.invite, '再接続')).myResults).toEqual(revealed.myResults)
 now += 15000
 expect((await users[1].ready(first.id, true)).members.find(member => member.id === 'user-1')?.ready).toBe(true)
 now += 46000
 expect((await users[1].claim(first.id)).host).toBe('user-1')
})

test('mock shortage is atomic and ready can be cancelled', async () => {
 let now = 0
 const server = new MockRoomServer(() => now, () => 'invite', () => 0)
 const users = Array.from({ length: 40 }, (_, i) => server.asUser(`user-${i}`))
 const room = await users[0].create('room-short', 'ホスト')
 for (let i = 1; i < 40; i++) await users[i].join(room.invite, `友だち${i}`)
 await expect(users[0].ready(room.id, null as unknown as boolean)).rejects.toThrow('invalid-ready')
 await expect(users[0].start(room.id, 'start', -1)).rejects.toThrow('invalid-round')
 for (let round = 0; round < 2; round++) {
   for (const user of users) await user.ready(room.id, true)
   await users[0].start(room.id, `start-${round}`, round)
   now += 23000
 }
 for (const user of users) await user.ready(room.id, true)
 await expect(users[0].start(room.id, 'start-2', 2)).rejects.toThrow('sold-out')
 const unchanged = await users[0].snapshot(room.id)
 expect(unchanged.roundNo).toBe(2)
 expect(unchanged.balance).toBe(2000)
 expect(unchanged.stock?.reduce((sum, item) => sum + item.remaining, 0)).toBe(20)
 expect(unchanged.members.find(member => member.id === 'user-0')?.ready).toBe(true)
 expect((await users[0].ready(room.id, false)).members.find(member => member.id === 'user-0')?.ready).toBe(false)
})