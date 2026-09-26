import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { HostKeyStore } from './hostKey'
import { MockRoomServer } from './mock'
import type { RoomTransport, Snapshot } from './protocol'
import { createRoomController, ROOM_POLL_MS, roomErrorCode, type RoomControllerOptions } from './roomController'

/** 模擬サーバー専用のキー。本物のキーは scripts/host-key.mjs で作り、リポジトリに置かない。 */
const KEY = 'controller_host_key_for_tests_only_000001'

/** 端末ごとの保存先（localStorage の代わり）。 */
function memoryKeys(initial: string | null = null): HostKeyStore & { value: string | null } {
  const store = { value: initial, get: () => store.value, set: (key: string | null) => { store.value = key } }
  return store
}

const T0 = Date.parse('2026-01-01T00:00:00Z')
const NETWORK_MESSAGE = '接続できませんでした。通信を確認して再試行してください。'

beforeEach(() => { vi.useFakeTimers({ now: T0 }) })
afterEach(() => { vi.useRealTimers() })

/** 通信断・応答の消失・購読失敗・片道の遅延を再現する transport。 */
function network(inner: RoomTransport, latency = 0) {
  const net = { offline: false, loseStartResponse: false, subscribeFails: false, creates: [] as string[], starts: [] as string[], keys: [] as string[] }
  const wait = () => latency ? new Promise<void>(resolve => { setTimeout(resolve, latency) }) : Promise.resolve()
  const call = async <T>(run: () => Promise<T>) => {
    await wait()
    if (net.offline) throw new Error('TypeError: fetch failed (10.0.0.1:5432 relation lp_rooms)')
    const value = await run()
    await wait()
    return value
  }
  const transport: RoomTransport = {
    create: (request, hostKey, name) => { net.creates.push(request); net.keys.push(hostKey); return call(() => inner.create(request, hostKey, name)) },
    resumeHost: (hostKey, room) => { net.keys.push(hostKey); return call(() => inner.resumeHost(hostKey, room)) },
    rename: (room, name) => call(() => inner.rename(room, name)),
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
    schedule: (room, minutes) => call(() => inner.schedule(room, minutes)),
    setPitchMode: (room, on) => call(() => inner.setPitchMode(room, on)),
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
  server.addHostKey(KEY)
  const controller = (user: string, transport: RoomTransport = server.asUser(user), options: RoomControllerOptions = {}) => {
    const created = createRoomController(transport, { requestId: () => `req-${++requests}`, onWake: () => () => {}, hostKeys: memoryKeys(), ...options })
    created.attach()
    return created
  }
  return { server, controller }
}

test('契約のエラーコードだけを取り出し、生のエラーは表示しない', () => {
  expect(roomErrorCode(new Error('P0001: room-full'))).toBe('room-full')
  expect(roomErrorCode(new Error('relation "lp_rooms" does not exist'))).toBeNull()
})

test('100 席で満員を示し、101 人目は上限の数字を含まない日本語の案内を受け取る。既存 ID の復帰は通す', async () => {
  const { server, controller } = setup()
  const host = controller('user-0')
  expect(host.getState().phase).toBe('idle')
  expect(await host.createAsHost(KEY, 'ホスト')).toEqual({ ok: true, error: null })
  const { invite } = host.getState().snapshot!
  expect(host.getState()).toMatchObject({ phase: 'lobby', isHost: true, seats: { taken: 1, capacity: 100, full: false } })
  for (let i = 1; i < 100; i++) await server.asUser(`user-${i}`).join(invite, `友だち${i}`)
  await vi.advanceTimersByTimeAsync(0)
  // 購読の通知だけで再取得する（ポーリングを待たない）。
  expect(host.getState().seats).toEqual({ taken: 100, capacity: 100, full: true })

  const late = controller('user-100')
  const refused = await late.join(invite, '101人目')
  expect(refused).toEqual({ ok: false, error: { code: 'room-full', message: 'ただいま満員です。これ以上は入れません。' } })
  expect(late.getState().phase).toBe('idle')

  const back = controller('user-99')
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

  await settle(host.createAsHost(KEY, 'ホスト'))
  // 片道 100ms の往復でも中点で推定するので、ずれをそのまま求められる。
  expect(host.getState().serverOffset).toBe(skew)
  expect(host.serverNow()).toBe(Date.now() + skew)
  const friend = server.asUser('friend')
  const { id, invite } = host.getState().snapshot!
  await friend.join(invite, '友だち')
  // F13: ホストのほかに 2 人以上いないと始められない。
  await server.asUser('watcher').join(invite, '見守り')
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
  expect((await host.createAsHost(KEY, 'ホスト')).error).toEqual({ code: null, message: NETWORK_MESSAGE })
  net.offline = false
  expect((await host.createAsHost(KEY, 'ホスト')).ok).toBe(true)
  expect(net.creates).toEqual(['req-1', 'req-1'])
  // F13: ホストのほかに 2 人以上いないと始められない。
  for (const guest of ['a', 'b']) await server.asUser(guest).join(host.getState().snapshot!.invite, guest)
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

test('ホストが 45 秒を超えて不在でも交代はなく、ホスト用リンクで別の端末からホストに戻る', async () => {
  const { controller } = setup()
  const laptopKeys = memoryKeys()
  const host = controller('laptop', undefined, { hostKeys: laptopKeys })
  await host.createAsHost(KEY, 'ホスト')
  expect(laptopKeys.value).toBe(KEY)
  expect(host.getState()).toMatchObject({ isHost: true, hostOnline: true, hostKey: KEY })
  const friend = controller('friend')
  await friend.join(host.getState().snapshot!.invite, '友だち')
  host.detach()

  expect(friend.getState()).toMatchObject({ isHost: false, hostOnline: true, hostKey: null })
  await vi.advanceTimersByTimeAsync(46_000)
  expect(friend.getState()).toMatchObject({ isHost: false, hostOnline: false, startBlockedBy: 'host-required' })
  expect('claimHost' in friend).toBe(false)

  // 別の端末（新しい匿名 ID）でホスト用リンクを開く。キーを渡さなければ保存済みのキーを使う。
  const phoneKeys = memoryKeys(KEY)
  const phone = controller('phone', undefined, { hostKeys: phoneKeys })
  expect(phone.getState()).toMatchObject({ phase: 'idle', hostKey: KEY })
  const resuming = phone.resumeHost()
  expect(phone.getState()).toMatchObject({ phase: 'connecting', busy: 'resume' })
  expect(await resuming).toEqual({ ok: true, error: null })
  expect(phone.getState()).toMatchObject({ phase: 'lobby', isHost: true, hostOnline: true, self: { nickname: 'ホスト' } })
  await friend.refresh()
  expect(friend.getState()).toMatchObject({ isHost: false, hostOnline: true })
  expect(friend.getState().members.map(member => member.nickname)).toEqual(['ホスト', '友だち'])
})

test('ホスト用キー: 成功したキーだけを保存し、無効なら消す。形の違うキーは送らない', async () => {
  const { server, controller } = setup()
  const { transport, net } = network(server.asUser('owner'))
  const keys = memoryKeys('stale_key_that_was_revoked_00000000000001')
  const owner = controller('owner', transport, { hostKeys: keys })

  const stale = await owner.createAsHost()
  expect(stale.error).toMatchObject({ code: 'host-key-invalid' })
  expect(stale.error?.message).toContain('ホスト用リンクが無効')
  expect(owner.getState()).toMatchObject({ phase: 'idle', hostKey: null })
  expect(keys.value).toBeNull()

  expect((await owner.createAsHost()).error?.code).toBe('host-key-invalid')
  expect((await owner.resumeHost('not a key')).error?.code).toBe('host-key-invalid')
  expect(net.keys).toEqual(['stale_key_that_was_revoked_00000000000001'])

  expect((await owner.resumeHost(KEY)).error).toMatchObject({ code: 'no-room', message: 'このホスト用リンクで開いているルームはありません。新しくルームを作れます。' })
  expect(owner.getState().phase).toBe('idle')
  expect(await owner.createAsHost(KEY)).toEqual({ ok: true, error: null })
  expect(keys.value).toBe(KEY)
  expect(owner.getState()).toMatchObject({ phase: 'lobby', isHost: true, hostKey: KEY })
  expect(owner.getState().self?.nickname).toMatch(/^ゲスト \S+\d+$/)
  owner.forgetHostKey()
  expect(owner.getState().hostKey).toBeNull()
  expect(keys.value).toBeNull()

  // 応答を待つ間に別のタブが新しいキーを保存したら、無効だった古いキーの失敗でそれを消さない。
  const shared = memoryKeys('old_key_rotated_away_000000000000000001')
  const tab = controller('tab', undefined, { hostKeys: shared })
  const pending = tab.createAsHost()
  shared.value = KEY
  expect((await pending).error?.code).toBe('host-key-invalid')
  expect(shared.value).toBe(KEY)
  expect(tab.getState().hostKey).toBe(KEY)
  // 応答を待つ間に別のタブが別のキーを保存したら、古い成功で上書きしない（compare-and-set）。
  const casKeys = memoryKeys(null)
  const casTab = controller('cas', undefined, { hostKeys: casKeys })
  const creating = casTab.createAsHost(KEY, 'CAS')
  casKeys.value = 'newer_key_saved_by_another_tab_0000000001'
  expect((await creating).ok).toBe(true)
  expect(casKeys.value).toBe('newer_key_saved_by_another_tab_0000000001')
  expect(casTab.getState().hostKey).toBe('newer_key_saved_by_another_tab_0000000001')
  // 変わっていなければ保存する。
  casKeys.value = null
  expect((await controller('cas2', undefined, { hostKeys: casKeys }).resumeHost(KEY)).ok).toBe(true)
  expect(casKeys.value).toBe(KEY)

  // 保存を省いた呼び出しは、いま保存されているキーを使う（ここでは owner のルームのホストに戻る）。
  expect((await tab.resumeHost()).ok).toBe(true)
  expect(tab.getState()).toMatchObject({ isHost: true, hostKey: KEY })

  // 失敗が続いた利用者は、正しいキーでも 1 分待つ。保存済みのキーは消さない。
  const guestKeys = memoryKeys(KEY)
  const guest = controller('guest', undefined, { hostKeys: guestKeys })
  for (let i = 0; i < 5; i++) await guest.resumeHost('wrong_key_but_well_formed_000000000000001')
  expect(guestKeys.value).toBe(KEY)
  expect((await guest.resumeHost()).error).toMatchObject({ code: 'too-many-attempts' })
  expect(guestKeys.value).toBe(KEY)
})

test('名前を選ばずに入ると重ならない名前が付き、使われている名前には候補を出す。ロビーで変えられる', async () => {
  const { server, controller } = setup()
  const host = controller('host')
  await host.createAsHost(KEY, 'もも')
  const invite = host.getState().snapshot!.invite

  const guest = controller('guest')
  const taken = await guest.join(invite, 'もも')
  expect(taken.error).toEqual({
    code: 'name-taken', suggestion: 'もも2',
    message: 'このルームに同じニックネームの人がいます。別のニックネームにしてください。「もも2」なら使えます。',
  })
  expect(guest.getState()).toMatchObject({ phase: 'idle', nameSuggestion: 'もも2', canRename: false })
  expect((await guest.join(invite, 'ＭＯＭＯ')).ok).toBe(true)
  expect(guest.getState()).toMatchObject({ phase: 'lobby', nameSuggestion: null, canRename: true, self: { nickname: 'ＭＯＭＯ' } })

  // 名前を選ばずに入った人は、入る前に付いた名前を見て、あとから変えられる。
  const quietTransport = server.asUser('quiet')
  const quiet = controller('quiet', quietTransport)
  expect((await quiet.join(invite, null)).ok).toBe(true)
  const auto = quiet.getState().self!.nickname
  expect(auto).toMatch(/^ゲスト \S+\d+$/)
  expect((await quiet.rename('momo')).error).toMatchObject({ code: 'name-taken', suggestion: 'momo2' })
  expect(quiet.getState()).toMatchObject({ nameSuggestion: 'momo2', self: { nickname: auto } })
  expect((await quiet.rename(quiet.getState().nameSuggestion!)).ok).toBe(true)
  expect(quiet.getState()).toMatchObject({ nameSuggestion: null, self: { nickname: 'momo2' } })
  expect((await quiet.rename('   ')).error?.code).toBe('invalid-name')
  // 名前はロビー（準備中を含む）でだけ変えられる。
  expect(quiet.getState()).toMatchObject({ phase: 'lobby', canRename: true })
  await quiet.setReady(true)
  expect(quiet.getState()).toMatchObject({ phase: 'ready', canRename: true })
  await host.start()
  await quiet.refresh()
  expect(quiet.getState()).toMatchObject({ phase: 'countdown', canRename: false })
  // 開封中はサーバーへ送らずに断る。古い状態のままの端末から送っても、サーバーが断る。
  const renames = vi.spyOn(quietTransport, 'rename')
  expect(await quiet.rename('開封中の名前')).toEqual({
    ok: false, error: { code: 'rename-locked', message: 'ニックネームは開封が終わってから、ロビーで変えられます。' },
  })
  expect(renames).not.toHaveBeenCalled()
  await expect(server.asUser('quiet').rename(quiet.getState().roomId!, '開封中の名前')).rejects.toThrow('rename-locked')
  expect(quiet.getState().self?.nickname).toBe('momo2')
  await host.refresh()
  expect(host.getState().members.map(member => member.nickname)).toEqual(['もも', 'ＭＯＭＯ', 'momo2'])
  const idle = controller('idle')
  expect(await idle.rename('だれか')).toEqual({ ok: false, error: null })
})

test('通信断のあいだは最後の状態を保ち、復帰後に見逃した自分の結果を出す', async () => {
  const { server, controller } = setup()
  const host = controller('host')
  await host.createAsHost(KEY, 'ホスト')
  const { transport, net } = network(server.asUser('friend'))
  let wake = () => {}
  const friend = controller('friend', transport, { onWake: next => { wake = next; return () => {} } })
  await friend.join(host.getState().snapshot!.invite, '友だち')
  // F13: ホストのほかに 2 人以上いないと始められない。
  await server.asUser('watcher').join(host.getState().snapshot!.invite, '見守り')
  await friend.setReady(true)
  await host.refresh()
  expect(host.getState()).toMatchObject({ readyOnline: 1, readyOthers: 1, canStart: true })
  await host.start()
  await vi.advanceTimersByTimeAsync(0)
  expect(friend.getState().phase).toBe('countdown')

  net.offline = true
  await vi.advanceTimersByTimeAsync(40_000)
  expect(friend.getState()).toMatchObject({ phase: 'reconnecting', canReady: false, canRename: false })
  expect(friend.getState().snapshot?.round?.results).toBeNull()

  net.offline = false
  wake()
  await vi.advanceTimersByTimeAsync(0)
  expect(friend.getState()).toMatchObject({ phase: 'results', myPrize: 'plush', balance: 2500 })
  expect(friend.getState().unseenResults).toEqual([{ roundNo: 1, prize: 'plush' }])
  friend.dismissResults()
  expect(friend.getState()).toMatchObject({ phase: 'lobby', unseenResults: [], canReady: true })

  // 確認済みを画面側で保存していれば、別の端末状態からの復帰でも再表示しない。
  const roomId = host.getState().snapshot!.id
  const reopened = controller('friend', server.asUser('friend'), { seenResults: { [roomId]: [1] } })
  await reopened.open(roomId)
  expect(reopened.getState()).toMatchObject({ phase: 'lobby', unseenResults: [] })

  // roundNo は部屋ごとに 1 から始まる。別の部屋の round 1 は確認済みにしない。
  await reopened.createAsHost(KEY, '友だち')
  for (const guest of ['a', 'b']) await server.asUser(guest).join(reopened.getState().snapshot!.invite, guest)
  await reopened.setReady(true)
  await reopened.start()
  await vi.advanceTimersByTimeAsync(9_000)
  expect(reopened.getState()).toMatchObject({ phase: 'results', unseenResults: [{ roundNo: 1, prize: 'plush' }] })
})

test('購読に失敗してもポーリングで更新し、期限切れで止まる', async () => {
  const { server, controller } = setup()
  const { transport, net } = network(server.asUser('host'))
  net.subscribeFails = true
  const host = controller('host', transport)
  await host.createAsHost(KEY, 'ホスト')
  await server.asUser('friend').join(host.getState().snapshot!.invite, '友だち')
  await vi.advanceTimersByTimeAsync(0)
  expect(host.getState().members).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(ROOM_POLL_MS)
  expect(host.getState()).toMatchObject({ phase: 'lobby', seats: { taken: 2, capacity: 100, full: false } })

  await vi.advanceTimersByTimeAsync(2 * 60 * 60_000)
  expect(host.getState().phase).toBe('unavailable')
  expect(vi.getTimerCount()).toBe(0)
})

test('退室すると最初の状態に戻り、タイマーを残さない', async () => {
  const { controller } = setup()
  const host = controller('host')
  await host.createAsHost(KEY, 'ホスト')
  expect(vi.getTimerCount()).toBeGreaterThan(0)
  expect(await host.leave()).toEqual({ ok: true, error: null })
  expect(host.getState()).toMatchObject({ phase: 'idle', roomId: null, snapshot: null })
  expect(vi.getTimerCount()).toBe(0)
})

test('予約した開始時刻まで補正した秒読みを出し、ホストが不在でも時刻になれば始まる', async () => {
  const skew = 30_000
  const { server, controller } = setup(skew)
  const host = controller('host')
  await host.createAsHost(KEY, 'ホスト')
  const friend = controller('friend')
  await friend.join(host.getState().snapshot!.invite, '友だち')
  // F13: ホストのほかに 2 人以上いないと始められない。
  await server.asUser('watcher').join(host.getState().snapshot!.invite, '見守り')
  await friend.setReady(true)
  await host.setReady(true)
  expect(host.getState()).toMatchObject({ canSchedule: true, scheduleOptions: [1, 3, 5, 10], scheduledAt: null, secondsToScheduled: null })
  expect(friend.getState()).toMatchObject({ canSchedule: false, scheduleOptions: [] })
  expect((await friend.schedule(1)).error).toEqual({ code: 'host-required', message: 'この操作はホストだけができます。' })

  expect((await host.schedule(3)).ok).toBe(true)
  expect((await host.schedule(1)).ok).toBe(true)
  await vi.advanceTimersByTimeAsync(0)
  const scheduledAt = host.getState().scheduledAt!
  expect(Date.parse(scheduledAt)).toBe(Date.now() + skew + 60_000)
  // 端末の時計が 30 秒遅れていても、サーバー時刻で数える。
  expect(friend.getState()).toMatchObject({ scheduledAt, secondsToScheduled: 60, serverOffset: skew, phase: 'ready' })

  // ホストはここで通信が途切れる（タブを閉じた）。
  host.detach()
  // ポーリングの周期を予約の時刻からずらし、予約の時刻での再取得だけで始まることを確かめる。
  await vi.advanceTimersByTimeAsync(7_000)
  await friend.refresh()
  expect(friend.getState().secondsToScheduled).toBe(53)
  await vi.advanceTimersByTimeAsync(23_000)
  expect(friend.getState().secondsToScheduled).toBe(30)
  await vi.advanceTimersByTimeAsync(29_000)
  expect(friend.getState()).toMatchObject({ secondsToScheduled: 1, phase: 'ready' })
  await vi.advanceTimersByTimeAsync(1_000)
  expect(friend.getState()).toMatchObject({ secondsToScheduled: 0, phase: 'ready' })
  expect(friend.getState().snapshot?.roundNo).toBe(0)

  // 予約の直後の再取得で、サーバーが開始する（オンラインで準備済みの人だけが対象）。
  await vi.advanceTimersByTimeAsync(250)
  expect(friend.getState()).toMatchObject({
    phase: 'countdown', secondsLeft: 8, balance: 2500, scheduledAt: null, secondsToScheduled: null,
    lastSchedule: { status: 'started', scheduledAt, roundNo: 1 }, scheduleNotice: null, roundGuaranteed: false,
  })
  expect(friend.getState().members.find(member => member.id === 'host')?.online).toBe(false)
  expect(Date.parse(friend.getState().round!.startsAt) - Date.parse(scheduledAt)).toBeGreaterThanOrEqual(8_000)
  await vi.advanceTimersByTimeAsync(8_500)
  expect(friend.getState()).toMatchObject({ phase: 'results', myPrize: 'plush' })
  expect(friend.getState().round?.results).toHaveLength(1)
  expect((await server.asUser('host').snapshot(host.getState().snapshot!.id)).balance).toBe(3000)
})

test('予約の変更・取り消し・期限の上限、時刻に誰も準備していなかった理由を出す', async () => {
  const { server, controller } = setup()
  const host = controller('host')
  await host.createAsHost(KEY, 'ホスト')
  // F13: ホストのほかに 2 人以上いないと始められない。
  for (const guest of ['a', 'b']) await server.asUser(guest).join(host.getState().snapshot!.invite, guest)
  await host.schedule(5)
  expect(host.getState().secondsToScheduled).toBe(300)
  await host.schedule(null)
  expect(host.getState()).toMatchObject({ scheduledAt: null, secondsToScheduled: null, lastSchedule: { status: 'cancelled' }, scheduleNotice: null })

  await host.schedule(1)
  await vi.advanceTimersByTimeAsync(60_250)
  expect(host.getState()).toMatchObject({
    phase: 'lobby', scheduledAt: null,
    scheduleNotice: { code: 'nobody-ready', message: '予定の時刻に準備OKの人がいなかったため、開始しませんでした。' },
  })
  // 次の予約で案内は消える。
  await host.schedule(1)
  expect(host.getState().scheduleNotice).toBeNull()
  await host.schedule(null)

  // ルームの期限（作成から 2 時間）の 1 分前を超える時間は選べない。
  await vi.advanceTimersByTimeAsync(2 * 60 * 60_000 - 60_000 - 61_000 - 5 * 60_000)
  expect(host.getState().scheduleOptions).toEqual([1, 3, 5])
  await vi.advanceTimersByTimeAsync(150_000)
  expect(host.getState().scheduleOptions).toEqual([1])
  const refused = await host.schedule(10)
  expect(refused.error).toEqual({ code: 'invalid-schedule', message: '開始の時間を選び直してください（1・3・5・10分後、ルームの期限の1分前まで）。' })
  expect(host.getState().scheduledAt).toBeNull()
})

test('ピッチモードと目玉の確定を全員の状態に出す', async () => {
  const { server, controller } = setup()
  const host = controller('host')
  await host.createAsHost(KEY, 'ホスト')
  const friend = controller('friend')
  await friend.join(host.getState().snapshot!.invite, '友だち')
  // F13: ホストのほかに 2 人以上いないと始められない。
  await server.asUser('watcher').join(host.getState().snapshot!.invite, '見守り')
  expect(friend.getState()).toMatchObject({ pitchMode: false, canSetPitchMode: false })
  expect((await friend.setPitchMode(true)).error?.code).toBe('host-required')
  expect(host.getState().canSetPitchMode).toBe(true)
  expect((await host.setPitchMode(true)).ok).toBe(true)
  await vi.advanceTimersByTimeAsync(0)
  expect(friend.getState().pitchMode).toBe(true)

  await friend.setReady(true)
  await host.start()
  await vi.advanceTimersByTimeAsync(0)
  expect(friend.getState()).toMatchObject({ phase: 'countdown', roundGuaranteed: true, myPrize: null })
  expect(friend.getState().round?.results).toBeNull()
  await vi.advanceTimersByTimeAsync(8_500)
  expect(friend.getState()).toMatchObject({ phase: 'results', roundGuaranteed: true, myPrize: 'plush' })

  await host.setPitchMode(false)
  await vi.advanceTimersByTimeAsync(0)
  expect(friend.getState()).toMatchObject({ pitchMode: false, roundGuaranteed: true })
})

test('開始できなかった案内はホストだけに出し、閉じた後と次の開始の後は出さない', async () => {
  const { server, controller } = setup()
  let keepStale = false
  let stale: Snapshot['lastSchedule'] = null
  const inner = server.asUser('host')
  // サーバーが古い結末を返し続けても、次のラウンドの後は案内を出さないことを確かめる。
  const transport: RoomTransport = {
    ...inner,
    snapshot: async room => { const next = await inner.snapshot(room); return keepStale ? { ...next, lastSchedule: stale } : next },
    start: async (room, request, expected) => { const next = await inner.start(room, request, expected); return keepStale ? { ...next, lastSchedule: stale } : next },
  }
  const host = controller('host', transport)
  await host.createAsHost(KEY, 'ホスト')
  const friend = controller('friend')
  await friend.join(host.getState().snapshot!.invite, '友だち')
  // F13: ホストのほかに 2 人以上いないと始められない。
  await server.asUser('watcher').join(host.getState().snapshot!.invite, '見守り')
  await host.schedule(1)
  await vi.advanceTimersByTimeAsync(60_250)
  expect(host.getState().scheduleNotice?.code).toBe('nobody-ready')
  await friend.refresh()
  expect(friend.getState()).toMatchObject({ lastSchedule: { status: 'nobody-ready' }, scheduleNotice: null })
  host.dismissScheduleNotice()
  expect(host.getState().scheduleNotice).toBeNull()

  await host.schedule(1)
  await vi.advanceTimersByTimeAsync(60_250)
  expect(host.getState().scheduleNotice?.code).toBe('nobody-ready')
  stale = host.getState().lastSchedule
  keepStale = true
  await friend.setReady(true)
  expect((await host.start()).ok).toBe(true)
  expect(host.getState()).toMatchObject({ phase: 'countdown', lastSchedule: { status: 'nobody-ready' }, scheduleNotice: null })
})

test('予約の時刻を過ぎた後のホストの変更は、先に予約どおり始まったことを示す', async () => {
  const { server, controller } = setup()
  const host = controller('host')
  await host.createAsHost(KEY, 'ホスト')
  const friend = controller('friend')
  await friend.join(host.getState().snapshot!.invite, '友だち')
  // F13: ホストのほかに 2 人以上いないと始められない。
  await server.asUser('watcher').join(host.getState().snapshot!.invite, '見守り')
  await friend.setReady(true)
  await host.schedule(1)
  // 誰も再取得しないうちに時刻を過ぎた（全員の画面が止まっていた）。
  host.detach()
  friend.detach()
  await vi.advanceTimersByTimeAsync(40_000)
  await friend.refresh()
  await vi.advanceTimersByTimeAsync(21_000)
  const late = await host.schedule(3)
  expect(late.error?.code).toBe('round-active')
  await vi.advanceTimersByTimeAsync(0)
  expect(host.getState()).toMatchObject({ phase: 'countdown', scheduledAt: null, lastSchedule: { status: 'started', roundNo: 1 } })
})

test('F13: ホストのほかに 2 人以上いないと始められず、あと何人必要かを全員の状態に出す', async () => {
  const { server, controller } = setup()
  const { transport, net } = network(server.asUser('host'))
  const host = controller('host', transport)
  expect(host.getState()).toMatchObject({ guestCount: 0, playersNeeded: 0 })
  await host.createAsHost(KEY, 'ホスト')
  await host.setReady(true)
  expect(host.getState()).toMatchObject({
    guestCount: 0, playersNeeded: 2, canStart: false, startBlockedBy: 'need-more-players', readyOnline: 1,
    seats: { taken: 1 },
  })
  const invite = host.getState().snapshot!.invite
  const a = controller('a')
  await a.join(invite, 'あ')
  await a.setReady(true)
  await vi.advanceTimersByTimeAsync(0)
  expect(host.getState()).toMatchObject({ guestCount: 1, playersNeeded: 1, canStart: false, startBlockedBy: 'need-more-players' })
  // 参加者にも同じ人数を出す（開始できない理由はホストでないこと）。
  expect(a.getState()).toMatchObject({ guestCount: 1, playersNeeded: 1, startBlockedBy: 'host-required' })
  // 古い状態の端末から送っても、サーバーが断る。コイン・ラウンドは変わらない。
  expect(await host.start()).toEqual({
    ok: false, error: { code: 'need-more-players', message: 'ガチャを始めるには、ホストのほかに2人以上が必要です。' },
  })
  expect(net.starts).toHaveLength(1)
  expect(host.getState()).toMatchObject({ balance: 3000, snapshot: { roundNo: 0 } })

  const b = controller('b')
  await b.join(invite, 'い')
  await vi.advanceTimersByTimeAsync(0)
  expect(host.getState()).toMatchObject({ guestCount: 2, playersNeeded: 0, canStart: true, startBlockedBy: null, seats: { taken: 3 } })
  expect(b.getState()).toMatchObject({ guestCount: 2, playersNeeded: 0 })
  // 退室した人は数えない。
  await b.leave()
  await vi.advanceTimersByTimeAsync(0)
  expect(host.getState()).toMatchObject({ guestCount: 1, playersNeeded: 1, canStart: false })
  await b.join(invite, 'い')
  await vi.advanceTimersByTimeAsync(0)
  expect((await host.start()).ok).toBe(true)
  expect(host.getState()).toMatchObject({ phase: 'countdown', balance: 2500, playersNeeded: 0 })
})

test('F13: 予約の時刻を過ぎても人数が足りなければ待ち、2 人目が入ると始まる。待つ間は 1 秒ごとに取り直さない', async () => {
  const { server, controller } = setup()
  const inner = server.asUser('host')
  const snapshots = vi.fn(inner.snapshot)
  const host = controller('host', { ...inner, snapshot: snapshots })
  await host.createAsHost(KEY, 'ホスト')
  const invite = host.getState().snapshot!.invite
  const a = controller('a')
  await a.join(invite, 'あ')
  await a.setReady(true)
  await host.setReady(true)
  await host.schedule(1)
  const scheduledAt = host.getState().scheduledAt!
  expect(host.getState()).toMatchObject({ scheduleWaiting: false, playersNeeded: 1, secondsToScheduled: 60 })

  await vi.advanceTimersByTimeAsync(60_250)
  expect(host.getState()).toMatchObject({
    phase: 'ready', scheduledAt, secondsToScheduled: 0, scheduleWaiting: true, playersNeeded: 1,
    lastSchedule: null, scheduleNotice: null, canSchedule: true,
  })
  expect(a.getState()).toMatchObject({ scheduleWaiting: true, playersNeeded: 1 })
  const polled = snapshots.mock.calls.length
  await vi.advanceTimersByTimeAsync(10_000)
  expect(snapshots.mock.calls.length - polled).toBeLessThanOrEqual(1)
  expect(host.getState().scheduleWaiting).toBe(true)

  // 2 人目が入った呼び出しで始まり、通知で全員が受け取る。
  const b = controller('b')
  await b.join(invite, 'い')
  expect(b.getState()).toMatchObject({ phase: 'countdown', scheduleWaiting: false, lastSchedule: { status: 'started', scheduledAt, roundNo: 1 } })
  await vi.advanceTimersByTimeAsync(0)
  expect(host.getState()).toMatchObject({
    phase: 'countdown', balance: 2500, scheduledAt: null, scheduleWaiting: false, playersNeeded: 0,
    lastSchedule: { status: 'started', scheduledAt, roundNo: 1 },
  })
  expect(b.getState().balance).toBe(3000)
})
