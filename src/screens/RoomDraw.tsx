import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useApp } from '../app/appContext'
import { buzz, chime, CHIMES } from '../app/feedback'
import { TIMING, TURNS } from '../domain/spinScript'
import { Capsule } from '../components/Capsule'
import { ExampleNotice, PageHeader } from '../components/Chrome'
import { Machine } from '../components/Machine'
import { useKnobDrag } from '../components/useKnobDrag'
import './gacha.css'

/** 1 周した瞬間の「カチッ」を見せる時間（ひとりで回すと同じ） */
const CLICK_MS = 400

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
 * ルームで自分のガチャを回す（デザインマスター T10 29・30、#88）。ひとりで回す（T08、src/screens/Spin.tsx）と同じ筐体・回し方:
 * つまみを指で右に丸くなぞる（1 周で 1 回転、#115）か、つまみのタップ・「1タップで1回転」。3 回転でカプセルが出る。
 * 時間の表示と時間切れはなく、自分のペースで回す。カプセルは1回タップで開き、サーバーに開けた記録をして自分の結果を受け取る。
 * 中身は開けるまで端末に届かないので、カプセルは普通の見た目のまま（当たりを先に知らせない）。
 */
export function RoomDraw({ sub, top, busy, error, onOpen }: Props) {
  const { state } = useApp()
  const [turns, setTurns] = useState(0)
  const [clicked, setClicked] = useState<number | null>(null)
  const [dropped, setDropped] = useState(false)
  const turnButton = useRef<HTMLButtonElement>(null)
  const openButton = useRef<HTMLButtonElement>(null)
  const turning = turns < TURNS

  useEffect(() => { turnButton.current?.focus() }, [])
  // 3回転の直後、受け皿にカプセルが出る（ひとりで回すと同じ間）
  useEffect(() => {
    if (turning || dropped) return
    const timer = window.setTimeout(() => setDropped(true), TIMING.drop)
    return () => window.clearTimeout(timer)
  }, [turning, dropped])
  useEffect(() => {
    if (clicked === null) return
    const timer = window.setTimeout(() => setClicked(null), CLICK_MS)
    return () => window.clearTimeout(timer)
  }, [clicked])
  // 押したボタンが消えるので、次に押すボタンへ焦点を移す
  useEffect(() => { if (dropped) openButton.current?.focus() }, [dropped])

  const oneTurn = () => {
    if (!turning) return
    const next = turns + 1
    setTurns(next)
    if (state.soundOn) chime(CHIMES.turn)
    buzz(next === TURNS ? [40, 60, 80] : 30)
    // 3 回転目はカプセルが出るので「カチッ」は出さない（ひとりで回すと同じ）
    setClicked(next < TURNS ? next : null)
  }
  const knob = useKnobDrag(turning ? oneTurn : undefined)
  const open = () => {
    if (busy) return
    if (state.soundOn) chime(CHIMES.tap)
    buzz(30)
    onOpen()
  }

  const lead = !turning ? 'カプセルが出てきました'
    : clicked !== null ? `${clicked} 回転、できた！`
    : knob.dragging ? 'そのまま右にぐるっと一周！'
    : 'つまみを右にくるっと回そう'
  const hint = clicked !== null ? 'つづけて右に回そう。' : '右回りに一周で 1 回転。ボタンでも回せます。'

  return (
    <div className="screen spin-screen world-lavender room-draw">
      <PageHeader title={dropped ? 'カプセルを開けよう' : 'ガチャを回そう'}>
        {/* 補足にホストのニックネーム（「〇〇さんのルーム」）を含むので、録画（Clarity）で隠す */}
        <p className="page-header-sub room-sub" data-clarity-mask="true">{sub}</p>
      </PageHeader>
      <main className="content spin-content">
        {top}
        <div className="machine-wrap">
          <Machine
            turns={turns} progress={knob.progress} dragging={knob.dragging} hint={turning && !knob.dragging && clicked === null} click={clicked !== null}
            onHandleTap={turning ? oneTurn : undefined} knob={knob.handlers}
          />
          {dropped && <Capsule glow="normal" className="is-mini room-draw-capsule" onClick={open} />}
        </div>
        {dropped ? (
          <>
            <p className="turn-count" aria-live="polite">{lead}</p>
            <p className="spin-lead">カプセルを1回タップすると開きます</p>
            {error && <p className="field-error room-error" role="alert">{error}</p>}
            <button ref={openButton} type="button" className="btn btn-main btn-block" onClick={open} disabled={busy}>
              {busy ? '開けています' : 'カプセルを開ける'}
            </button>
          </>
        ) : (
          <>
            <p className="turn-count" aria-live="polite">回転 {turns} / {TURNS}</p>
            <p className="spin-lead" aria-live="polite">{lead}</p>
            <p className="fine spin-sub">{hint}</p>
            <p className="turn-bars" aria-hidden="true">{Array.from({ length: TURNS }, (_, i) => <span key={i} className={i < turns ? (clicked === i + 1 ? 'on is-new' : 'on') : ''} />)}</p>
            <button ref={turnButton} type="button" className="btn btn-outline btn-block" onClick={oneTurn} disabled={!turning}>1タップで1回転</button>
          </>
        )}
        <ExampleNotice />
      </main>
    </div>
  )
}
