import { describe, expect, test } from 'vitest'
import { TIMING, TURNS } from '../domain/spinScript'
import type { Glow } from '../domain/types'
import { CAPSULE_FADE_MS, CAPSULE_LIT_HOLD_MS, CAPSULE_OUT, CAPSULE_OUT_MS, capsuleDropMs, capsuleLitMs, spinEffect } from './spinEffect'

const glows: Glow[] = ['normal', 'sparkle', 'featured']

describe('spinEffect: 済んだ回転数と glow から演出の段階を決める（部品 419:10377 の state × glow）', () => {
  test('1 回転目の途中（turns=0）は glow によらず同じで、演出なし（当たりを匂わせない）', () => {
    for (const glow of glows) {
      const effect = spinEffect(0, glow)
      expect(effect).toEqual(spinEffect(0, 'normal'))
      expect(effect.state).toBe('turn1')
      expect(effect.glow).toBe('normal')
      expect(effect.className).toBe('state-turn1 glow-normal')
      expect(effect.stars).toEqual([])
      expect(effect.grains).toEqual([])
      expect([effect.shake, effect.light, effect.rays, effect.sheen, effect.aura, effect.warm, effect.tag]).toEqual([false, false, false, false, false, false, false])
      expect(effect.gather).toBe(0)
    }
  })

  test('state は turns で決まる: 1 周の後 turn2、2 周の後 turn3、3 周目が終わったら click3（それ以上も click3）', () => {
    expect(spinEffect(1, 'normal').state).toBe('turn2')
    expect(spinEffect(2, 'normal').state).toBe('turn3')
    expect(spinEffect(3, 'normal').state).toBe('click3')
    expect(spinEffect(TURNS, 'featured').state).toBe('click3')
    expect(spinEffect(4, 'sparkle').state).toBe('click3')
    expect(spinEffect(-1, 'featured')).toEqual(spinEffect(0, 'normal'))
  })

  test('className は部品の state / glow と同じ名前', () => {
    expect(spinEffect(1, 'sparkle').className).toBe('state-turn2 glow-sparkle')
    expect(spinEffect(2, 'featured').className).toBe('state-turn3 glow-featured')
    expect(spinEffect(3, 'normal').className).toBe('state-click3 glow-normal')
  })

  test('星: turn2 は 3 つ、turn3 は 5 つ。sparkle / featured は turn2 で +1、turn3 で +3 と粒 3 つ', () => {
    expect(spinEffect(1, 'normal').stars.map((s) => [s.x, s.y, s.size])).toEqual([[24, 88, 12], [326, 102, 14], [338, 166, 9]])
    expect(spinEffect(2, 'normal').stars.map((s) => [s.x, s.y, s.size])).toEqual([[24, 88, 12], [326, 102, 14], [338, 166, 9], [16, 210, 10], [334, 42, 12]])
    expect(spinEffect(1, 'normal').grains).toEqual([])
    for (const glow of ['sparkle', 'featured'] as const) {
      expect(spinEffect(1, glow).stars).toHaveLength(4)
      expect(spinEffect(1, glow).stars.at(-1)).toMatchObject({ x: 8, y: 142, size: 8 })
      expect(spinEffect(2, glow).stars).toHaveLength(8)
      expect(spinEffect(2, glow).stars.slice(-2).map((s) => [s.x, s.y])).toEqual([[348, 244], [38, 32]])
      expect(spinEffect(1, glow).grains).toEqual([{ x: 30, y: 124 }, { x: 320, y: 192 }, { x: 20, y: 276 }])
    }
    // click3 でも星は turn3 と同じ（そこに取り出し口の光が加わる）
    expect(spinEffect(3, 'featured').stars).toEqual(spinEffect(2, 'featured').stars)
  })

  test('星の色は glow の順に繰り返す: normal は 2 色、sparkle / featured は 3 色', () => {
    expect(spinEffect(2, 'normal').stars.map((s) => s.tone)).toEqual([0, 1, 0, 1, 0])
    expect(spinEffect(2, 'sparkle').stars.map((s) => s.tone)).toEqual([0, 1, 2, 0, 1, 2, 0, 1])
    expect(spinEffect(2, 'featured').stars.map((s) => s.tone)).toEqual([0, 1, 2, 0, 1, 2, 0, 1])
  })

  test('揺れは turn3 だけ、取り出し口の光と寄る星は click3 だけ（normal 4・sparkle 6・featured 8）', () => {
    for (const glow of glows) {
      expect(spinEffect(1, glow).shake).toBe(false)
      expect(spinEffect(2, glow).shake).toBe(true)
      expect(spinEffect(3, glow).shake).toBe(false)
      expect(spinEffect(2, glow).light).toBe(false)
      expect(spinEffect(2, glow).gather).toBe(0)
      expect(spinEffect(3, glow).light).toBe(true)
    }
    expect(spinEffect(3, 'normal').gather).toBe(4)
    expect(spinEffect(3, 'sparkle').gather).toBe(6)
    expect(spinEffect(3, 'featured').gather).toBe(8)
  })

  test('normal では背景・札・金色（光の筋・暖かい光）・つやを一切出さない', () => {
    for (const turns of [1, 2, 3]) {
      const effect = spinEffect(turns, 'normal')
      expect([effect.warm, effect.tag, effect.rays, effect.aura, effect.sheen]).toEqual([false, false, false, false, false])
    }
  })

  test('sparkle は turn2 からドームのつやだけ。背景・札・光の筋は出さない', () => {
    for (const turns of [1, 2, 3]) {
      const effect = spinEffect(turns, 'sparkle')
      expect(effect.sheen).toBe(true)
      expect([effect.warm, effect.tag, effect.rays, effect.aura]).toEqual([false, false, false, false])
    }
  })

  test('featured は turn2 から背景がクリーム、turn3 から暖かい光と札、click3 で光の筋', () => {
    expect(spinEffect(1, 'featured')).toMatchObject({ warm: true, aura: false, tag: false, rays: false, sheen: false })
    expect(spinEffect(2, 'featured')).toMatchObject({ warm: true, aura: true, tag: true, rays: false })
    expect(spinEffect(3, 'featured')).toMatchObject({ warm: true, aura: true, tag: true, rays: true })
  })

  test('同じ入力には同じ結果を返し、呼び出し側が結果（配列を含む）を変えても次の呼び出しに影響しない', () => {
    const a = spinEffect(2, 'sparkle')
    const b = spinEffect(2, 'sparkle')
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
    a.stars.push({ x: 0, y: 0, size: 1, tone: 0 })
    a.grains.push({ x: 0, y: 0 })
    a.grains[0].x = 999
    expect(spinEffect(2, 'sparkle')).toEqual(b)
    const none = spinEffect(0, 'featured')
    none.stars.push({ x: 0, y: 0, size: 1, tone: 0 })
    none.grains.push({ x: 0, y: 0 })
    expect(spinEffect(0, 'normal').stars).toEqual([])
    expect(spinEffect(0, 'sparkle').grains).toEqual([])
  })
})

