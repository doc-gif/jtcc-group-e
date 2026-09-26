import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { RoomContractError, type LiveStatus, type RoomTransport, type Snapshot } from './protocol'

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
  /** The signed-in user's current JWT (read after sign-in, so a refreshed token is used, not a cached one). */
  const accessToken = async () => {
    await authenticate()
    const { data, error } = await client.auth.getSession()
    const token = data.session?.access_token
    if (error || !token) throw error ?? new Error('auth-required')
    return token
  }
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
    open: (room, roundNo) => rpc('lp_open', { p_room: room, p_round: roundNo }),
    leave: async room => { await rpc('lp_leave', { p_room: room }) },
    subscribe: (room, refresh, onStatus) => {
      // Broadcast is an optional wake-up hint. Auth and every result still come from RPC snapshots.
      // Channel and event match lp_wake: private topic lp:<roomId>, event 'round'.
      let disposed = false
      let channel: ReturnType<SupabaseClient['channel']> | null = null
      const report = (status: LiveStatus) => { if (!disposed) onStatus?.(status) }
      void accessToken().then(async token => {
        // Private channels authorize with the user's JWT (Realtime RLS), never with the publishable key.
        await client.realtime.setAuth(token)
        if (disposed) return
        channel = client.channel(`lp:${room}`, { config: { private: true } })
          .on('broadcast', { event: 'round' }, refresh)
          .subscribe(status => {
            // supabase-js rejoins by itself after an error; each SUBSCRIBED reports live again.
            if (status === 'SUBSCRIBED') report('live')
            else report('down')
          })
      }).catch(() => { report('down') /* Polling remains authoritative if Realtime is unavailable. */ })
      return () => { disposed = true; if (channel) void client.removeChannel(channel) }
    },
  }
}
let client: SupabaseClient | null | undefined
let instance: RoomTransport | null | undefined

/**
 * ビルドの設定（`.env.production` の `VITE_SUPABASE_URL`・`VITE_SUPABASE_PUBLISHABLE_KEY`、どちらもブラウザに公開してよい値）から
 * 作る Supabase の接続。設定がない・形が違うビルド（開発・単体テスト）は null で、ルームは端末内デモになる。
 */
export function configuredClient(): SupabaseClient | null {
  if (client !== undefined) return client
  const config = supabaseConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  if (!config) return client = null
  try {
    // Anonymous identity stays in this browser. No service-role key, no cross-device handover.
    return client = createClient(config.url, config.key, {
      auth: { storageKey: `lastpiece_guest_${config.host}_${location.pathname}`, detectSessionInUrl: false },
    })
  } catch {
    return client = null
  }
}

const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{16,}$/

/**
 * ビルドの設定の形を確かめる。URL は `https://<ホスト>` だけ（パス・資格情報・クエリなし）、キーは publishable の形だけ。
 * 形が違えば null（ルームは端末内デモ。壊れた設定で画面を落とさない）。
 */
export function supabaseConfig(url: unknown, key: unknown): { url: string; key: string; host: string } | null {
  if (typeof url !== 'string' || typeof key !== 'string' || !PUBLISHABLE_KEY.test(key)) return null
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.port) return null
  if (parsed.pathname !== '/' || parsed.search || parsed.hash || url.replace(/\/$/, '') !== parsed.origin) return null
  return { url: parsed.origin, key, host: parsed.hostname }
}

export function configuredTransport(): RoomTransport | null {
  if (instance !== undefined) return instance
  const real = configuredClient()
  return instance = real ? supabaseTransport(real) : null
}
