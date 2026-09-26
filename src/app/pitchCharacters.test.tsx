// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CharacterArt } from '../components/CharacterArt'
import { MockRoomServer } from '../realtime/mock'
import type { PhotoSource } from '../realtime/photos'
import { CHARACTER_SLOTS, CharacterProvider, useCharacter, type CharacterSlot } from './pitchCharacters'
import { createRoomSession, writeRecord, type KeyValue, type RoomSession } from './sharedRoom'

class MemoryStorage implements KeyValue {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

const HOST_KEY = 'k'.repeat(40)
const SLOTS = Object.keys(CHARACTER_SLOTS) as CharacterSlot[]

// 無地のダミー画像（PNG の先頭 8 バイトだけ。素材ファイルは使わない）
const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' })

let server: MockRoomServer
let created: string[]
let revoked: string[]

beforeEach(() => {
  let invites = 0
  server = new MockRoomServer(() => Date.now(), () => `invite-${++invites}`, () => 0)
  server.addHostKey(HOST_KEY)
  created = []
  revoked = []
  let n = 0
  Object.assign(URL, {
    createObjectURL: vi.fn(() => { const url = `blob:char-${++n}`; created.push(url); return url }),
    revokeObjectURL: vi.fn((url: string) => { revoked.push(url) }),
  })
})

afterEach(() => { cleanup() })

/** Supabase につないだ（demo = false）端末。key はこの端末に保存したホスト用キー。 */
function session({ source, key = null, records = new MemoryStorage(), demo = false }: { source: PhotoSource | null; key?: string | null; records?: KeyValue; demo?: boolean }): RoomSession {
  let stored = key
  const transport = Object.assign(server.asUser('me'), { addHostKey: (value: string) => server.addHostKey(value) })
  return createRoomSession(transport, demo, records, {
    onWake: () => () => {},
    hostKeys: { get: () => stored, set: (next) => { stored = next } },
  }, null, source)
}

/** useCharacter の結果を文字で見せる。 */
function SlotUrl({ slot }: { slot: CharacterSlot }) {
  return <li data-testid={slot}>{useCharacter(slot) ?? ''}</li>
}

function Probe() {
  return <ul>{SLOTS.map(slot => <SlotUrl key={slot} slot={slot} />)}</ul>
}

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

function mount(room: RoomSession) {
  return render(<CharacterProvider session={room}><Probe /><CharacterArt slot="townShop" size={72} className="town-shop-char" /></CharacterProvider>)
}

describe('CharacterProvider / useCharacter（#144 案 D）', () => {
  test('ルームの記録もホスト用キーも無い端末は取りに行かず、CharacterArt は何も描かない', async () => {
    const load = vi.fn(async () => png())
    const { container } = mount(session({ source: { load } }))
    await flush()
    expect(load).not.toHaveBeenCalled()
    expect(screen.getByTestId('townShop')).toHaveTextContent('')
    expect(container.querySelector('img')).toBeNull()
  })

  test('ホスト用キーがあれば 7 か所を 1 回ずつ読み、URL を返す。外れると取り消す', async () => {
    const load = vi.fn(async (_path: string) => png())
    const view = mount(session({ source: { load }, key: HOST_KEY }))
    await flush()
    expect(load).toHaveBeenCalledTimes(SLOTS.length)
    expect(load.mock.calls.map(([path]) => path).sort()).toEqual(Object.values(CHARACTER_SLOTS).sort())
    for (const slot of SLOTS) expect(screen.getByTestId(slot).textContent).toMatch(/^blob:char-\d+$/)
    const art = view.container.querySelector('img')!
    expect(art).toHaveAttribute('src', screen.getByTestId('townShop').textContent)
    expect(art).toHaveAttribute('alt', '')
    expect(art).toHaveAttribute('aria-hidden', 'true')
    expect(art).toHaveAttribute('draggable', 'false')
    expect(art).toHaveAttribute('width', '72')
    expect(art).toHaveClass('char-art', 'town-shop-char')
    expect(art).not.toHaveClass('is-loaded')
    fireEvent.load(art)
    expect(art).toHaveClass('is-loaded')
    view.unmount()
    expect(revoked.sort()).toEqual(created.sort())
  })

  test('入ったルームの記録があれば読む', async () => {
    const records = new MemoryStorage()
    writeRecord(records, 'invite-9', { roomId: 'room-9' })
    const load = vi.fn(async () => png())
    mount(session({ source: { load }, records }))
    await flush()
    expect(load).toHaveBeenCalledTimes(SLOTS.length)
  })

  test('読めなかった場所だけ、ルームに入ったときに 1 回だけ取り直す', async () => {
    let calls = 0
    // 最初の 1 回はどれも読めない（セッションがまだ無いなど）
    const load = vi.fn(async () => (++calls <= SLOTS.length ? null : png()))
    const room = session({ source: { load }, key: HOST_KEY })
    const view = mount(room)
    await flush()
    expect(load).toHaveBeenCalledTimes(SLOTS.length)
    expect(view.container.querySelector('img')).toBeNull()
    await act(async () => { await room.controller.createAsHost(HOST_KEY, 'ミオ') })
    await flush()
    expect(load).toHaveBeenCalledTimes(SLOTS.length * 2)
    expect(view.container.querySelector('img')).not.toBeNull()
    // 3 回目は無い（出入りをくり返しても読み直さない）
    await act(async () => { await room.controller.leave() })
    await act(async () => { await room.controller.createAsHost(HOST_KEY, 'ミオ') })
    await flush()
    expect(load).toHaveBeenCalledTimes(SLOTS.length * 2)
  })

  test('参加者がルームを出て記録が消えたら絵を捨て、また入れば読み直す', async () => {
    const records = new MemoryStorage()
    const load = vi.fn(async () => png())
    const room = session({ source: { load }, records })
    const view = mount(room)
    await flush()
    expect(load).not.toHaveBeenCalled()
    // 別の人がホストのルームに、招待で入る
    const host = server.asUser('host')
    const { invite } = await host.create('request-1', HOST_KEY, 'ミオ')
    await act(async () => { await room.controller.join(invite, 'ゆい') })
    writeRecord(records, invite, { roomId: room.controller.getState().roomId! })
    await flush()
    expect(load).toHaveBeenCalledTimes(SLOTS.length)
    expect(view.container.querySelector('img')).not.toBeNull()
    // 退室して、画面が記録を消す
    await act(async () => { await room.controller.leave() })
    records.data.clear()
    await act(async () => { window.dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(view.container.querySelector('img')).toBeNull()
    expect(revoked.sort()).toEqual(created.sort())
    // もう一度入れば読み直す
    await act(async () => { await room.controller.join(invite, 'ゆい') })
    await flush()
    expect(load).toHaveBeenCalledTimes(SLOTS.length * 2)
    expect(view.container.querySelector('img')).not.toBeNull()
  })

  test('端末内の模擬ルームでは取得元を渡されても読まない', async () => {
    const load = vi.fn(async () => png())
    const room = session({ source: { load }, key: HOST_KEY, demo: true })
    expect(room.characters).toBeNull()
    mount(room)
    await flush()
    expect(load).not.toHaveBeenCalled()
  })

  test('表示できない（壊れた画像）ときは何も描かない', async () => {
    const view = mount(session({ source: { load: async () => png() }, key: HOST_KEY }))
    await flush()
    const art = view.container.querySelector('img')!
    fireEvent.error(art)
    expect(view.container.querySelector('img')).toBeNull()
  })

  test('取得元が例外を投げても何も描かない', async () => {
    const view = mount(session({ source: { load: async () => { throw new Error('offline') } }, key: HOST_KEY }))
    await flush()
    expect(view.container.querySelector('img')).toBeNull()
    expect(created).toHaveLength(0)
  })
})
