import { TIMING, TURNS } from '../domain/spinScript'
import type { Glow } from '../domain/types'

/**
 * 回転ごとの演出（#116）。部品「T08 / Gacha Machine」（component set 419:10377）の state × glow の variant に対応する。
 * 抽選の結果は回す前に決まっている（pickPrize）ので、済んだ回転数 turns と当たりの glow から演出の段階を純粋に決め、
 * 描画は className（部品の state / glow と同じ名前）の切り替えだけにする。音・振動・タイミング（spinScript）は変えない。
 */
export type SpinState = 'turn1' | 'turn2' | 'turn3' | 'click3'

export interface Star { x: number; y: number; size: number; tone: number }
export interface Point { x: number; y: number }

export interface SpinEffect {
  /** 部品の state。turn1 = 1 回転目の途中（turns=0）、turn2 = 1 周の後、turn3 = 2 周の後、click3 = 3 周目が終わった瞬間から */
  state: SpinState
  /** 部品の glow。turn1 は glow によらず normal（当たりを匂わせない） */
  glow: Glow
  /** 筐体のまわりの四芒星（部品内の座標、size は幅）。tone は glow の色の順番 */
  stars: Star[]
  /** 小さな粒 3〜4px（sparkle / featured だけ） */
  grains: Point[]
  /** turn3: 筐体がぷるっと揺れる（両脇に揺れ線） */
  shake: boolean
  /** click3: 取り出し口に光が集まり、星が寄る */
  light: boolean
  /** click3 で寄る星の数（S5 でカプセルのまわりに光る星も同じ数）: normal 4・sparkle 6・featured 8 */
  gather: number
  /** featured の click3: 光の筋 4 本 */
  rays: boolean
  /** sparkle の turn2 から: ドームに真珠色のつや */
  sheen: boolean
  /** featured の turn3 から: 筐体の後ろに暖かい光 */
  aura: boolean
  /** featured の turn2 から: 画面の背景を sanrio/cream に（画面側） */
  warm: boolean
  /** featured の turn3 から: 「回転 3 / 3」の右の札「きらきら… いい予感！」（画面側） */
  tag: boolean
  /** 筐体に付ける className（`state-turn2 glow-featured` のように、部品の state / glow と同じ名前） */
  className: string
}

/** 星の位置（部品 419:10377 の座標。部品は 350×424）。turn2 で 3 つ、turn3 で 5 つ。sparkle / featured はさらに増える */
const STARS_TURN2: Array<[number, number, number]> = [[24, 88, 12], [326, 102, 14], [338, 166, 9]]
const STARS_TURN3: Array<[number, number, number]> = [[16, 210, 10], [334, 42, 12]]
const STARS_LUCKY_TURN2: Array<[number, number, number]> = [[8, 142, 8]]
const STARS_LUCKY_TURN3: Array<[number, number, number]> = [[348, 244, 10], [38, 32, 9]]
const GRAINS_LUCKY: Point[] = [{ x: 30, y: 124 }, { x: 320, y: 192 }, { x: 20, y: 276 }]
/** 星の色の数（順に繰り返す）: normal は petal・rose の 2 色、sparkle / featured は 3 色 */
const TONES: Record<Glow, number> = { normal: 2, sparkle: 3, featured: 3 }
/** click3 で取り出し口に寄る星の数 */
const GATHER: Record<Glow, number> = { normal: 4, sparkle: 6, featured: 8 }

/** 演出なし（turn1）。呼び出し側が配列を変えても次の呼び出しに影響しないよう、毎回新しく作る */
const none = (): SpinEffect => ({ state: 'turn1', glow: 'normal', stars: [], grains: [], shake: false, light: false, gather: 0, rays: false, sheen: false, aura: false, warm: false, tag: false, className: 'state-turn1 glow-normal' })

export function spinEffect(turns: number, glow: Glow): SpinEffect {
  // 1 回転目の途中は glow によらず演出なし（当たりを匂わせない）
  if (turns < 1) return none()
  const state: SpinState = turns >= TURNS ? 'click3' : turns >= 2 ? 'turn3' : 'turn2'
  const lucky = glow !== 'normal'
  const featured = glow === 'featured'
  const beyondTurn2 = turns >= 2
  const raw = [...STARS_TURN2, ...(beyondTurn2 ? STARS_TURN3 : []), ...(lucky ? STARS_LUCKY_TURN2 : []), ...(lucky && beyondTurn2 ? STARS_LUCKY_TURN3 : [])]
  const stars = raw.map(([x, y, size], i) => ({ x, y, size, tone: i % TONES[glow] }))
  return {
    state,
    glow,
    stars,
    grains: lucky ? GRAINS_LUCKY.map((point) => ({ ...point })) : [],
    shake: state === 'turn3',
    light: state === 'click3',
    gather: state === 'click3' ? GATHER[glow] : 0,
    rays: featured && state === 'click3',
    sheen: glow === 'sparkle',
    aura: featured && beyondTurn2,
    warm: featured,
    tag: featured && beyondTurn2,
    className: `state-${state} glow-${glow}`,
  }
}

/**
 * 3 回転目のあと取り出し口からカプセルが出る動き（Figma のプロトタイプ。click3 から自動）。
 * 待ちと時間はミリ秒で、src/screens/gacha.css の keyframes `capsule-out` と同じ数字。
 */
export const CAPSULE_OUT = [
  { state: 'S1', label: '奥で揺れる', wait: 200, duration: 250, easing: 'ease-in-out' },
  { state: 'S2', label: '飛び出す', wait: 150, duration: 280, easing: 'ease-out' },
  { state: 'S3', label: '着地', wait: 50, duration: 220, easing: 'ease-in' },
  { state: 'S4', label: '弾む', wait: 50, duration: 160, easing: 'ease-out' },
  { state: 'S5', label: '光る', wait: 50, duration: 200, easing: 'ease-in' },
] as const

/** click3 からカプセルが光る（S5）までの合計（約 1.6 秒） */
export const CAPSULE_OUT_MS = CAPSULE_OUT.reduce((sum, step) => sum + step.wait + step.duration, 0)
/** 動きを減らす設定: S1〜S4 を飛ばし、click3 → S5 を 1 段のフェード（0.2 秒待って 0.2 秒） */
export const CAPSULE_FADE_MS = 400
/** S5 でカプセルが光ってから開封の画面へ進むまで見せる時間 */
export const CAPSULE_LIT_HOLD_MS = 350

/** カプセルが光る（S5）までの時間。動きを減らす設定ではフェードだけ */
export const capsuleLitMs = (reducedMotion: boolean) => (reducedMotion ? CAPSULE_FADE_MS : CAPSULE_OUT_MS)

/**
 * 3 回転目から開封の画面へ進むまでの時間。spinScript の TIMING.drop（0.9 秒）を下限にし、
 * カプセルが光るまでの見た目の時間（CSS と同じ数字）を足す。spinScript 自体は変えない。
 */
export const capsuleDropMs = (reducedMotion: boolean) => Math.max(TIMING.drop, capsuleLitMs(reducedMotion) + CAPSULE_LIT_HOLD_MS)
