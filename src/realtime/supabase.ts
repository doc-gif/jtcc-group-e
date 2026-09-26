import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { RoomContractError, type RoomTransport, type Snapshot } from './protocol'

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
    // name-taken carries the server's free alternative in the hint.
    if (error) throw error.message.includes('name-taken') ? new RoomContractError('name-taken', error.hint || null) : new Error(error.message)
    // Host-key failures are returned, not raised, so the failed attempt stays recorded for the rate limit.
    const failure = (data as { error?: unknown } | null)?.error
    if (typeof failure === 'string') throw new Error(failure)
    return data as Snapshot
  }
  return {
    create: (request, hostKey, name) => rpc('lp_create', { p_request: request, p_key: hostKey, p_name: name }),
    join: (invite, name) => rpc('lp_join', { p_invite: invite, p_name: name }),
    snapshot: room => rpc('lp_snapshot', { p_room: room }),
    ready: (room, ready) => rpc('lp_ready', { p_room: room, p_ready: ready }),
    start: (room, request, expected) => rpc('lp_start', { p_room: room, p_request: request, p_expected: expected }),
    schedule: (room, minutes) => rpc('lp_schedule', { p_room: room, p_minutes: minutes }),
    setPitchMode: (room, on) => rpc('lp_set_pitch_mode', { p_room: room, p_on: on }),
    resumeHost: (hostKey, room) => rpc('lp_resume_host', { p_key: hostKey, p_room: room }),
    rename: (room, name) => rpc('lp_rename', { p_room: room, p_name: name }),
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
