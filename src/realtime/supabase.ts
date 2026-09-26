import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { RoomTransport, Snapshot } from './protocol'

export function supabaseTransport(client: SupabaseClient): RoomTransport {
  let auth: Promise<void> | undefined
  const authenticate = () => auth ??= (async () => {
    const { data, error } = await client.auth.getSession()
    if (error) throw error
    if (!data.session) {
      const result = await client.auth.signInAnonymously()
      if (result.error) throw result.error
    }
  })().catch(error => { auth = undefined; throw error })
  const rpc = async (name: string, args: Record<string, unknown>) => {
    await authenticate()
    const { data, error } = await client.rpc(name, args)
    if (error) throw new Error(error.message)
    return data as Snapshot
  }
  return {
    create: (request, name) => rpc('lp_create', { p_request: request, p_name: name }),
    join: (invite, name) => rpc('lp_join', { p_invite: invite, p_name: name }),
    snapshot: room => rpc('lp_snapshot', { p_room: room }),
    ready: (room, ready) => rpc('lp_ready', { p_room: room, p_ready: ready }),
    start: (room, request, expected) => rpc('lp_start', { p_room: room, p_request: request, p_expected: expected }),
    schedule: (room, minutes) => rpc('lp_schedule', { p_room: room, p_minutes: minutes }),
    setPitchMode: (room, on) => rpc('lp_set_pitch_mode', { p_room: room, p_on: on }),
    claim: room => rpc('lp_claim_host', { p_room: room }),
    leave: async room => { await rpc('lp_leave', { p_room: room }) },
    subscribe: (room, refresh) => {
      // Broadcast is an optional wake-up hint. Auth and every result still come from RPC snapshots.
      let disposed = false
      let channel: ReturnType<SupabaseClient['channel']> | null = null
      void authenticate().then(async () => {
        await client.realtime.setAuth()
        if (disposed) return
        channel = client.channel(`lp:${room}`, { config: { private: true } })
          .on('broadcast', { event: 'round' }, refresh).subscribe()
      }).catch(() => { /* Polling remains authoritative if Realtime is unavailable. */ })
      return () => { disposed = true; if (channel) void client.removeChannel(channel) }
    },
  }
}
let instance: RoomTransport | null | undefined
export function configuredTransport(): RoomTransport | null {
  if (instance !== undefined) return instance
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return instance = null
  if (!url.startsWith('https://') || !key.startsWith('sb_publishable_')) return instance = null
  // Anonymous identity stays in this browser. No service-role key, no cross-device handover.
  return instance = supabaseTransport(createClient(url, key, {
    auth: { storageKey: `lastpiece_guest_${new URL(url).hostname}_${location.pathname}`, detectSessionInUrl: false },
  }))
}
