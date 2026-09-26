import { describe, expect, test } from 'vitest'
import { angleDelta, knobAngle, releaseKnob, restingKnob, trackKnob, type KnobTrack } from './knobTurn'

const center = { x: 100, y: 100 }
/** 中心から半径 50 の円周上の点（度。右が 0、時計回りに増える） */
const at = (degrees: number) => ({ x: center.x + 50 * Math.cos((degrees * Math.PI) / 180), y: center.y + 50 * Math.sin((degrees * Math.PI) / 180) })

/** 角度の列をなぞって、回転した回数と最後の状態を返す */
function trace(start: KnobTrack, angles: Array<number | null>) {
  let track = start
  let turns = 0
  for (const angle of angles) {
    const result = trackKnob(track, angle)
    track = result.track
    turns += result.turned
  }
  return { track, turns }
}

/** from から step 度ずつ count 回進んだ角度の列（負の step は左回り） */
const sweep = (from: number, step: number, count: number) => Array.from({ length: count }, (_, i) => ((from + step * (i + 1)) % 360 + 360) % 360)

describe('knobAngle: つまみの中心から見た指の角度', () => {
  test('右が 0、下が 90、左が 180、上が 270（画面の座標で時計回りに増える）', () => {
    expect(knobAngle(center, { x: 150, y: 100 })).toBe(0)
    expect(knobAngle(center, { x: 100, y: 150 })).toBe(90)
    expect(knobAngle(center, { x: 50, y: 100 })).toBe(180)
    expect(knobAngle(center, { x: 100, y: 50 })).toBe(270)
    expect(knobAngle(center, at(315))).toBeCloseTo(315)
  })

  test('中心に近すぎる点は角度が定まらないので null。ちょうど境界は読む', () => {
    expect(knobAngle(center, { x: 105, y: 100 }, 12)).toBeNull()
    expect(knobAngle(center, { x: 112, y: 100 }, 12)).toBe(0)
    expect(knobAngle(center, center)).toBe(0)
  })
})

describe('angleDelta: 近い方の回り方で見た差', () => {
  test('右回りは正、左回りは負。0 をまたいでも同じ', () => {
    expect(angleDelta(10, 30)).toBe(20)
    expect(angleDelta(30, 10)).toBe(-20)
    expect(angleDelta(350, 10)).toBe(20)
    expect(angleDelta(10, 350)).toBe(-20)
    expect(angleDelta(0, 179)).toBe(179)
    // ちょうど 180 は向きが読めないので左回り（-180）として扱う
    expect(angleDelta(0, 180)).toBe(-180)
  })
})

