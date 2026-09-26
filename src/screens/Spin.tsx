import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../app/appContext'
import { buzz, chime, CHIMES } from '../app/feedback'
import { paths } from '../app/router'
import { findGacha } from '../domain/catalog'
import { spin, spinCheck, spinQuote, type SpinOutcome } from '../domain/game'
import { coinText, OPEN_TAPS } from '../domain/odds'
import { TIMING, TURNS } from '../domain/spinScript'
import type { Gacha } from '../domain/types'
import { MockNotice, PageHeader, SaveWarning, TabBar } from '../components/Chrome'
import { GoodsImage } from '../components/Goods'
import { Machine } from '../components/Machine'
import { NotFound } from './NotFound'
import './gacha.css'

type Won = Extract<SpinOutcome, { ok: true }>
/** confirm: 回す前の確認（まだコインを使わない）→ turning: 3回転 → dropping → opening: 開封 → revealed: 結果 */
type Phase = 'confirm' | 'turning' | 'dropping' | 'opening' | 'revealed'

export function Spin({ id }: { id: string }) {
  const gacha = findGacha(id)
  if (!gacha) return <NotFound />
  return <SpinStage key={id} gacha={gacha} />
}

/**
 * ひとりで回す画面。デザインマスター T08（回す前 267:8335・回転 267:8348〜8374・開封 267:8387〜8421・結果 267:8438）に合わせる。
 * 筐体は静止の絵（267:10520）で、回転・開封の途中は戻る・下のタブを出さない。右のハンドルか「1タップで1回転」で進める。
 * 友達といっしょに開ける体験は、共有ルーム（T10・F05、src/screens/Room.tsx）で行う。
 */
function SpinStage({ gacha }: { gacha: Gacha }) {
  const { state, update } = useApp()
  const [won, setWon] = useState<Won | null>(null)
  const [turns, setTurns] = useState(0)
  const [phase, setPhase] = useState<Phase>('confirm')
  const turnButton = useRef<HTMLButtonElement>(null)
  const problem = won ? null : spinCheck(state, gacha.id)
  const { soundOn } = state

  const ring = useCallback((notes: number[], pattern: number | number[] = 30) => {
    if (!soundOn) return
    chime(notes)
    buzz(pattern)
  }, [soundOn])

  /** 確認のあとで初めてコインを使い、結果を決める。 */
  const confirm = () => {
    if (phase !== 'confirm' || won) return
    const result = spin(state, gacha.id, Math.random, [], new Date())
    if (!result.ok) return
    update(() => result.state)
    setWon(result)
    setPhase('turning')
  }

  // 押したボタンが消えるので、次に押すボタンへ焦点を移す（確定 →「1タップで1回転」）
  useEffect(() => {
    if (phase === 'turning' && turns === 0) turnButton.current?.focus()
  }, [phase, turns])

  /** 右のハンドルか「1タップで1回転」で、1回転ずつ進める。 */
  // 1 回転ごとに音（ON のときだけ）とハンドルの動きだけ。筐体・背景は変えない
  const oneTurn = () => {
    if (phase !== 'turning' || !won || turns >= TURNS) return
    const next = turns + 1
    setTurns(next)
    ring(CHIMES.turn, next === TURNS ? [40, 60, 80] : 30)
    if (next === TURNS) setPhase('dropping')
  }

  useEffect(() => {
    if (phase !== 'dropping' || !won) return
    const timer = window.setTimeout(() => setPhase('opening'), TIMING.drop)
    return () => window.clearTimeout(timer)
  }, [phase, won])

  const onReveal = () => {
    if (!won) return
    setPhase('revealed')
    ring(won.prize.glow === 'normal' ? [784, 988, 1175] : CHIMES.big, [60, 40, 90])
  }

  if (problem) return <SpinProblem gacha={gacha} problem={problem} />

  const confirming = phase === 'confirm'
  const opened = phase === 'opening' || phase === 'revealed'
  const quote = spinQuote(state, gacha)

  return (
    <div className={`screen spin-screen${confirming ? ' is-confirm' : ''}`}>
      {won && opened ? (
        <OpenScene won={won} gacha={gacha} balance={state.coins} onReveal={onReveal} onTap={() => ring(CHIMES.tap, 30)} revealed={phase !== 'opening'} />
      ) : (
        <>
          <PageHeader title={confirming ? '回す前に' : 'ハンドルを回す'} back={confirming ? paths.gacha(gacha.id) : undefined} />
          <main className="content spin-content">
            <div className="machine-wrap">
              <Machine turns={turns} label={confirming ? 'ガチャガチャ。確定すると回せます' : undefined} onHandleTap={phase === 'turning' ? oneTurn : undefined} />
            </div>
            {confirming ? (
              <>
                <h2 className="confirm-title">1回だけ引きます</h2>
                <div className="pay-card confirm-card">
                  <p className="pay-need">必要 <b>{coinText(quote.price)}</b> デモコイン</p>
                  <p className="pay-balance">所持 {coinText(quote.balance)} <span aria-hidden="true">→</span><span className="visually-hidden">から</span> 確定後 {coinText(quote.after)}</p>
                  <p className="fine confirm-lead">確定後に{TURNS}回転。ハンドルかボタンで進めます。</p>
                  <p className="fine">確率と在庫は確定直前に再確認。</p>
                </div>
                <button type="button" className="btn btn-main btn-block" onClick={confirm}>{coinText(quote.price)}使って1回引く</button>
              </>
            ) : (
              <>
                <p className="turn-count" aria-live="polite">回転 {turns} / {TURNS}</p>
                <p className="spin-lead">右のハンドルをタップして進めます</p>
                <p className="fine spin-sub">下のボタンでも同じように進められます。</p>
                <p className="turn-bars" aria-hidden="true">{Array.from({ length: TURNS }, (_, i) => <span key={i} className={i < turns ? 'on' : ''} />)}</p>
                <button ref={turnButton} type="button" className="btn btn-outline btn-block" onClick={oneTurn} disabled={phase !== 'turning'}>1タップで1回転</button>
                <p className="fine spent">{coinText(gacha.price)}コイン使用済み・残高{coinText(state.coins)}</p>
              </>
            )}
            <MockNotice />
          </main>
          {confirming && <TabBar active="gacha" />}
        </>
      )}
    </div>
  )
}

