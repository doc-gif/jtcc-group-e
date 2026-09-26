import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test, vi } from 'vitest'
import { PITCH_PHOTO_BUCKET, supabasePhotoSource } from './photos'

/** 写真の読み込みに使う部分だけの Supabase の代役。 */
function fakeClient({ session = true, download }: { session?: boolean; download: () => Promise<{ data: Blob | null; error: Error | null }> }) {
  const from = vi.fn(() => ({ download: vi.fn(download) }))
  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session: session ? { user: { id: 'u' } } : null }, error: null })) },
    storage: { from },
  }
  return { client: client as unknown as SupabaseClient, from }
}

const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })

describe('supabasePhotoSource（F15 ピッチ用の実物グッズ写真）', () => {
  test('本人のセッションで非公開バケットから Blob を読む', async () => {
    const { client, from } = fakeClient({ download: async () => ({ data: jpeg, error: null }) })
    await expect(supabasePhotoSource(client).load('goods/plush.jpg')).resolves.toBe(jpeg)
    expect(from).toHaveBeenCalledWith(PITCH_PHOTO_BUCKET)
  })

  test('セッションがなければ取りに行かない（ここでは匿名ログインしない）', async () => {
    const { client, from } = fakeClient({ session: false, download: async () => ({ data: jpeg, error: null }) })
    await expect(supabasePhotoSource(client).load('goods/plush.jpg')).resolves.toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  test('権限なし・未アップロード・空・画像でない・通信の失敗は null（元の絵のまま）', async () => {
    const cases: Array<() => Promise<{ data: Blob | null; error: Error | null }>> = [
      async () => ({ data: null, error: new Error('Object not found') }),
      async () => ({ data: new Blob([]), error: null }),
      async () => ({ data: new Blob(['<html>'], { type: 'text/html' }), error: null }),
      async () => { throw new Error('offline') },
    ]
    for (const download of cases) {
      const { client } = fakeClient({ download })
      await expect(supabasePhotoSource(client).load('goods/plush.jpg')).resolves.toBeNull()
    }
  })
})
