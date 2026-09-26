import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { knobAngle, releaseKnob, restingKnob, trackKnob, type KnobTrack } from './knobTurn'

/** これより指が動いたらタップではなく「なぞり」。離したあとの click では回さない（CSS px） */
const TAP_TOLERANCE = 10
/** 押せる範囲の幅に対する、角度を読まない中心の半径の割合（中心の近くは角度が暴れる） */
const DEAD_ZONE = 0.15

type PointerLike = Pick<ReactPointerEvent<Element>, 'pointerId' | 'pointerType' | 'button' | 'clientX' | 'clientY' | 'currentTarget'>

export interface KnobHandlers {
  onPointerDown: (event: PointerLike) => void
  onPointerMove: (event: PointerLike) => void
  onPointerUp: (event: PointerLike) => void
  onPointerCancel: (event: PointerLike) => void
  onClick: () => void
}

/**
 * つまみを指で丸くなぞって回す（Pointer Events）。角度の計算は knobTurn.ts の純粋関数。
 * - 指が押せる範囲から少し外れても続くよう setPointerCapture する（jsdom など無い環境では何もしない）。
 * - 1 周（右回りに 360°）ごとに onTurn を 1 回呼ぶ。onTurn が無いとき（回せない場面）は何もしない。
 * - 動かさずに離した（タップ）ときは click で onTurn。なぞって離したときの click は無視する。
 * - progress は今の周の角度（0〜360 未満）、dragging は指が触れている間。
 */
export function useKnobDrag(onTurn: (() => void) | undefined) {
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const track = useRef<KnobTrack>(restingKnob)
  const active = useRef<number | null>(null)
  const origin = useRef({ x: 0, y: 0 })
  const moved = useRef(0)
  const turn = useRef(onTurn)
  useEffect(() => { turn.current = onTurn })

  const angleOf = (event: PointerLike) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    return knobAngle(center, { x: event.clientX, y: event.clientY }, rect.width * DEAD_ZONE)
  }

  const finish = useCallback((event: PointerLike) => {
    if (event.pointerId !== active.current) return
    active.current = null
    track.current = releaseKnob(track.current)
    setDragging(false)
  }, [])

  const handlers: KnobHandlers = {
    onPointerDown: (event) => {
      // 2 本目の指・右クリックは無視。回せない場面では触れても何も起きない
      if (!turn.current || active.current !== null) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      active.current = event.pointerId
      origin.current = { x: event.clientX, y: event.clientY }
      moved.current = 0
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* 対応しない環境 */ }
      track.current = trackKnob(track.current, angleOf(event)).track
      setDragging(true)
    },
    onPointerMove: (event) => {
      if (event.pointerId !== active.current) return
      moved.current = Math.max(moved.current, Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y))
      const result = trackKnob(track.current, angleOf(event))
      track.current = result.track
      setProgress(result.track.progress)
      if (result.turned) turn.current?.()
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onClick: () => {
      if (moved.current > TAP_TOLERANCE) { moved.current = 0; return }
      turn.current?.()
    },
  }

  return { progress, dragging, handlers }
}