interface OpenProps { won: Won; gacha: Gacha; balance: number; revealed: boolean; onReveal: () => void; onTap: () => void }

/** カプセルの見た目の段階（マスター 267:8387 閉じている → 8404 すきまがあく → 8421 ふたが離れる）。 */
const CAPSULE_STAGES = ['closed', 'crack', 'apart'] as const

/**
 * 開封（マスター 267:8387 / 8404 / 8421）と今回の結果（267:8438）。
 * 光り方にかかわらず、いつも3回タップで開く（カプセルの見た目も同じ）。動きを減らす設定でも、段階の絵と文字で進む。
 * 開封の途中は戻る・下のタブを出さない。結果は保存済みなので、結果の画面からは戻れる。
 */
function OpenScene({ won, gacha, balance, revealed, onReveal, onTap }: OpenProps) {
  const { saveFailed } = useApp()
  const [taps, setTaps] = useState(0)
  const [opening, setOpening] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const revealRef = useRef(onReveal)
  useEffect(() => { revealRef.current = onReveal })
  useEffect(() => { ref.current?.focus() }, [])
  // 結果が出たら、タップのボタンが消えるので結果の見出しへ焦点を移す
  useEffect(() => { if (revealed) document.getElementById('page-title')?.focus({ preventScroll: true }) }, [revealed])
  useEffect(() => {
    if (!opening) return
    const timer = window.setTimeout(() => revealRef.current(), TIMING.open)
    return () => window.clearTimeout(timer)
  }, [opening])
  const tap = () => {
    if (opening) return
    onTap()
    const next = taps + 1
    setTaps(next)
    if (next >= OPEN_TAPS) setOpening(true)
  }
  const step = opening ? OPEN_TAPS : taps + 1
  const stage = opening ? 'apart' : CAPSULE_STAGES[Math.min(taps, CAPSULE_STAGES.length - 1)]
  if (!revealed) {
    return (
      <>
        <PageHeader title="カプセルをひらく" />
        <main className="content open-stage">
          {/* 指で押しやすい大きな絵。キーボードと読み上げでは下のボタンを使う */}
          <div className={`capsule-art stage-${stage}${taps > 0 && !opening ? ` shake-${Math.min(taps, 2)}` : ''}`} aria-hidden="true" onClick={tap}>
            <span className="capsule-glow" /><span className="capsule-top" /><span className="capsule-bottom" /><span className="capsule-band" /><span className="capsule-knob" />
          </div>
          <p className="open-step" aria-live="polite">開封 {step} / {OPEN_TAPS}</p>
          <p className="open-sub">ゆっくり、好きなタイミングで。</p>
          <p className="turn-bars" aria-hidden="true">{Array.from({ length: OPEN_TAPS }, (_, i) => <span key={i} className={i < step ? 'on' : ''} />)}</p>
          <button ref={ref} type="button" className="btn btn-main btn-block open-tap" onClick={tap} aria-label={`カプセルをタップ（あと${Math.max(OPEN_TAPS - taps, 0)}回であきます）`}>カプセルをタップ</button>
          <MockNotice />
        </main>
      </>
    )
  }
  return (
    <>
      <PageHeader title="今回の結果" back={paths.gacha(gacha.id)} />
      <main className="content result-content">
        <p className="fine result-kicker">デモ・結果は抽選ごとに変わります</p>
        <article className="result-card" aria-labelledby="result-name">
          <GoodsImage art={won.prize.art} glow={won.prize.glow} size="lg" />
          <h2 id="result-name" className="reveal-name">{won.prize.name}</h2>
          <p className="result-sub">{gacha.title}で獲得</p>
          <p className="result-meta">{coinText(gacha.price)}使用・残高{coinText(balance)}・1点を獲得</p>
        </article>
        {saveFailed ? <SaveWarning /> : <p className="result-saved">この1点はコレクションに保存されます。</p>}
        <a className="btn btn-main btn-block" href={paths.town}>街へ戻る</a>
        <MockNotice />
      </main>
    </>
  )
}

