import { useCallback, useEffect, useRef, useState } from 'react'
import { track, trackOnce } from '../app/analytics'
import { useApp } from '../app/appContext'
import { buzz, chime, CHIMES } from '../app/feedback'
import { paths } from '../app/router'
import { findGacha } from '../domain/catalog'
import { spin, spinCheck, spinQuote, type SpinOutcome } from '../domain/game'
import { coinText, glowLabel, OPEN_TAPS } from '../domain/odds'
import { TIMING, TURNS } from '../domain/spinScript'
import type { Gacha, Glow } from '../domain/types'
import { Capsule, type CapsuleStage } from '../components/Capsule'
import { ExampleNotice, PageHeader, SaveWarning, TabBar } from '../components/Chrome'
import { GoodsImage } from '../components/Goods'
import { Machine } from '../components/Machine'
import { capsuleDropMs, capsuleLitMs, spinEffect } from '../components/spinEffect'
import { useKnobDrag } from '../components/useKnobDrag'
import { NotFound } from './NotFound'
import './gacha.css'

type Won = Extract<SpinOutcome, { ok: true }>

/** 読み上げ用のカプセルの名前。画面では色と光り方で見分ける（normal は「カプセル」だけ）。 */
const capsuleName = (glow: Glow) => (glow === 'normal' ? 'カプセル' : `${glowLabel[glow]}のカプセル`)
/** confirm: 回す前の確認（まだコインを使わない）→ turning: 3回転 → dropping → opening: 開封 → revealed: 結果 */
type Phase = 'confirm' | 'turning' | 'dropping' | 'opening' | 'revealed'
/** 1 周した瞬間の「カチッ」（マスターの state=click1）を見せる時間（ミリ秒、0.3〜0.5 秒） */
const CLICK_MS = 400
/** 動きを減らす設定（星・揺れ・光の動きを止め、カプセルは 1 段のフェード）。jsdom など matchMedia が無い環境は通常の動き */
const prefersReducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Spin({ id }: { id: string }) {
  const gacha = findGacha(id)
  if (!gacha) return <NotFound />
  return <SpinStage key={id} gacha={gacha} />
}

/**
 * ひとりで回す画面。デザインマスター T08（回す前 267:8335・回転 267:8348〜8374・なぞり中 421:9251・カチッ 421:9270・開封 267:8387〜8421・結果 267:8438）に合わせる。
 * 筐体は部品 419:10377 で、回転・開封の途中は戻る・下のタブを出さない。
 * 主の操作はつまみを指で右に丸くなぞること（1 周で 1 回転、#115）。つまみのタップと「1タップで1回転」でも進める。
 * 1 回転ごとの演出（#116）は spinEffect(turns, glow) で段階を決め、className の切り替えだけで描く（turn2 星 → turn3 星と揺れ → click3 光 →
 * カプセルが出る S1〜S5 は CSS の keyframes）。featured は turn2 から背景がクリーム、turn3 から札。normal では出さない。
 * 友達といっしょに開ける体験は、共有ルーム（T10・F05、src/screens/Room.tsx）で行う。
 */