describe('カプセルが出る動きの時間（Figma のプロトタイプの数字。CSS の keyframes と同じ）', () => {
  test('click3 → S1 0.20+0.25、S2 0.15+0.28、S3 0.05+0.22、S4 0.05+0.16、S5 0.05+0.20 = 約 1.6 秒', () => {
    expect(CAPSULE_OUT.map((step) => [step.state, step.wait, step.duration])).toEqual([['S1', 200, 250], ['S2', 150, 280], ['S3', 50, 220], ['S4', 50, 160], ['S5', 50, 200]])
    expect(CAPSULE_OUT_MS).toBe(1610)
    expect(capsuleLitMs(false)).toBe(1610)
  })

  test('動きを減らす設定は S1〜S4 を飛ばし 0.2 秒待って 0.2 秒のフェード', () => {
    expect(CAPSULE_FADE_MS).toBe(400)
    expect(capsuleLitMs(true)).toBe(400)
  })

  test('開封へ進むのは、spinScript の TIMING.drop を下限に、カプセルが光ってから少し見せたあと', () => {
    expect(capsuleDropMs(false)).toBe(1610 + CAPSULE_LIT_HOLD_MS)
    expect(capsuleDropMs(false)).toBeGreaterThanOrEqual(TIMING.drop)
    expect(capsuleDropMs(true)).toBe(Math.max(TIMING.drop, 400 + CAPSULE_LIT_HOLD_MS))
    expect(TIMING.drop).toBe(900)
  })
})
