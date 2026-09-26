import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * ピッチ用の実物グッズ写真の置き場所（F15）。Supabase Storage の非公開バケット。
 * 読めるのは、開いているルームの active メンバー（またはホスト）の匿名ログインの本人だけ（storage.objects の RLS）。
 * 写真はリポジトリ・public/・ビルドに入れない。アップロードは担当者が Dashboard から行う（docs/PITCH_PHOTOS.md）。
 */
export const PITCH_PHOTO_BUCKET = 'pitch-goods'

/** 写真の取得元。なし・権限なし・通信失敗は null（画面は元の絵のまま）。 */
export interface PhotoSource {
  load(path: string): Promise<Blob | null>
}

/**
 * 本人のセッション（ルームの transport が匿名ログインしたもの）で非公開バケット `bucket` から読む。
 * セッションがなければ読まない（ここでは匿名ログインしない。ルームに入る前に画像を取りに行かない）。
 * 公開 URL・署名付き URL は作らない（URL を共有されても読めないように、本人の認証つきで Blob を受け取る）。
 * 写真（F15）とキャラクター（#144 案 D、src/realtime/characters.ts）で共通。
 */
export function privateImageSource(client: SupabaseClient, bucket: string): PhotoSource {
  return {
    async load(path) {
      try {
        const { data: auth, error: authError } = await client.auth.getSession()
        if (authError || !auth.session) return null
        const { data, error } = await client.storage.from(bucket).download(path)
        if (error || !data || data.size === 0) return null
        if (data.type && !data.type.startsWith('image/')) return null
        return data
      } catch {
        return null
      }
    },
  }
}

/** ピッチ用の実物グッズ写真（F15）の取得元。 */
export function supabasePhotoSource(client: SupabaseClient): PhotoSource {
  return privateImageSource(client, PITCH_PHOTO_BUCKET)
}
