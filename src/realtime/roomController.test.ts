import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MockRoomServer } from './mock'
import type { RoomTransport } from './protocol'
import { createRoomController, ROOM_POLL_MS, roomErrorCode, type RoomControllerOptions } from './roomController'

const T0 = Date.parse('2026-01-01T00:00:00Z')
const NETWORK_MESSAGE = '接続できませんでした。通信を確認して再試行してください。'

beforeEach(() => { vi.useFakeTimers({ now: T0 }) })
afterEach(() => { vi.useRealTimers() })

/** 通信断・応答の消失・購読失敗・片道の遅延を再現する transport。 */
function network(inner: RoomTransport, latency = 0) {
  const net = { offline: false, loseStartResponse: false, subscribeFails: false, creates: [] as string[], starts: [] as string[] }
  const wait = () => latency ? new Promise<void>(resolve => { setTimeout(resolve, latency) }) : Promise.resolve()
  const call = async <T>(run: () => Promise<T>) => {
    await wait()
    if (net.offline) throw new Error('TypeError: fetch failed (10.0.0.1:5432 relation lp_rooms)')
    const value = await run()
    await wait()
    return value
  }
  const transport: RoomTransport = {
    create: (request, name) => { net.creates.push(request); return call(() => inner.create(request, name)) },
    join: (invite, name) => call(() => inner.join(invite, name)),
    snapshot: room => call(() => inner.snapshot(room)),
    ready: (room, ready) => call(() => inner.ready(room, ready)),
    start: async (room, request, expected) => {
      net.starts.push(request)
      if (net.loseStartResponse) {
        net.loseStartResponse = false
        await inner.start(room, request, expected)
        throw new Error('connection reset')
      }
      return call(() => inner.start(room, request, expected))
    },
    claim: room => call(() => inner.claim(room)),
    leave: room => call(() => inner.leave(room)),
    subscribe: (room, refresh) => {
      if (net.subscribeFails) throw new Error('realtime: unauthorized')
      return inner.subscribe(room, refresh)
    },
  }
  return { transport, net }
}

function setup(skew = 0) {
  let invites = 0
  let requests = 0
  const server = new MockRoomServer(() => Date.now() + skew, () => `invite-${++invites}`, () => 0)
  const controller = (user: string, transport: RoomTransport = server.asUser(user), options: RoomControllerOptions = {}) => {
    const created = createRoomController(transport, { requestId: () => `req-${++requests}`, onWake: () => () => {}, ...options })
    created.attach()
    return created
  }
  return { server, controller }
}

test('契約のエラーコードだけを取り出し、生のエラーは表示しない', () => {
  expect(roomErrorCode(new Error('P0001: room-full'))).toBe('room-full')
  expect(roomErrorCode(new Error('relation "lp_rooms" does not exist'))).toBeNull()
})

test('40 席で満員を示し、41 人目は日本語の案内を受け取る。既存 ID の復帰は通す', async () => {
  const { server, controller } = setup()
  const host = controller('user-0')
  expect(host.getState().phase).toBe('idle')
  expect(await host.create('ホスト')).toEqual({ ok: true, error: null })
  const { invite } = host.getState().snapshot!
  expect(host.getState()).toMatchObject({ phase: 'lobby', isHost: true, seats: { taken: 1, capacity: 40, full: false } })
  for (let i = 1; i < 40; i++) await server.asUser(`user-${i}`).join(invite, `友だち${i}`)
  await vi.advanceTimersByTimeAsync(0)
  // 購読の通知だけで再取得する（ポーリングを待たない）。
  expect(host.getState().seats).toEqual({ taken: 40, capacity: 40, full: true })

  const late = controller('user-40')
  const refused = await late.join(invite, '41人目')
  expect(refused).toEqual({ ok: false, error: { code: 'room-full', message: 'このルームは40人で満員です。' } })
  expect(late.getState().phase).toBe('idle')

  const back = controller('user-39')
  expect((await back.join(invite, '復帰')).ok).toBe(true)
  expect(back.getState()).toMatchObject({ phase: 'lobby', isHost: false, canStart: false, startBlockedBy: 'host-required' })

  const stranger = controller('user-41')
  expect((await stranger.join('invite-unknown', '迷子')).error?.code).toBe('room-unavailable')
  expect(stranger.getState().phase).toBe('unavailable')
})