describe('trackKnob: 右回りだけ積み上げ、1 周で 1 回転', () => {
  test('右回りに 1 周（10° × 36）で 1 回転。360° に達した呼び出しで進み、余りは 0', () => {
    const { turns, track } = trace({ last: 0, progress: 0 }, sweep(0, 10, 36))
    expect(turns).toBe(1)
    expect(track.progress).toBe(0)
    expect(track.last).toBe(0)
  })

  test('半周では進まない。途中の角度は残る', () => {
    const { turns, track } = trace({ last: 0, progress: 0 }, sweep(0, 10, 18))
    expect(turns).toBe(0)
    expect(track.progress).toBe(180)
  })

  test('左回りに 1 周しても進まず、積み上げた角度も戻らない', () => {
    const { turns, track } = trace({ last: 0, progress: 90 }, sweep(0, -10, 36))
    expect(turns).toBe(0)
    expect(track.progress).toBe(90)
  })

  test('右に 3/4 周 → 左に 1/4 周 → 右に 1/4 周: 左回りを捨てるので、右回りの合計が 360° になった時点で 1 回転', () => {
    const right = sweep(0, 10, 27)
    const back = sweep(270, -10, 9)
    const again = sweep(180, 10, 9)
    const afterRight = trace({ last: 0, progress: 0 }, right)
    expect(afterRight.track.progress).toBe(270)
    const afterBack = trace(afterRight.track, back)
    expect(afterBack.turns).toBe(0)
    expect(afterBack.track.progress).toBe(270)
    const afterAgain = trace(afterBack.track, again)
    expect(afterAgain.turns).toBe(1)
    expect(afterAgain.track.progress).toBe(0)
  })

  test('回帰: 画面の座標から atan2 で読んだ角度（誤差あり）でも、指が元の位置に戻れば 1 回転（合計 359.999… を取りこぼさない）', () => {
    // Pixel 7 相当の実画面で読んだ値（つまみの中心と、マウスの整数座標 12 点。丸める前は合計が 359.99999999999994 だった）
    const center = { x: 125.54304504394531 + 160.91392517089844 / 2, y: 319.3323974609375 + 160.91390991210938 / 2 }
    const points = [[262, 432], [238, 456], [206, 464], [174, 456], [150, 432], [142, 400], [150, 368], [174, 344], [206, 335], [238, 344], [262, 368], [270, 400]]
    const angles = points.map(([x, y]) => knobAngle(center, { x, y })!)
    const { turns, track } = trace({ last: knobAngle(center, { x: 270, y: 400 })!, progress: 0 }, angles)
    expect(turns).toBe(1)
    expect(track.progress).toBe(0)
  })

  test('2 周なぞれば 2 回転。3 周で 3 回転', () => {
    expect(trace({ last: 0, progress: 0 }, sweep(0, 15, 48)).turns).toBe(2)
    expect(trace({ last: 0, progress: 0 }, sweep(0, 15, 72)).turns).toBe(3)
  })

  test('速すぎる: 1 回の呼び出しで進むのは 1 回転まで。170° ずつ飛んでも 3 回目で 1 回転だけ', () => {
    const first = trackKnob({ last: 0, progress: 0 }, 170)
    expect(first).toEqual({ track: { last: 170, progress: 170 }, turned: 0 })
    const second = trackKnob(first.track, 340)
    expect(second.turned).toBe(0)
    expect(second.track.progress).toBe(340)
    const third = trackKnob(second.track, 150)
    expect(third.turned).toBe(1)
    expect(third.track.progress).toBeCloseTo(150)
  })

  test('速すぎる: 180° 以上の飛びは向きが読めないので進めない（右回りに 350° 飛んだつもりでも左回り 10° と見る）', () => {
    const jump = trackKnob({ last: 0, progress: 100 }, 350)
    expect(jump).toEqual({ track: { last: 350, progress: 100 }, turned: 0 })
    const half = trackKnob({ last: 0, progress: 100 }, 180)
    expect(half.turned).toBe(0)
    expect(half.track.progress).toBe(100)
  })

  test('指が外れる: 離した（last が null）あとの最初の点は数えず、そこから数え直す。途中の角度は残る', () => {
    const half = trace({ last: 0, progress: 0 }, sweep(0, 10, 18))
    const released = releaseKnob(half.track)
    expect(released).toEqual({ last: null, progress: 180 })
    // 離れている間に反対側（90°）まで指が移っていても、その差は足さない
    const retouched = trackKnob(released, 90)
    expect(retouched).toEqual({ track: { last: 90, progress: 180 }, turned: 0 })
    // そこから右回りに半周で 1 回転
    const done = trace(retouched.track, sweep(90, 10, 18))
    expect(done.turns).toBe(1)
    expect(done.track.progress).toBe(0)
  })

  test('中心に寄りすぎた点（null）は数えず、次の点から数え直す', () => {
    const { turns, track } = trace({ last: 0, progress: 300 }, [null, 200, 210])
    expect(turns).toBe(0)
    expect(track).toEqual({ last: 210, progress: 310 })
  })

  test('最初の点だけでは進まない（restingKnob から）', () => {
    expect(trackKnob(restingKnob, 45)).toEqual({ track: { last: 45, progress: 0 }, turned: 0 })
    expect(trackKnob(restingKnob, null)).toEqual({ track: { last: null, progress: 0 }, turned: 0 })
  })
})
