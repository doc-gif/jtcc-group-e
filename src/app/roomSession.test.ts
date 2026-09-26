// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// F15: ビルドの設定（.env.production）があれば、ルームは実 Supabase の transport を使い、別のスマホとつながる。
// 設定がない・形が違う・E2E の指定（lastpiece_room_force_demo=1）のときは、この端末の中だけのデモ。
const URL_OK = 'https://example-ref.supabase.co'
const KEY_OK = 'sb_publishable_test_only_not_a_real_key'

async function freshSession() {
  vi.resetModules()
  const { defaultRoomSession } = await import('./sharedRoom')
  return defaultRoomSession()
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
afterEach(() => { vi.unstubAllEnvs() })

test('設定があれば実 Supabase のルーム（デモ表示なし・この端末をデモのホストにできない）', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', URL_OK)
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', KEY_OK)
  const session = await freshSession()
  expect(session.demo).toBe(false)
  expect(session.makeDemoHostKey).toBeNull()
  // 入ったルームの記録は端末に残す（再読み込みで同じルームへ戻る）
  expect(session.records.getItem('anything')).toBeNull()
})

test('E2E の指定があれば、設定があっても端末内デモ（実 Supabase へ通信しない）', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', URL_OK)
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', KEY_OK)
  localStorage.setItem('lastpiece_room_force_demo', '1')
  const session = await freshSession()
  expect(session.demo).toBe(true)
  expect(session.makeDemoHostKey).not.toBeNull()
})

test('設定がない・秘密の鍵の形・http の URL は使わず、端末内デモにする', async () => {
  for (const [url, key] of [['', ''], [URL_OK, 'sb_secret_should_never_be_here'], [URL_OK, 'eyJhbGciOiJIUzI1NiJ9.legacy'], ['http://example-ref.supabase.co', KEY_OK]]) {
    vi.stubEnv('VITE_SUPABASE_URL', url)
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', key)
    const session = await freshSession()
    expect(session.demo, `${url} ${key}`).toBe(true)
  }
})