test('サーバー時刻のずれを補正し、startsAt まで結果を隠して直後に公開する', async () => {
  const skew = 90_000
  const { server, controller } = setup(skew)
  const { transport } = network(server.asUser('host'), 100)
  const host = controller('host', transport)
  const settle = async <T>(pending: Promise<T>) => { await vi.advanceTimersByTimeAsync(200); return pending }

  await settle(host.create('ホスト'))
  // 片道 100ms の往復でも中点で推定するので、ずれをそのまま求められる。
  expect(host.getState().serverOffset).toBe(skew)
  expect(host.serverNow()).toBe(Date.now() + skew)
  const friend = server.asUser('friend')
  const { id, invite } = host.getState().snapshot!
  await friend.join(invite, '友だち')
  await friend.ready(id, true)
  await settle(host.setReady(true))
  expect(host.getState()).toMatchObject({ phase: 'ready', readyOnline: 2, readyOthers: 1, canStart: true })

  expect((await settle(host.start())).ok).toBe(true)
  expect(host.getState()).toMatchObject({ phase: 'countdown', secondsLeft: 8, balance: 2500, myPrize: null, canStart: false })
  expect(host.getState().round?.results).toBeNull()
  expect(host.getState().snapshot?.stock).toBeNull()

  await vi.advanceTimersByTimeAsync(7_850)
  expect(host.getState()).toMatchObject({ phase: 'countdown', secondsLeft: 1 })
  expect(host.getState().round?.results).toBeNull()

  await vi.advanceTimersByTimeAsync(150)
  expect(host.getState()).toMatchObject({ phase: 'opening', secondsLeft: 0 })
  expect(host.getState().round?.results).toBeNull()

  await vi.advanceTimersByTimeAsync(550)
  expect(host.getState()).toMatchObject({ phase: 'results', myPrize: 'plush', startBlockedBy: 'round-active', canReady: false })
  expect(host.getState().round?.results).toHaveLength(2)
  expect(host.getState().unseenResults).toEqual([{ roundNo: 1, prize: 'plush' }])

  host.dismissResults()
  expect(host.getState()).toMatchObject({ phase: 'cooldown', unseenResults: [] })
  expect(host.getState().secondsLeft).toBeGreaterThan(13)
  await vi.advanceTimersByTimeAsync(15_000)
  expect(host.getState()).toMatchObject({ phase: 'lobby', secondsLeft: null, canReady: true, startBlockedBy: 'nobody-ready' })
})

test('応答を失った作成・開始は同じ request で送り直し、二重に減算しない', async () => {
  const { server, controller } = setup()
  const { transport, net } = network(server.asUser('host'))
  const host = controller('host', transport)

  net.offline = true
  expect((await host.create('ホスト')).error).toEqual({ code: null, message: NETWORK_MESSAGE })
  net.offline = false
  expect((await host.create('ホスト')).ok).toBe(true)
  expect(net.creates).toEqual(['req-1', 'req-1'])
  await host.setReady(true)

  net.loseStartResponse = true
  net.offline = true
  const lost = await host.start()
  expect(lost.error).toEqual({ code: null, message: NETWORK_MESSAGE })
  await vi.advanceTimersByTimeAsync(0)
  expect(host.getState()).toMatchObject({ phase: 'reconnecting', error: { code: null, message: NETWORK_MESSAGE } })
  expect(host.getState().snapshot?.roundNo).toBe(0)

  net.offline = false
  expect((await host.start()).ok).toBe(true)
  expect(net.starts).toEqual(['req-2', 'req-2'])
  expect(host.getState()).toMatchObject({ phase: 'countdown', balance: 2500, error: null })
  expect(host.getState().snapshot?.roundNo).toBe(1)

  const blocked = await host.start()
  expect(blocked.error).toEqual({ code: 'round-active', message: '今の開封が終わるまでお待ちください。' })
  expect(net.starts).toEqual(['req-2', 'req-2', 'req-3'])
})

