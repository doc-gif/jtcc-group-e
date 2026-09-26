import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
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
