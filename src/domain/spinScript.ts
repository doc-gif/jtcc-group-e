import { pipiLines } from '../copy/pipi'
import type { Glow } from './types'

export const TURNS = 3
/** 演出の待ち時間（ミリ秒）。 */
export const TIMING = { drop: 900, open: 450, friendReveal: 900, friendTick: 120, bubble: 1800, roomStep: 700, banner: 2400, chip: 1300 }

export interface TurnEffect {
  /** 案内役ピピのひとこと */
  pipi: string
  /** 画面中央に一瞬出ることば */
  chip: string
  /** 大きな札。確定は本当に目玉のときだけ出す。 */
  banner?: { title: string; sub: string; kind: 'kakutei' | 'chance' }
  hearts: number
  sparkles: number
  /** 友達（デモ）のひとこと */
  friendLine?: string
}

/**
 * 1 回転ごとの演出。筐体と背景がだんだん豪華になる。
 * 目玉のときだけ 1 回転目のリボンがローズゴールドになり（隠れ確定）、2 回転目で「目玉 確定」を出す。
 */
export function turnEffect(turn: number, glow: Glow, withFriends: boolean): TurnEffect {
  if (turn === 1) {
    return {
      pipi: glow === 'featured' ? pipiLines.turn1Featured : pipiLines.turn1,
      chip: '1かいめ ♡',
      hearts: 12,
      sparkles: 0,
      friendLine: withFriends ? (glow === 'featured' ? '…リボン、金色じゃない？' : 'くるくる〜！') : undefined,
    }
  }
  if (turn === 2) {
    if (glow === 'featured') return { pipi: pipiLines.turn2Featured, chip: '2かいめ ✧', banner: { title: '目玉 確定', sub: '♡ SPECIAL ♡', kind: 'kakutei' }, hearts: 6, sparkles: 30, friendLine: withFriends ? 'え！？ 確定！？' : undefined }
    if (glow === 'sparkle') return { pipi: pipiLines.turn2Sparkle, chip: '2かいめ ✧', banner: { title: 'チャンス♡', sub: 'パールのカプセルが…！', kind: 'chance' }, hearts: 6, sparkles: 20, friendLine: withFriends ? 'キラキラしてる！' : undefined }
    return { pipi: pipiLines.turn2, chip: '2かいめ ✧', hearts: 6, sparkles: 14, friendLine: withFriends ? 'キラキラしてる！' : undefined }
  }
  return {
    pipi: glow === 'featured' ? pipiLines.turn3Featured : pipiLines.turn3,
    chip: glow === 'featured' ? 'ぜったい 出る…！' : 'ラスト ♡',
    hearts: 8,
    sparkles: 24,
    friendLine: withFriends ? 'でるでる〜！' : undefined,
  }
}

export function openLine(glow: Glow): string {
  return glow === 'featured' ? pipiLines.openFeatured : pipiLines.open
}

export function revealLine(glow: Glow): string {
  if (glow === 'featured') return pipiLines.revealFeatured
  if (glow === 'sparkle') return pipiLines.revealSparkle
  return pipiLines.reveal
}
