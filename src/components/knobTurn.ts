/**
 * つまみを指で丸くなぞって回す計算（#115、マスターの部品 T08 / Gacha Machine 419:10377 の dragging・click 状態）。
 * 画面の座標（y は下向き）で、つまみの中心から見た指の角度を積み上げる。
 * 決まり: 右回り（時計回り）だけ進む。左回りは進まない・戻らない。1 周（360°）で 1 回転。速すぎても 1 回の呼び出しで 1 回転まで。
 * React・DOM に依存しない純粋関数。イベントの読み取りは useKnobDrag.ts。
 */

export interface Point { x: number; y: number }

/**
 * つまみの中心から見た点の角度（度、0 以上 360 未満）。右（3 時）が 0 で、値が増える向きが時計回り。
 * 中心に近すぎる（minRadius 未満）点は角度が定まらないので null。
 */
export function knobAngle(center: Point, point: Point, minRadius = 0): number | null {
  const dx = point.x - center.x
  const dy = point.y - center.y
  if (Math.hypot(dx, dy) < minRadius) return null
  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI
  return (degrees + 360) % 360
}

export interface KnobTrack {
  /** 直前に読んだ指の角度。指が離れている・中心に寄りすぎているときは null（次の点から数え直す） */
  last: number | null
  /** いま回している周の、右回りに積み上げた角度（0 以上 360 未満）。指を離しても残る（つまみは戻らない） */
  progress: number
}

export const restingKnob: KnobTrack = { last: null, progress: 0 }
/** 1 周と見なす角度の余裕（度）。浮動小数の誤差のためで、目に見える差ではない */
const TURN_TOLERANCE = 1e-3

/** 2 つの角度の差を -180 以上 180 未満に直す（近い方の回り方で見る。正が右回り） */
export function angleDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

/**
 * 指が動いた。右回りの増分だけを積み上げ、360° に達したら 1 回転（turned = 1）にして余りを次の周に持ち越す。
 * 左回りの増分は捨てる（進まない・戻らない）。180° 以上の飛び（速すぎる・向きが読めない）は左回りとして扱い、進めない。
 * 1 回の呼び出しの増分は 180° 未満なので、進むのは 1 回転まで。
 */
export function trackKnob(track: KnobTrack, angle: number | null): { track: KnobTrack; turned: 0 | 1 } {
  if (angle === null || track.last === null) return { track: { last: angle, progress: track.progress }, turned: 0 }
  const delta = angleDelta(track.last, angle)
  if (delta <= 0) return { track: { last: angle, progress: track.progress }, turned: 0 }
  const progress = track.progress + delta
  // 角度は atan2 の値の積み上げなので、指がちょうど元の位置に戻っても合計が 359.999… になり得る。1/1000 度の余裕で 1 周を取りこぼさない
  if (progress >= 360 - TURN_TOLERANCE) return { track: { last: angle, progress: Math.max(0, progress - 360) }, turned: 1 }
  return { track: { last: angle, progress }, turned: 0 }
}

/** 指を離した。途中の角度は残し、次に触れた点から数え直す */
export function releaseKnob(track: KnobTrack): KnobTrack {
  return { last: null, progress: track.progress }
}
