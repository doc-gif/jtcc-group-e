import { useEffect, useState } from 'react'
import type { PhotoSource } from '../realtime/photos'
import type { SharedPrize } from '../realtime/protocol'

/**
 * ルームの賞品と、ピッチ用の実物グッズ写真（F15）の対応。写真そのものはリポジトリに置かない。
 * 担当者が非公開バケット `pitch-goods` の `path` に、素材ライブラリの原画像をアップロードする（手順と素材の対応は
 * docs/PITCH_PHOTOS.md。plush は L001、pouch は L015、badge は L011）。`credit` はライブラリのカードに記録された権利表記。
 * 素材の ID はビルドに入れない（確認用プレビューの成果物に内部素材 ID を残さない、docs/PREVIEW.md）。
 * 担当者の許可（2026-09-26）はピッチと関係者だけが対象。ルームの中だけで、Supabase の本物の通信経路のときだけ読む。
 */
export interface PitchPhoto {
  /** バケットの中のオブジェクト名。 */
  path: string
  /** ライブラリのカードの権利表記。 */
  credit: string
}

const SANRIO_2024 = '© 2024 SANRIO CO., LTD. TOKYO, JAPAN 著作 株式会社サンリオ'
const SANRIO_2025 = '© 2025 SANRIO CO., LTD. TOKYO, JAPAN 著作 株式会社サンリオ'

export const PITCH_PHOTOS: Readonly<Record<SharedPrize, PitchPhoto>> = {
  plush: { path: 'goods/plush.jpg', credit: SANRIO_2024 },
  pouch: { path: 'goods/pouch.jpg', credit: SANRIO_2025 },
  badge: { path: 'goods/badge.jpg', credit: SANRIO_2024 },
}

/** 写真の近くに出す権利表記の1行。 */
export const photoCreditLine = (prize: SharedPrize) => `写真: ${PITCH_PHOTOS[prize].credit}`

/** 画面に出す写真（読み込めたときだけ）。alt は賞品の名前。 */
export interface ShownPhoto { url: string; credit: string }

/**
 * ルームの中で、賞品の写真を1枚読み込む。読めないとき・取得元がないとき・enabled が false のときは null（元の絵を出す）。
 * 賞品が変わる・ルームを離れる・画面が閉じると、作った object URL を取り消す。失敗しても再試行しない（元の絵のまま）。
 */
export function usePitchPhoto(source: PhotoSource | null, prize: SharedPrize | null, enabled: boolean): ShownPhoto | null {
  const [shown, setShown] = useState<{ prize: SharedPrize; url: string } | null>(null)
  const active = enabled && source !== null && prize !== null
  useEffect(() => {
    if (!active || !source || !prize) return
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
    let cancelled = false
    let url: string | null = null
    void source.load(PITCH_PHOTOS[prize].path).then((blob) => {
      if (cancelled || !blob) return
      try { url = URL.createObjectURL(blob) } catch { url = null }
      if (url) setShown({ prize, url })
    }, () => { /* 元の絵のまま */ })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
      setShown(null)
    }
  }, [active, source, prize])
  if (!active || !shown || shown.prize !== prize) return null
  return { url: shown.url, credit: photoCreditLine(prize) }
}