function SpinStage({ gacha }: { gacha: Gacha }) {
  const { state, update } = useApp()
  const [won, setWon] = useState<Won | null>(null)
  const [turns, setTurns] = useState(0)
  const [phase, setPhase] = useState<Phase>('confirm')
  /** 直前に 1 周した回転の番号。CLICK_MS の間だけ「カチッ」を見せる（3 回転目の「カチッ」は click3 として筐体が出す） */
  const [clicked, setClicked] = useState<number | null>(null)
  /** 3 回転目のあと、カプセルが受け皿に着地して光った（S5）。ここで「カプセルが出てきました」 */
  const [landed, setLanded] = useState(false)
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

  /** つまみを 1 周なぞる・つまみのタップ・「1タップで1回転」のどれでも、1回転ずつ進める。 */
  // 1 回転ごとに音（ON のときだけ）・短い振動（対応端末）・つまみの動きと「カチッ」だけ。筐体・背景は変えない
  const oneTurn = () => {
    if (phase !== 'turning' || !won || turns >= TURNS) return
    const next = turns + 1
    setTurns(next)
    if (soundOn) chime(CHIMES.turn)
    buzz(next === TURNS ? [40, 60, 80] : 30)
    // 3 回転目の「カチッ」は click3 として筐体が出し、カプセルが出はじめたら消える（#116）。ここの札は消す
    setClicked(next < TURNS ? next : null)
    if (next === TURNS) {
      setPhase('dropping')
      // 計測（本番の公開 URL だけ）。目玉かどうかの真偽値だけで、賞品名・金額は送らない
      track('spin', { mode: 'solo', featured: won.prize.glow === 'featured' })
      trackOnce('spin_first', 'spin_first', { mode: 'solo' })
    }
  }

  const knob = useKnobDrag(phase === 'turning' ? oneTurn : undefined)

  useEffect(() => {
    if (clicked === null) return
    const timer = window.setTimeout(() => setClicked(null), CLICK_MS)
    return () => window.clearTimeout(timer)
  }, [clicked])

  // カプセルが出る動き（click3 → S1〜S5、CSS の keyframes）と同じ時間で、光ったら文言を変え、少し見せてから開封へ。
  // spinScript の TIMING.drop は下限（capsuleDropMs）。動きを減らす設定では 1 段のフェードの時間
  useEffect(() => {
    if (phase !== 'dropping' || !won) return
    const reduced = prefersReducedMotion()
    const lit = window.setTimeout(() => setLanded(true), capsuleLitMs(reduced))
    const timer = window.setTimeout(() => setPhase('opening'), capsuleDropMs(reduced))
    return () => { window.clearTimeout(lit); window.clearTimeout(timer) }
  }, [phase, won])

  const onReveal = () => {
    if (!won) return
    setPhase('revealed')
    ring(won.prize.glow === 'normal' ? [784, 988, 1175] : CHIMES.big, [60, 40, 90])
  }

  if (problem) return <SpinProblem gacha={gacha} problem={problem} />

  const confirming = phase === 'confirm'
  const opened = phase === 'opening' || phase === 'revealed'
  const dropped = phase === 'dropping' && won ? won : null
  const quote = spinQuote(state, gacha)
  const turning = phase === 'turning'
  // 回転ごとの演出の段階（#116）。抽選の結果は確定の時点で決まっている
  const effect = spinEffect(turns, won?.prize.glow ?? 'normal')
  // 本文（マスター turn1〜3 / dragging / click1）。3 回転の直後はカプセルが出る（S1〜S4）→ 出てきた（S5、#86）
  const lead = dropped ? (landed ? <>カプセルが出てきました<span className="visually-hidden">（{capsuleName(dropped.prize.glow)}）</span></> : 'カプセルが出てくるよ…')
    : clicked !== null ? `${clicked} 回転、できた！`
    : knob.dragging ? 'そのまま右にぐるっと一周！'
    : 'つまみを右にくるっと回そう'
  const sub = dropped ? 'そのまま待ってね。' : clicked !== null ? 'つづけて右に回そう。' : '右回りに一周で 1 回転。ボタンでも回せます。'

  return (
    <div className={`screen spin-screen${confirming ? ' is-confirm' : ''}${effect.warm ? ' is-warm' : ''}`}>
      {won && opened ? (
        <OpenScene won={won} gacha={gacha} balance={state.coins} onReveal={onReveal} onTap={() => ring(CHIMES.tap, 30)} revealed={phase !== 'opening'} />
      ) : (
        <>
          <PageHeader title={confirming ? '回す前に' : 'ハンドルを回す'} back={confirming ? paths.gacha(gacha.id) : undefined} />
          <main className="content spin-content">
            <div className="machine-wrap">
              <Machine
                turns={turns} progress={knob.progress} dragging={knob.dragging} hint={turning && !knob.dragging && clicked === null} click={clicked !== null}
                label={confirming ? 'ガチャガチャ。確定すると回せます' : undefined} onHandleTap={turning ? oneTurn : undefined} knob={knob.handlers}
                effect={effect} capsule={dropped ? (landed ? 'lit' : 'out') : 'none'}
              />
              {/* 3 回転の直後、取り出し口からカプセルが出て受け皿に着地する（click3 421:9289〜 S5 380:3371 / 3391 / 3411）。光り方で当たりが分かる */}
              {dropped && <Capsule glow={dropped.prize.glow} className={`is-mini${landed ? ' is-landed' : ''}`} />}
            </div>
            {confirming ? (
              <>
                <h2 className="confirm-title">1回だけ引きます</h2>
                <div className="pay-card confirm-card">
                  <p className="pay-need">必要 <b>{coinText(quote.price)}</b> デモコイン</p>
                  <p className="pay-balance">所持 {coinText(quote.balance)} <span aria-hidden="true">→</span><span className="visually-hidden">から</span> 確定後 {coinText(quote.after)}</p>
                  <p className="fine confirm-lead">確定後に{TURNS}回転。つまみを右に丸くなぞるか、ボタンで進めます。</p>
                  <p className="fine">確率と在庫は確定直前に再確認。</p>
                </div>
                <button type="button" className="btn btn-main btn-block" onClick={confirm}>{coinText(quote.price)}使って1回引く</button>
              </>
            ) : (
              <>
                <div className="turn-row">
                  <p className="turn-count" aria-live="polite">回転 {turns} / {TURNS}</p>
                  {/* featured の turn3 から: 札（マスター 421:9403）。当たりの回だけ出す */}
                  {effect.tag && <p className="turn-tag">きらきら… いい予感！</p>}
                </div>
                <p className="spin-lead" aria-live="polite">{lead}</p>
                <p className="fine spin-sub">{sub}</p>
                {/* 1 周した瞬間、その分のバーが --main で点灯してから --primary に落ち着く */}
                <p className="turn-bars" aria-hidden="true">{Array.from({ length: TURNS }, (_, i) => <span key={i} className={i < turns ? (clicked === i + 1 ? 'on is-new' : 'on') : ''} />)}</p>
                <button ref={turnButton} type="button" className="btn btn-outline btn-block" onClick={oneTurn} disabled={phase !== 'turning'}>1タップで1回転</button>
                <p className="fine spent">{coinText(gacha.price)}コイン使用済み・残高{coinText(state.coins)}</p>
              </>
            )}
            <ExampleNotice />
          </main>
          {confirming && <TabBar active="gacha" />}
        </>
      )}
    </div>
  )
}