test('ホストの接続が 45 秒を超えて途切れたら、ほかの参加者が交代できる', async () => {
  const { controller } = setup()
  const host = controller('host')
  await host.create('ホスト')
  const friend = controller('friend')
  await friend.join(host.getState().snapshot!.invite, '友だち')
  host.detach()

  expect(friend.getState().canClaim).toBe(false)
  expect((await friend.claimHost()).error).toEqual({ code: 'host-online', message: 'ホストは接続中です。' })
  await vi.advanceTimersByTimeAsync(30_000)
  expect(friend.getState().canClaim).toBe(false)
  await vi.advanceTimersByTimeAsync(16_000)
  expect(friend.getState().canClaim).toBe(true)
  expect(friend.getState().members.find(member => member.id === 'host')?.online).toBe(false)

  expect((await friend.claimHost()).ok).toBe(true)
  expect(friend.getState()).toMatchObject({ isHost: true, canClaim: false, startBlockedBy: 'nobody-ready' })
})

test('通信断のあいだは最後の状態を保ち、復帰後に見逃した自分の結果を出す', async () => {
  const { server, controller } = setup()
  const host = controller('host')
  await host.create('ホスト')
  const { transport, net } = network(server.asUser('friend'))
  let wake = () => {}
  const friend = controller('friend', transport, { onWake: next => { wake = next; return () => {} } })
  await friend.join(host.getState().snapshot!.invite, '友だち')
  await friend.setReady(true)
  await host.refresh()
  expect(host.getState()).toMatchObject({ readyOnline: 1, readyOthers: 1, canStart: true })
  await host.start()
  await vi.advanceTimersByTimeAsync(0)
  expect(friend.getState().phase).toBe('countdown')

  net.offline = true
  await vi.advanceTimersByTimeAsync(40_000)
  expect(friend.getState()).toMatchObject({ phase: 'reconnecting', canReady: false, canClaim: false })
  expect(friend.getState().snapshot?.round?.results).toBeNull()

  net.offline = false
  wake()
  await vi.advanceTimersByTimeAsync(0)
  expect(friend.getState()).toMatchObject({ phase: 'results', myPrize: 'plush', balance: 2500 })
  expect(friend.getState().unseenResults).toEqual([{ roundNo: 1, prize: 'plush' }])
  friend.dismissResults()
  expect(friend.getState()).toMatchObject({ phase: 'lobby', unseenResults: [], canReady: true })

  // 確認済みを画面側で保存していれば、別の端末状態からの復帰でも再表示しない。
  const reopened = controller('friend', server.asUser('friend'), { seenResultRounds: [1] })
  await reopened.open(host.getState().snapshot!.id)
  expect(reopened.getState()).toMatchObject({ phase: 'lobby', unseenResults: [] })
})

test('購読に失敗してもポーリングで更新し、期限切れで止まる', async () => {
  const { server, controller } = setup()
  const { transport, net } = network(server.asUser('host'))
  net.subscribeFails = true
  const host = controller('host', transport)
  await host.create('ホスト')
  await server.asUser('friend').join(host.getState().snapshot!.invite, '友だち')
  await vi.advanceTimersByTimeAsync(0)
  expect(host.getState().members).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(ROOM_POLL_MS)
  expect(host.getState()).toMatchObject({ phase: 'lobby', seats: { taken: 2, capacity: 40, full: false } })

  await vi.advanceTimersByTimeAsync(2 * 60 * 60_000)
  expect(host.getState().phase).toBe('unavailable')
  expect(vi.getTimerCount()).toBe(0)
})

test('退室すると最初の状態に戻り、タイマーを残さない', async () => {
  const { controller } = setup()
  const host = controller('host')
  await host.create('ホスト')
  expect(vi.getTimerCount()).toBeGreaterThan(0)
  expect(await host.leave()).toEqual({ ok: true, error: null })
  expect(host.getState()).toMatchObject({ phase: 'idle', roomId: null, snapshot: null })
  expect(vi.getTimerCount()).toBe(0)
})
