import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import { errorMessage, nameSuggestion, RoomContractError } from './protocol'
import { roomErrorCode } from './roomController'
import { supabaseTransport } from './supabase'

test('F13: 人数不足の開始は need-more-players のコードで状態層へ渡る', async () => {
  const rpc = vi.fn(async () => ({ data: null, error: { message: 'need-more-players' } }))
  const client = {
    auth: { getSession: async () => ({ data: { session: {} }, error: null }) },
    rpc,
  } as unknown as SupabaseClient
  const failure = await supabaseTransport(client).start('room', 'request', 0).catch((error: unknown) => error)
  expect(roomErrorCode(failure)).toBe('need-more-players')
  expect(errorMessage(failure)).toBe('ガチャを始めるには、ホストのほかに2人以上が必要です。')
  expect(rpc.mock.calls).toEqual([['lp_start', { p_room: 'room', p_request: 'request', p_expected: 0 }]])
})

test('予約とピッチモードを SQL の RPC 名と引数で呼び、失敗はコード付きのエラーにする', async () => {
  const rpc = vi.fn(async (name: string) => name === 'lp_set_pitch_mode'
    ? { data: null, error: { message: 'host-required' } }
    : { data: { id: 'room' }, error: null })
  const client = {
    auth: { getSession: async () => ({ data: { session: {} }, error: null }) },
    rpc,
  } as unknown as SupabaseClient
  const transport = supabaseTransport(client)
  expect(await transport.schedule('room', 5)).toEqual({ id: 'room' })
  expect(await transport.schedule('room', null)).toEqual({ id: 'room' })
  await expect(transport.setPitchMode('room', true)).rejects.toThrow('host-required')
  expect(rpc.mock.calls).toEqual([
    ['lp_schedule', { p_room: 'room', p_minutes: 5 }],
    ['lp_schedule', { p_room: 'room', p_minutes: null }],
    ['lp_set_pitch_mode', { p_room: 'room', p_on: true }],
  ])
})

test('ホスト用キー・名前の RPC を SQL の名前と引数で呼び、返されたキーの失敗と名前の候補をエラーにする', async () => {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'lp_create') return { data: { error: 'host-key-invalid' }, error: null }
    if (name === 'lp_rename') return { data: null, error: { message: 'name-taken', hint: 'もも2' } }
    if (name === 'lp_join' && args.p_name === 'もも') return { data: null, error: { message: 'name-taken', hint: '' } }
    return { data: { id: 'room' }, error: null }
  })
  const client = {
    auth: { getSession: async () => ({ data: { session: {} }, error: null }) },
    rpc,
  } as unknown as SupabaseClient
  const transport = supabaseTransport(client)
  await expect(transport.create('request', 'key', null)).rejects.toThrow('host-key-invalid')
  expect(await transport.resumeHost('key', null)).toEqual({ id: 'room' })
  expect(await transport.join('invite', null)).toEqual({ id: 'room' })
  const taken = await transport.rename('room', 'もも').catch((error: unknown) => error)
  expect(taken).toBeInstanceOf(RoomContractError)
  expect(nameSuggestion(taken)).toBe('もも2')
  expect(nameSuggestion(await transport.join('invite', 'もも').catch((error: unknown) => error))).toBeNull()
  expect(rpc.mock.calls).toEqual([
    ['lp_create', { p_request: 'request', p_key: 'key', p_name: null }],
    ['lp_resume_host', { p_key: 'key', p_room: null }],
    ['lp_join', { p_invite: 'invite', p_name: null }],
    ['lp_rename', { p_room: 'room', p_name: 'もも' }],
    ['lp_join', { p_invite: 'invite', p_name: 'もも' }],
  ])
  expect('claim' in transport).toBe(false)
})

test('F15: セッションがなければ匿名ログインを1回だけしてから RPC を呼ぶ。ログインに失敗したら次の操作でやり直す', async () => {
  let session: object | null = null
  let failNext = true
  const signInAnonymously = vi.fn(async () => {
    if (failNext) { failNext = false; return { data: null, error: new Error('over_request_rate_limit') } }
    session = {}
    return { data: { session }, error: null }
  })
  const rpc = vi.fn(async (_name: string) => ({ data: { id: 'room' }, error: null }))
  const client = {
    auth: { getSession: async () => ({ data: { session }, error: null }), signInAnonymously },
    rpc,
  } as unknown as SupabaseClient
  const transport = supabaseTransport(client)
  // 1回目: ログインの失敗は RPC を呼ばずにエラー（状態層は通信の失敗として再試行を案内する）
  await expect(transport.join('invite', null)).rejects.toThrow('over_request_rate_limit')
  expect(rpc).not.toHaveBeenCalled()
  // 2回目: 同時の操作でもログインは1回だけ
  await Promise.all([transport.join('invite', null), transport.snapshot('room')])
  expect(signInAnonymously).toHaveBeenCalledTimes(2)
  // 3回目: ログイン済みなら、もうログインしない
  await transport.ready('room', true)
  expect(signInAnonymously).toHaveBeenCalledTimes(2)
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(['lp_join', 'lp_snapshot', 'lp_ready'])
})

test('F15: 購読は本人の JWT を Realtime に渡してから非公開チャンネルに入り、失敗してもポーリングに任せる', async () => {
  const on = vi.fn()
  const channel = { on: (...args: unknown[]) => { on(...args); return channel }, subscribe: vi.fn(() => channel) }
  const removeChannel = vi.fn(async () => 'ok')
  const setAuth = vi.fn(async () => {})
  const makeChannel = vi.fn(() => channel)
  const client = {
    auth: { getSession: async () => ({ data: { session: {} }, error: null }) },
    realtime: { setAuth },
    channel: makeChannel,
    removeChannel,
  } as unknown as SupabaseClient
  const refresh = vi.fn()
  const stop = supabaseTransport(client).subscribe('room-1', refresh)
  await vi.waitFor(() => expect(channel.subscribe).toHaveBeenCalled())
  expect(setAuth.mock.invocationCallOrder[0]).toBeLessThan(channel.subscribe.mock.invocationCallOrder[0])
  expect(makeChannel).toHaveBeenCalledWith('lp:room-1', { config: { private: true } })
  expect(on).toHaveBeenCalledWith('broadcast', { event: 'round' }, refresh)
  stop()
  expect(removeChannel).toHaveBeenCalledWith(channel)

  // Realtime に入れなくても例外を外に出さない（ポーリングが正）
  const brokenChannel = vi.fn()
  const broken = {
    auth: { getSession: async () => ({ data: { session: {} }, error: null }) },
    realtime: { setAuth: async () => { throw new Error('realtime unavailable') } },
    channel: brokenChannel,
    removeChannel,
  } as unknown as SupabaseClient
  const stopBroken = supabaseTransport(broken).subscribe('room-1', refresh)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(brokenChannel).not.toHaveBeenCalled()
  stopBroken()
})
