import { useState } from 'react'
import { useCharacter, type CharacterSlot } from '../app/pitchCharacters'
import './characterArt.css'

/**
 * 限定公開アプリのキャラクターの絵（#144 案 D）。飾りなので読み上げ・タップの対象にしない。
 * 絵が読めていない・表示できないときは何も描かない（枠・空の箱も出さない）。
 * 位置は呼び出し側の className で決める（`.char-art` は position: absolute なので、出ても出なくても配置は変わらない）。
 */
export function CharacterArt({ slot, size, className }: { slot: CharacterSlot; size?: number; className?: string }) {
  const url = useCharacter(slot)
  const [state, setState] = useState<{ url: string; status: 'loaded' | 'failed' } | null>(null)
  if (!url) return null
  const status = state?.url === url ? state.status : 'loading'
  if (status === 'failed') return null
  return (
    <img
      className={['char-art', status === 'loaded' ? 'is-loaded' : '', className ?? ''].filter(Boolean).join(' ')}
      src={url}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      width={size}
      height={size}
      data-slot={slot}
      onLoad={() => setState({ url, status: 'loaded' })}
      onError={() => setState({ url, status: 'failed' })}
    />
  )
}
