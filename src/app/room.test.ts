import { afterEach, describe, expect, test, vi } from 'vitest'
import { MockRoomServer } from '../realtime/mock'
import type { RoomState } from '../realtime/roomController'
import { clockText, nameProblem, remainText, roomTitle, roomView, timeOfDay, type RoomUi } from './roomView'
import {
  browserLock, createRoomSession, demoHostKey, demoTransport, forgetRecord, readRecords, ROOM_DEMO_KEY, ROOM_DEMO_USER_KEY, ROOM_DEMO_WAKE_KEY, ROOM_RECORDS_KEY,
  safeStorage, writeRecord, type KeyValue,
} from './sharedRoom'

class MemoryStorage implements KeyValue {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

afterEach(() => { vi.useRealTimers() })

function memoryKeys() {
  let key: string | null = null
  return { get: () => key, set: (next: string | null) => { key = next } }
}

const ui = (extra: Partial<RoomUi> = {}): RoomUi => ({
  inRoom: true, joinError: null, nameStep: null, autoNamed: false, watching: false, detail: null, scheduleSetup: false,
  resumed: false, watchedRounds: new Set(), hostAwayAck: false, resumeAck: false, ...extra,
})

const member = (id: string, extra: Partial<RoomState['members'][number]> = {}) => ({ id, nickname: id, ready: false, online: true, ...extra })

function stateOf(extra: Partial<RoomState> & { hostId?: string; selfId?: string } = {}): RoomState {
  const { hostId: host = 'h', selfId: self = 'g', ...rest } = extra
  const members = rest.members ?? [member('h'), member('g')]
  return {
    phase: 'lobby', roomId: 'r', snapshot: {
      id: 'r', invite: 'i', host, expiresAt: '2026-09-26T14:00:00Z', serverTime: '2026-09-26T12:00:00Z', self, balance: 3000, roundNo: 0,
      members, myResults: [], stock: null, round: null, scheduledAt: null, pitchMode: false, lastSchedule: null,
    },
    self: members.find((m) => m.id === self) ?? null, members, isHost: host === self,
    hostOnline: members.some((m) => m.id === host && m.online), hostKey: null, nameSuggestion: null, canRename: true,
    guestCount: members.length - 1, playersNeeded: 0, playersNeededMessage: null, scheduleWaiting: false, scheduleWaitingMessage: null,
    seats: { taken: members.length, capacity: 100, full: false }, readyOnline: 0, readyOthers: 0, balance: 3000,
    canReady: true, canStart: false, startBlockedBy: 'nobody-ready', secondsLeft: null, round: null, myPrize: null,
    myResults: [], unseenResults: [], scheduledAt: null, secondsToScheduled: null, scheduleOptions: [], canSchedule: true,
    pitchMode: false, canSetPitchMode: false, roundGuaranteed: false, lastSchedule: null, scheduleNotice: null, serverOffset: 0,
    busy: null, error: null, ...rest,
  }
}

describe('ルームの画面の選び方（T10 の24画面）', () => {
  test('入る前：招待・名前・満員・終了', () => {
    const outside = stateOf({ roomId: null, snapshot: null, phase: 'idle' })
    expect(roomView(outside, ui({ inRoom: false }))).toBe('invite')
    expect(roomView(outside, ui({ inRoom: false, nameStep: 'choose' }))).toBe('nameChoose')
    expect(roomView(outside, ui({ inRoom: false, nameStep: 'taken' }))).toBe('nameTaken')
    expect(roomView(outside, ui({ inRoom: false, joinError: 'room-full' }))).toBe('full')
    expect(roomView(outside, ui({ inRoom: false, joinError: 'room-unavailable' }))).toBe('expired')
  })

  test('参加者：ロビー・見守り・準備・予約・ホスト不在・名前', () => {
    expect(roomView(stateOf(), ui())).toBe('lobby')
    expect(roomView(stateOf(), ui({ watching: true }))).toBe('watching')
    expect(roomView(stateOf({ members: [member('h'), member('g', { ready: true })] }), ui())).toBe('ready')
    expect(roomView(stateOf({ scheduledAt: '2026-09-26T12:03:00Z' }), ui())).toBe('guestScheduled')
    const away = stateOf({ members: [member('h', { online: false }), member('g')] })
    expect(roomView(away, ui())).toBe('hostAway')
    expect(roomView(away, ui({ hostAwayAck: true }))).toBe('lobby')
    expect(roomView(stateOf({ members: [member('g')] }), ui())).toBe('hostAway')
    expect(roomView(stateOf(), ui({ autoNamed: true }))).toBe('nameAuto')
    expect(roomView(stateOf(), ui({ nameStep: 'choose' }))).toBe('nameChoose')
  })

  test('ホスト：開始・予約設定・予約済み・開始できず・再開', () => {
    const host = { selfId: 'h' }
    expect(roomView(stateOf(host), ui())).toBe('hostStart')
    expect(roomView(stateOf(host), ui({ scheduleSetup: true }))).toBe('hostSchedule')
    expect(roomView(stateOf({ ...host, scheduledAt: '2026-09-26T12:03:00Z' }), ui())).toBe('hostScheduled')
    expect(roomView(stateOf({ ...host, scheduleNotice: { code: 'nobody-ready', message: 'x' } }), ui())).toBe('scheduleFailed')
    expect(roomView(stateOf(host), ui({ resumed: true }))).toBe('hostResume')
    expect(roomView(stateOf(host), ui({ resumed: true, resumeAck: true }))).toBe('hostStart')
  })

  test('開封：秒読み・同時開封・結果・みんな・履歴・復帰・再接続・終了', () => {
    expect(roomView(stateOf({ phase: 'countdown' }), ui())).toBe('countdown')
    expect(roomView(stateOf({ phase: 'opening' }), ui())).toBe('opening')
    expect(roomView(stateOf({ phase: 'results' }), ui())).toBe('opening')
    expect(roomView(stateOf({ phase: 'results' }), ui({ detail: 'mine' }))).toBe('myResult')
    expect(roomView(stateOf({ phase: 'results' }), ui({ detail: 'all' }))).toBe('allResults')
    expect(roomView(stateOf({ phase: 'results' }), ui({ detail: 'history' }))).toBe('history')
    const missed = stateOf({ phase: 'results', unseenResults: [{ roundNo: 1, prize: 'badge' }] })
    expect(roomView(missed, ui({ resumed: true }))).toBe('recover')
    expect(roomView(missed, ui({ resumed: true, watchedRounds: new Set([1]) }))).toBe('opening')
    expect(roomView(stateOf({ phase: 'reconnecting' }), ui())).toBe('reconnecting')
    expect(roomView(stateOf({ phase: 'connecting', snapshot: null }), ui())).toBe('reconnecting')
    expect(roomView(stateOf({ phase: 'unavailable' }), ui())).toBe('expired')
  })

  test('時刻と呼び名', () => {
    expect(clockText(8)).toBe('00:08')
    expect(clockText(null)).toBe('00:00')
    expect(clockText(75)).toBe('01:15')
    expect(remainText(165)).toBe('2:45')
    expect(remainText(-3)).toBe('0:00')
    expect(timeOfDay(new Date(2026, 8, 26, 21, 3).toISOString())).toBe('21:03')
    expect(roomTitle(stateOf())).toBe('hさんのルーム')
    expect(roomTitle(stateOf({ selfId: 'h' }))).toBe('あなたのルーム')
    expect(roomTitle(stateOf({ members: [member('g')] }))).toBe('みんなの開封ルーム')
  })
})

describe('名前の確かめ', () => {
  test('1〜12文字（空白はまとめる）・使えない文字', () => {
    expect(nameProblem(' ')).toBe('名前を入れてください')
    expect(nameProblem('あいうえおかきくけこさしす')).toBe('名前は12文字までです')
    expect(nameProblem('もも  さん')).toBe('')
    expect(nameProblem('もも\u0007')).toBe('使えない文字が入っています')
  })
})

describe('端末内デモの transport（同じブラウザのタブだけで共有）', () => {
  test('タブごとに別の参加者。保存を読み直して同じルームに入れる。別のタブへは変化のときだけ知らせる', async () => {
    const local = new MemoryStorage()
    const tabA = new MemoryStorage()
    const tabB = new MemoryStorage()
    const host = demoTransport({ storage: local, session: tabA })
    const guest = demoTransport({ storage: local, session: tabB })
    expect(tabA.getItem(ROOM_DEMO_USER_KEY)).not.toBe(tabB.getItem(ROOM_DEMO_USER_KEY))
    const key = demoHostKey()
    expect(key).toMatch(/^[A-Za-z0-9_-]{32,128}$/)
    await expect(host.create('room-1', key, 'ミオ')).rejects.toThrow('host-key-invalid')
    host.addHostKey(key)
    const created = await host.create('room-1', key, 'ミオ')
    const woke = vi.fn()
    host.subscribe('room-1', woke)
    const joined = await guest.join(created.invite, 'ゆい')
    expect(joined.members.map((m) => m.nickname)).toEqual(['ミオ', 'ゆい'])
    await expect(guest.rename('room-1', 'ミオ')).rejects.toThrow('name-taken')
    expect((await host.snapshot('room-1')).members).toHaveLength(2)
    await Promise.resolve()
    const wakes = local.getItem(ROOM_DEMO_WAKE_KEY)
    await guest.ready('room-1', true)
    await Promise.resolve()
    expect(local.getItem(ROOM_DEMO_WAKE_KEY)).toBe(wakes)
    // snapshot だけでは知らせない（タブの間で取り直しが続かない）
    await guest.snapshot('room-1')
    await Promise.resolve()
    expect(local.getItem(ROOM_DEMO_WAKE_KEY)).toBe(wakes)
    // 同じタブの模擬サーバーで起きた変化は、このタブの画面とほかのタブへ知らせる
    await host.setPitchMode('room-1', true)
    await Promise.resolve()
    expect(woke).toHaveBeenCalled()
    expect(local.getItem(ROOM_DEMO_WAKE_KEY)).not.toBe(wakes)
    // 別のタブでも、保存したホスト用キーでホストに戻れる（端末内デモ）
    expect((await demoTransport({ storage: local, session: new MemoryStorage() }).resumeHost(key, null)).host).not.toBe(created.host)
  })

  test('オフラインなら届かない。壊れた保存データは空として読む', async () => {
    const local = new MemoryStorage()
    let online = false
    const transport = demoTransport({ storage: local, session: new MemoryStorage(), isOnline: () => online, listen: () => () => {} })
    await expect(transport.create('room-1', demoHostKey(), 'ミオ')).rejects.toThrow('offline')
    online = true
    local.setItem(ROOM_DEMO_KEY, '{not json')
    await expect(transport.snapshot('room-1')).rejects.toThrow('room-unavailable')
    local.setItem(ROOM_DEMO_KEY, JSON.stringify([{ id: 1 }, null, { members: 'x' }]))
    await expect(transport.snapshot('room-1')).rejects.toThrow('room-unavailable')
    local.setItem(ROOM_DEMO_KEY, JSON.stringify({ rooms: 'x', hostKeys: ['short', 7] }))
    await expect(transport.resumeHost('a'.repeat(32), null)).rejects.toThrow('host-key-invalid')
    // 形の合わない部屋は丸ごと捨てる（開こうとしても例外で止まらず、ルームがない扱い）
    for (const room of [
      { id: 'room-1', members: [] },
      { id: 'room-1', invite: 'i', host: 'h', expiresAt: 1, roundNo: 0, members: [{ id: 'h' }], stock: { plush: 1, pouch: 1, badge: 1 }, rounds: [] },
      { id: 'room-1', invite: 'i', host: 'h', expiresAt: 1, roundNo: 0, members: [], stock: { plush: 1 }, rounds: [] },
      { id: 'room-1', invite: 'i', host: 'h', expiresAt: 1, roundNo: 0, members: [], stock: { plush: 1, pouch: 1, badge: 1 }, rounds: [], round: { number: 1 } },
      { id: 'room-1', invite: 'i', host: 'h', expiresAt: 1, roundNo: 0, members: [], stock: { plush: 1, pouch: 1, badge: 1 }, rounds: [], lastSchedule: { status: 'x' } },
      { id: 'room-1', invite: 'i', host: 'h', expiresAt: 1, roundNo: 0, members: [], stock: { plush: 1, pouch: 1, badge: 1 }, rounds: [], scheduledAt: 'soon' },
    ]) {
      local.setItem(ROOM_DEMO_KEY, JSON.stringify({ rooms: [room] }))
      await expect(transport.snapshot('room-1')).rejects.toThrow('room-unavailable')
    }
  })

  test('端末内デモのセッションだけが、この端末をデモのホストにできる', async () => {
    const records = new MemoryStorage()
    const demo = createRoomSession(demoTransport({ storage: new MemoryStorage(), session: new MemoryStorage() }), true, records, { hostKeys: memoryKeys() })
    const key = demo.makeDemoHostKey!()
    expect(await demo.controller.createAsHost(key, 'ミオ')).toEqual({ ok: true, error: null })
    expect(demo.controller.getState()).toMatchObject({ isHost: true, hostKey: key })
    const real = createRoomSession(new MockRoomServer().asUser('u'), false, records, { hostKeys: memoryKeys() })
    expect(real.makeDemoHostKey).toBeNull()
  })

  test('タブの間の鍵の中で読み込み → 変更 → 保存する。鍵がなければこのタブの中で順に実行する', async () => {
    const local = new MemoryStorage()
    const order: string[] = []
    const lock = <T,>(run: () => Promise<T>) => { order.push('lock'); return run() }
    const transport = demoTransport({ storage: local, session: new MemoryStorage(), lock, listen: () => () => {} })
    const key = demoHostKey()
    transport.addHostKey(key)
    await transport.create('room-1', key, 'ミオ')
    await transport.snapshot('room-1')
    expect(order).toEqual(['lock', 'lock'])

    const queued = browserLock()
    const steps: string[] = []
    let release = () => {}
    const first = queued(() => new Promise<void>((resolve) => { steps.push('first'); release = resolve }))
    const second = queued(async () => { steps.push('second') })
    await Promise.resolve()
    expect(steps).toEqual(['first'])
    release()
    await Promise.all([first, second])
    expect(steps).toEqual(['first', 'second'])
    await expect(queued(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(queued(async () => 'next')).resolves.toBe('next')
  })

  test('入ったルームの記録（見守り・確認済み）と、保存できない端末', () => {
    const records = new MemoryStorage()
    writeRecord(records, 'inv', { roomId: 'r1', watching: true })
    writeRecord(records, 'inv', { roomId: 'r1', seen: [1, 2] })
    expect(readRecords(records)).toEqual({ inv: { roomId: 'r1', watching: true, seen: [1, 2], viaHostLink: false } })
    forgetRecord(records, 'none')
    forgetRecord(records, 'inv')
    expect(readRecords(records)).toEqual({})
    records.setItem(ROOM_RECORDS_KEY, '[1]')
    expect(readRecords(records)).toEqual({})
    records.setItem(ROOM_RECORDS_KEY, JSON.stringify({ a: { roomId: 3 }, b: null, c: { roomId: 'r', seen: 'x' } }))
    expect(readRecords(records)).toEqual({ c: { roomId: 'r', watching: false, seen: [], viaHostLink: false } })
    records.setItem(ROOM_RECORDS_KEY, '{')
    expect(readRecords(records)).toEqual({})

    const broken = safeStorage(() => ({ getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') } }))
    broken.setItem('k', 'v')
    expect(broken.getItem('k')).toBe('v')
    const missing = safeStorage(() => { throw new Error('SecurityError') })
    expect(missing.getItem('k')).toBeNull()
  })
})
