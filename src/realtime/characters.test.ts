import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test, vi } from 'vitest'
import { PITCH_CHARACTER_BUCKET, supabaseCharacterSource } from './characters'
import { PITCH_PHOTO_BUCKET } from './photos'

/** 読み込みに使う部分だけの Supabase の代役。 */
function fakeClient({ session = true, download }: { session?: boolean; download: () => Promise<{ data: Blob | null; error: Error | null }> }) {
  const from = vi.fn(() => ({ download: vi.fn(download) }))
  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session: session ? { user: { id: 'u' } } : null }, error: null })) },
    storage: { from },
  }
  return { client: client as unknown as SupabaseClient, from }
}

// 無地のダミー画像（PNG の先頭 8 バイトだけ。素材ファイルは使わない）
const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' })

describe('supabaseCharacterSource（#144 案 D 限定公開アプリのキャラクター）', () => {
  test('写真とは別の非公開バケットから、本人のセッションで Blob を読む', async () => {
    expect(PITCH_CHARACTER_BUCKET).toBe('pitch-characters')
    expect(PITCH_CHARACTER_BUCKET).not.toBe(PITCH_PHOTO_BUCKET)
    const { client, from } = fakeClient({ download: async () => ({ data: png, error: null }) })
    await expect(supabaseCharacterSource(client).load('chars/town-shop.png')).resolves.toBe(png)
    expect(from).toHaveBeenCalledWith(PITCH_CHARACTER_BUCKET)
  })

  test('セッションがなければ取りに行かない（キャラクターのためだけに匿名ログインしない）', async () => {
    const { client, from } = fakeClient({ session: false, download: async () => ({ data: png, error: null }) })
    await expect(supabaseCharacterSource(client).load('chars/town-shop.png')).resolves.toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  test('権限なし・未アップロード・空・画像でない・通信の失敗は null（何も出さない）', async () => {
    const cases: Array<() => Promise<{ data: Blob | null; error: Error | null }>> = [
      async () => ({ data: null, error: new Error('Object not found') }),
      async () => ({ data: new Blob([]), error: null }),
      async () => ({ data: new Blob(['<html>'], { type: 'text/html' }), error: null }),
      async () => { throw new Error('offline') },
    ]
    for (const download of cases) {
      const { client } = fakeClient({ download })
      await expect(supabaseCharacterSource(client).load('chars/town-shop.png')).resolves.toBeNull()
    }
  })
})