/** 売り切れ（マスター 267:8450）とコイン不足（267:8461）。回す操作は出さず、コインは減らさない。 */
function SpinProblem({ gacha, problem }: { gacha: Gacha; problem: NonNullable<ReturnType<typeof spinCheck>> }) {
  const { state } = useApp()
  const quote = spinQuote(state, gacha)
  const soldOut = problem !== 'insufficient-coins'
  return (
    <div className="screen">
      <PageHeader title={soldOut ? '売り切れ' : 'コイン不足'} back={paths.gacha(gacha.id)} />
      <main className="content problem-content">
        {soldOut ? (
          <>
            <div className="machine-wrap is-soldout">
              <Machine className="soldout" label="売り切れのガチャガチャ。回せません" />
            </div>
            <h2 className="problem-title">このガチャは売り切れです</h2>
            <p className="lead problem-lead">抽選はできません。コインは減りません。</p>
            <p className="fine">次の入荷時期は未定です。</p>
          </>
        ) : (
          <>
            <div className="short-card">
              <p className="short-main">あと <b>{coinText(quote.shortBy)}</b> デモコイン</p>
              <p>所持 {coinText(quote.balance)}</p>
              <p>必要 {coinText(quote.price)}</p>
            </div>
            <h2 className="problem-title">今回は引けません</h2>
            <p className="lead problem-lead">残高はそのままです。</p>
            <p className="fine">コインの購入や決済は、この提案モックにはありません。</p>
          </>
        )}
        <a className="btn btn-outline btn-block" href={paths.gachaList}>ガチャ一覧に戻る</a>
        <MockNotice />
      </main>
      <TabBar active="gacha" />
    </div>
  )
}