interface OpenProps { won: Won; gacha: Gacha; balance: number; revealed: boolean; onReveal: () => void; onTap: () => void }

const CAPSULE_STAGES: CapsuleStage[] = ['closed', 'crack', 'apart']

/**
 * 開封（マスター 267:8387 / 8404 / 8421）と今回の結果（267:8438）。
 * 光り方にかかわらず、いつも3回タップで開く。カプセルは光り方で3種の見た目（部品 376:11670）で、開ける前から当たりが分かる。
 * 動きを減らす設定でも、段階の絵と文字で進む。
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
          <Capsule glow={won.prize.glow} stage={stage} className={taps > 0 && !opening ? `shake-${Math.min(taps, 2)}` : ''} onClick={tap} />
          <p className="open-step" aria-live="polite">開封 {step} / {OPEN_TAPS}</p>
          <p className="open-sub">ゆっくり、好きなタイミングで。</p>
          <p className="turn-bars" aria-hidden="true">{Array.from({ length: OPEN_TAPS }, (_, i) => <span key={i} className={i < step ? 'on' : ''} />)}</p>
          <button ref={ref} type="button" className="btn btn-main btn-block open-tap" onClick={tap} aria-label={`${capsuleName(won.prize.glow)}をタップ（あと${Math.max(OPEN_TAPS - taps, 0)}回であきます）`}>カプセルをタップ</button>
          <ExampleNotice />
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
        <ExampleNotice />
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
            <p className="fine">コインの購入や決済は、開発中のためまだありません。</p>
          </>
        )}
        <a className="btn btn-outline btn-block" href={paths.gachaList}>ガチャ一覧に戻る</a>
        <ExampleNotice />
      </main>
      <TabBar active="gacha" />
    </div>
  )
}
