import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useApp } from '../app/appContext'
import { buzz, chime, CHIMES } from '../app/feedback'
import { TIMING, TURNS } from '../domain/spinScript'
import { Capsule } from '../components/Capsule'
import { ExampleNotice, PageHeader } from '../components/Chrome'
import { Machine } from '../components/Machine'
import './gacha.css'

interface Props {
  /** 見出しの下の補足（「ミオさんのルーム · 1回目」）。 */
  sub: string
  /** デモの注意・ピッチ用の表示など、筐体の上に出すもの。 */
  top?: ReactNode
  /** 開ける操作をサーバーへ送っている間。 */
  busy: boolean
  error: string | null
  onOpen: () => void
}

/**
 * ルームで自分のガチャを回す（デザイン T10 29・30、#88）。ひとりで回す（T08）と同じ筐体・回し方・カプセルを使う。
 * 時間の表示と時間切れはなく、自分のペースで回す。カプセルは1回タップで開き、サーバーに開けた記録をして自分の結果を受け取る。
 * 中身は開けるまで端末に届かないので、カプセルは普通の見た目のまま（当たりを先に知らせない）。
 */
export function RoomDraw({ sub, top, busy, error, onOpen }: Props) {
  const { state } = useApp()
  const [turns, setTurns] = useState(0)
  const [dropped, setDropped] = useState(false)
  const turnButton = useRef<HTMLButtonElement>(null)
  const openButton = useRef<HTMLButtonElement>(null)
  const ring = (notes: number[], pattern: number | number[] = 30) => {
    if (!state.soundOn) return
    chime(notes)
    buzz(pattern)
  }

  useEffect(() => { turnButton.current?.focus() }, [])
  // 3回転の直後、受け皿にカプセルが出る（ひとりで回すと同じ間）
  useEffect(() => {
    if (turns < TURNS || dropped) return
    const timer = window.setTimeout(() => setDropped(true), TIMING.drop)
    return () => window.clearTimeout(timer)
  }, [turns, dropped])
  // 押したボタンが消えるので、次に押すボタンへ焦点を移す
  useEffect(() => { if (dropped) openButton.current?.focus() }, [dropped])

  const oneTurn = () => {
    if (turns >= TURNS) return
    const next = turns + 1
    setTurns(next)
    ring(CHIMES.turn, next === TURNS ? [40, 60, 80] : 30)
  }
  const open = () => {
    if (busy) return
    ring(CHIMES.tap, 30)
    onOpen()
  }

  return (
    <div className="screen spin-screen room-draw">
      <PageHeader title={dropped ? 'カプセルを開けよう' : 'ガチャを回そう'}>
        <p className="page-header-sub room-sub">{sub}</p>
      </PageHeader>
      <main className="content spin-content">
        {top}
        <div className="machine-wrap">
          <Machine turns={turns} onHandleTap={turns < TURNS ? oneTurn : undefined} />
          {dropped && <Capsule glow="normal" className="is-mini room-draw-capsule" onClick={open} />}
        </div>
        {dropped ? (
          <>
            <p className="turn-count" aria-live="polite">カプセルが出てきました</p>
            <p className="spin-lead">カプセルを1回タップすると開きます</p>
            {error && <p className="field-error room-error" role="alert">{error}</p>}
            <button ref={openButton} type="button" className="btn btn-main btn-block" onClick={open} disabled={busy}>
              {busy ? '開けています' : 'カプセルを開ける'}
            </button>
          </>
        ) : (
          <>
            <p className="turn-count" aria-live="polite">回転 {turns} / {TURNS}</p>
            <p className="spin-lead">右のハンドルをタップして進めます</p>
            <p className="fine spin-sub">下のボタンでも同じように進められます。</p>
            <p className="turn-bars" aria-hidden="true">{Array.from({ length: TURNS }, (_, i) => <span key={i} className={i < turns ? 'on' : ''} />)}</p>
            <button ref={turnButton} type="button" className="btn btn-outline btn-block" onClick={oneTurn} disabled={turns >= TURNS}>1タップで1回転</button>
          </>
        )}
        <ExampleNotice />
      </main>
    </div>
  )
}
