import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import { nameSuggestion, RoomContractError } from './protocol'
import { supabaseTransport } from './supabase'

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
