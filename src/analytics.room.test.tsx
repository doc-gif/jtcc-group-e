// @vitest-environment jsdom
// 計測（#44）: 共有ルームの room_create / room_join / room_ready / round_start / result_view を、
// track を差し替えて確認する。送る値は人数・回数・真偽値だけで、名前・招待コード・ホストキー・賞品名を含まない。
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import { track } from './app/analytics'
import { createAssetGate } from './app/assets'
import { createRoomSession, type KeyValue, type RoomSession } from './app/sharedRoom'
import { MockRoomServer } from './realtime/mock'
import { SHARED_START_DELAY_MS } from './realtime/protocol'
import { ROOM_POLL_MS } from './realtime/roomController'

vi.mock('./app/analytics')

class MemoryStorage implements KeyValue {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

const START = Date.parse('2026-09-26T12:00:00Z')
const HOST_KEY = 'k'.repeat(40)
const readyAssets = createAssetGate([])
let server: MockRoomServer
let ids = 0

function sessionFor(user: string): RoomSession {
  const transport = Object.assign(server.asUser(user), { addHostKey: (key: string) => server.addHostKey(key) })
  return createRoomSession(transport, true, new MemoryStorage(), { requestId: () => `request-${++ids}`, onWake: () => () => {} })
}

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const heading = () => screen.getByRole('heading', { level: 1 })
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const events = () => vi.mocked(track).mock.calls.map(([event]) => event)
const eventsNamed = (name: string) => vi.mocked(track).mock.calls.filter(([event]) => event === name)

async function click(name: string | RegExp) {
  await act(async () => { fireEvent.click(button(name)) })
  await flush()
}

function open(hash: string, session: RoomSession) {
  window.location.hash = hash
  return render(<App storage={new MemoryStorage()} assets={readyAssets} roomSession={session} />)
}

async function hostRoom(name = 'ミオ') {
  const host = sessionFor('host')
  host.controller.attach()
  await host.controller.createAsHost(HOST_KEY, name)
  return { host, invite: host.controller.getState().snapshot!.invite }
}

async function addGuests(invite: string, names: string[]) {
  for (const name of names) await server.asUser(`guest-${name}`).join(invite, name)
}

async function joinAs(name: string) {
  await click('ルームに入る')
  fireEvent.change(screen.getByLabelText('表示する名前'), { target: { value: name } })
  await click('この名前で入る')
}

/** 送った値のどこにも、名前・招待コード・ホストキー・賞品名（内部名・表示名）が入っていない。 */
function expectNoPersonalData(names: string[]) {
  const sent = JSON.stringify(vi.mocked(track).mock.calls)
  for (const forbidden of [...names, 'invite-', HOST_KEY, 'plush', 'pouch', 'badge', 'マスコット', 'ポーチ', '缶バッジ', 'request-']) {
    expect(sent).not.toContain(forbidden)
  }
}

beforeEach(() => {
  vi.useFakeTimers({ now: START })
  vi.mocked(track).mockClear()
  ids = 0
  let invites = 0
  server = new MockRoomServer(() => Date.now(), () => `invite-${++invites}`, () => 0)
  server.addHostKey(HOST_KEY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.location.hash = ''
})

describe('room_create / room_ready（ホスト）', () => {
  test('ルームを作ると room_create（scheduled=false）。ホスト以外に 2 人そろった時点で room_ready を 1 回だけ送る', async () => {
    const session = sessionFor('host')
    open('#/room/new', session)
    fireEvent.change(screen.getByLabelText('表示する名前'), { target: { value: 'ミオ' } })
    await click('ルームを作る')
    expect(window.location.hash).toBe('#/room/invite-1')
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('room_create', { scheduled: false })
    await act(async () => { window.dispatchEvent(new HashChangeEvent('hashchange')) })
    await flush()
    expect(heading()).toHaveTextContent('あと2人で始められます')
    // ホスト 1 人・参加者 1 人ではまだ送らない
    await addGuests('invite-1', ['ゆい'])
    await advance(ROOM_POLL_MS)
    expect(heading()).toHaveTextContent('あと1人で始められます')
    expect(events()).toEqual(['room_create'])
    // 2 人目で「開始できる状態」。人数はホストを含む集まっている人数
    await addGuests('invite-1', ['さき'])
    await advance(ROOM_POLL_MS)
    expect(heading()).toHaveTextContent('開封の準備ができたよ')
    expect(track).toHaveBeenCalledWith('room_ready', { members: 3 })
    // 再描画・再取得・3 人目の入室でも room_ready は増えない
    await addGuests('invite-1', ['はな'])
    await advance(ROOM_POLL_MS * 2)
    fireEvent.click(screen.getByRole('switch', { name: 'わたしも抽選に参加する' }))
    await flush()
    expect(eventsNamed('room_ready')).toHaveLength(1)
    expect(events()).toEqual(['room_create', 'room_ready'])
    expectNoPersonalData(['ミオ', 'ゆい', 'さき', 'はな'])
  })
})

describe('room_join（参加者）', () => {
  test('招待リンクから入ると room_join（via=invite、watching=false）。名前の変更では送らない', async () => {
    const { invite } = await hostRoom('もも')
    const guest = sessionFor('guest')
    open(`#/room/${invite}`, guest)
    expect(heading()).toHaveTextContent('ルームへの招待')
    expect(track).not.toHaveBeenCalled()
    // 名前が使われていて候補で入り直しても、成功した入室の 1 回だけ
    await joinAs('もも')
    expect(screen.getByText('その名前は使われています')).toBeVisible()
    expect(track).not.toHaveBeenCalled()
    await click('「もも2」で入る')
    expect(heading()).toHaveTextContent('みんなの開封ルーム')
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('room_join', { via: 'invite', watching: false })
    await click('名前を変える')
    fireEvent.change(screen.getByLabelText('表示する名前'), { target: { value: 'さくら' } })
    await click('この名前にする')
    expect(heading()).toHaveTextContent('みんなの開封ルーム')
    expect(events()).toEqual(['room_join'])
    expectNoPersonalData(['もも', 'さくら'])
  })

  test('満員で入れなかったときは送らない', async () => {
    const { invite } = await hostRoom()
    for (let i = 0; i < 99; i += 1) await server.asUser(`member-${i}`).join(invite, `人${i}`)
    const guest = sessionFor('guest')
    open(`#/room/${invite}`, guest)
    await joinAs('ゆい')
    expect(heading()).toHaveTextContent('ただいま満員です')
    expect(track).not.toHaveBeenCalled()
  })
})

describe('round_start / result_view', () => {
  test('秒読みで round_start、結果の公開で result_view（同じ賞品が 2 人以上なら osoroi=true）。回ごとに 1 回ずつ', async () => {
    const session = sessionFor('host')
    await session.controller.createAsHost(HOST_KEY, 'ミオ')
    open('#/room/invite-1', session)
    await flush()
    const guest = sessionFor('guest')
    await guest.controller.join('invite-1', 'ゆい')
    await guest.controller.setReady(true)
    await addGuests('invite-1', ['さき'])
    await advance(ROOM_POLL_MS)
    fireEvent.click(screen.getByRole('switch', { name: 'わたしも抽選に参加する' }))
    await flush()
    expect(events()).toEqual(['room_ready'])

    await click('開封をはじめる')
    expect(heading()).toHaveTextContent('もうすぐ開封！')
    expect(track).toHaveBeenCalledWith('round_start', { members: 3, round: 1 })
    // 秒読みの間の再描画では増えず、公開前に result_view は送らない
    await advance(3_000)
    expect(events()).toEqual(['room_ready', 'round_start'])
    // 公開（取り直しの余裕を含めて待つ）: 乱数が固定（0）なので 2 人の賞品は同じ → osoroi=true
    await advance(SHARED_START_DELAY_MS + 1_000)
    expect(heading()).toHaveTextContent('せーので、ひらこう！')
    expect(button('結果を見る')).toBeEnabled()
    expect(track).toHaveBeenCalledWith('result_view', { members: 3, osoroi: true })
    await click('結果を見る')
    await click('みんなの結果を見る')
    await click('ルームへ戻る')
    expect(eventsNamed('result_view')).toHaveLength(1)
    expect(eventsNamed('round_start')).toHaveLength(1)

    // 2 回目: 待ち時間が明けてから開始すると round=2 で送る
    await advance(60_000)
    fireEvent.click(screen.getByRole('switch', { name: 'わたしも抽選に参加する' }))
    await flush()
    await guest.controller.setReady(true)
    await advance(ROOM_POLL_MS)
    await click('開封をはじめる')
    expect(heading()).toHaveTextContent('もうすぐ開封！')
    expect(track).toHaveBeenCalledWith('round_start', { members: 3, round: 2 })
    await advance(SHARED_START_DELAY_MS + 1_000)
    expect(heading()).toHaveTextContent('せーので、ひらこう！')
    expect(eventsNamed('result_view')).toHaveLength(2)
    expect(eventsNamed('round_start')).toHaveLength(2)
    expect(eventsNamed('room_ready')).toHaveLength(1)
    expectNoPersonalData(['ミオ', 'ゆい', 'さき'])
  })

  test('参加者の画面でも round_start と result_view を送る。参加者が 1 人だけなら osoroi=false', async () => {
    const { host, invite } = await hostRoom('ミオ')
    const guest = sessionFor('guest')
    open(`#/room/${invite}`, guest)
    await joinAs('ゆい')
    expect(events()).toEqual(['room_join'])
    await addGuests(invite, ['さき'])
    await advance(ROOM_POLL_MS)
    expect(track).toHaveBeenCalledWith('room_ready', { members: 3 })
    await click('抽選に参加する')
    expect(heading()).toHaveTextContent('準備できたよ')
    await host.controller.start()
    // 参加者の端末はポーリング（15 秒）を待たず、いま取り直したとみなす
    await act(async () => { await guest.controller.refresh() })
    await flush()
    expect(heading()).toHaveTextContent('もうすぐ開封！')
    expect(track).toHaveBeenCalledWith('round_start', { members: 3, round: 1 })
    await advance(SHARED_START_DELAY_MS + 1_000)
    expect(heading()).toHaveTextContent('せーので、ひらこう！')
    expect(button('結果を見る')).toBeEnabled()
    expect(track).toHaveBeenCalledWith('result_view', { members: 3, osoroi: false })
    expect(events()).toEqual(['room_join', 'room_ready', 'round_start', 'result_view'])
    expectNoPersonalData(['ミオ', 'ゆい', 'さき'])
  })
})
