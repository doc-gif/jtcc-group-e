import type { SupabaseClient } from '@supabase/supabase-js'
import { privateImageSource, type PhotoSource } from './photos'

/**
 * 限定公開アプリだけで出すキャラクターの絵の置き場所（#144 案 D）。Supabase Storage の非公開バケット。
 * 読めるのは、開いているルームのホストか active な参加者の匿名ログインの本人だけ（storage.objects の RLS、#150）。
 * 絵はリポジトリ・public/・ビルドに入れない（scripts/check-dist.mjs が成果物を検査する）。
 * アップロードは担当者が Dashboard から行う（docs/PITCH_CHARACTERS.md）。
 */
export const PITCH_CHARACTER_BUCKET = 'pitch-characters'

/**
 * 本人のセッションで非公開バケットからキャラクターの絵を読む。写真（F15）と同じ規則:
 * セッションがなければ読まない（キャラクターのためだけに匿名ログインしない）、公開 URL・署名付き URL は作らない、
 * 権限なし・未アップロード・空・画像でない・通信の失敗は null（何も出さない）。
 */
export function supabaseCharacterSource(client: SupabaseClient): PhotoSource {
  return privateImageSource(client, PITCH_CHARACTER_BUCKET)
}
