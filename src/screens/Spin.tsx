import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useApp } from '../app/appContext'
import { buzz, chime, CHIMES, speak } from '../app/feedback'
import { paths } from '../app/router'
import { pipiLines } from '../copy/pipi'
import { findGacha } from '../domain/catalog'
import { DEMO_FRIENDS, shouldShowKakutei, spin, spinCheck, spinQuote, type SpinOutcome } from '../domain/game'
import { coinText, tapsToOpen, yen } from '../domain/odds'
import { openLine, revealLine, tapMessage, TIMING, turnEffect, TURNS } from '../domain/spinScript'
import type { Gacha, Prize } from '../domain/types'
import { BackBar, MockNotice, TabBar } from '../components/Chrome'
import { GoodsImage } from '../components/Goods'
import { LuxBackdrop } from '../components/LuxBackdrop'
import { Machine } from '../components/Machine'
import { Particles, type Burst } from '../components/Particles'
import { Pipi } from '../components/Pipi'
import { NotFound } from './NotFound'
import './gacha.css'

const TAU = Math.PI * 2
const FULL = TAU * TURNS
const NO_FRIENDS: string[] = []
/** 自分の表示名。初期のニックネーム「あなた」のときは重ねない。 */
const selfLabel = (name: string) => name === 'あなた' ? 'あなた' : `${name}（あなた）`
const STAMPS = ['かわいい！', 'おめでとう', 'いいな〜', '欲しかった！']

type Won = Extract<SpinOutcome, { ok: true }>
/** confirm: 回す前の確認（まだコインを使わない）→ turning: 3回転 → dropping → opening: 開封 → revealed: 結果 → board: みんなの結果 */
type Phase = 'confirm' | 'turning' | 'dropping' | 'opening' | 'revealed' | 'board'
interface BigBanner { title: string; sub: string; kind: 'kakutei' | 'chance' | 'congrats'; key: number }
type Mode = 'solo' | 'room'

export function Spin({ id, mode }: { id: string; mode: Mode }) {
  const gacha = findGacha(id)
  if (!gacha) return <NotFound />
  return <SpinStage key={`${id}-${mode}`} gacha={gacha} mode={mode} />
}

function SpinStage({ gacha, mode }: { gacha: Gacha; mode: Mode }) {
  const { state, update } = useApp()
  const companions = mode === 'room' ? DEMO_FRIENDS : NO_FRIENDS
  const [round, setRound] = useState(0)
  const [won, setWon] = useState<Won | null>(null)
  const [acc, setAcc] = useState(0)
  const [phase, setPhase] = useState<Phase>('confirm')
  const [pipi, setPipi] = useState<{ text: string; cheer: boolean }>({ text: mode === 'room' ? pipiLines.roomStart : pipiLines.soloStart, cheer: false })
  const [chip, setChip] = useState<{ text: string; key: number } | null>(null)
  const [banner, setBanner] = useState<BigBanner | null>(null)
  const [burst, setBurst] = useState<Burst | null>(null)
  const [bubbles, setBubbles] = useState<Record<string, { text: string; key: number }>>({})
  const [progress, setProgress] = useState<number[]>(companions.map(() => 0))
  const shownTurns = useRef(0)
  const lastAngle = useRef<number | null>(null)
  const counter = useRef(0)
  const turnButton = useRef<HTMLButtonElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const turns = Math.min(TURNS, Math.floor(acc / TAU + 1e-9))
  const glow = won?.prize.glow ?? 'normal'
  const problem = won ? null : spinCheck(state, gacha.id)
  const { voiceOn, soundOn } = state

  const nextKey = () => { counter.current += 1; return counter.current }
  const fire = useCallback((hearts: number, sparkles: number, gold = false) => {
    counter.current += 1
    setBurst({ id: counter.current, hearts, sparkles, gold })
  }, [])
  const say = useCallback((who: string, text: string) => {
    counter.current += 1
    setBubbles((current) => ({ ...current, [who]: { text, key: counter.current } }))
  }, [])
  const talk = useCallback((text: string, cheer = false) => {
    setPipi({ text, cheer })
    if (voiceOn) speak(text)
  }, [voiceOn])
  const ring = useCallback((notes: number[], pattern: number | number[] = 30) => {
    if (!soundOn) return
    chime(notes)
    buzz(pattern)
  }, [soundOn])

  // 大きな札は少しして消す（動きを減らす設定でも、表示してから消す）
  useEffect(() => {
    if (!banner) return
    const timer = window.setTimeout(() => setBanner(null), TIMING.banner)
    return () => window.clearTimeout(timer)
  }, [banner])

  useEffect(() => {
    if (!chip) return
    const timer = window.setTimeout(() => setChip(null), TIMING.chip)
    return () => window.clearTimeout(timer)
  }, [chip])

  // 吹き出しは少しして消す
  useEffect(() => {
    const keys = Object.keys(bubbles)
    if (keys.length === 0) return
    const timer = window.setTimeout(() => setBubbles({}), TIMING.bubble)
    return () => window.clearTimeout(timer)
  }, [bubbles])

  /** 確認のあとで初めてコインを使い、結果を決める。 */
  const confirm = () => {
    if (phase !== 'confirm' || won) return
    const result = spin(state, gacha.id, Math.random, companions, new Date())
    if (!result.ok) return
    update(() => result.state)
    setWon(result)
    setPhase('turning')
    talk(mode === 'room' ? pipiLines.roomStart : pipiLines.soloStart)
  }

  // 押したボタンが消えるので、次に押すボタンへ焦点を移す（確定 →「1タップで1回転」、もう1回 → 確定）
  useEffect(() => {
    if (phase === 'turning' && turns === 0) turnButton.current?.focus()
    if (phase === 'confirm' && round > 0) confirmButton.current?.focus()
  }, [phase, turns, round])

  const advance = (delta: number) => {
    if (delta <= 0 || phase !== 'turning' || !won) return
    setAcc((value) => Math.min(value + delta, FULL))
  }

  const oneTurn = () => {
    if (phase !== 'turning' || !won) return
    setAcc((value) => Math.min((Math.floor(value / TAU + 1e-9) + 1) * TAU, FULL))
  }

  // 1 回転ごとの演出
  useEffect(() => {
    if (!won || turns <= shownTurns.current) return
    for (let turn = shownTurns.current + 1; turn <= turns; turn += 1) {
      const effect = turnEffect(turn, won.prize.glow, companions.length > 0)
      talk(effect.pipi, turn === 3 || Boolean(effect.banner))
      setChip({ text: effect.chip, key: turn })
      if (effect.banner && (effect.banner.kind !== 'kakutei' || shouldShowKakutei(won.prize))) setBanner({ ...effect.banner, key: turn })
      if (effect.friendLine) say(companions[turn % companions.length], effect.friendLine)
      fire(effect.hearts, effect.sparkles, won.prize.glow === 'featured' && turn >= 2)
      ring(turn === 2 && won.prize.glow === 'featured' ? CHIMES.big : CHIMES.turn, turn === 3 ? [40, 60, 80] : 30)
    }
    shownTurns.current = turns
    if (turns === TURNS) setPhase('dropping')
  }, [turns, won, companions, fire, say, talk, ring])

  useEffect(() => {
    if (phase !== 'dropping' || !won) return
    const timer = window.setTimeout(() => { setPhase('opening'); talk(openLine(won.prize.glow)) }, TIMING.drop)
    return () => window.clearTimeout(timer)
  }, [phase, won, talk])

  // 友達（デモ）の進み具合
  const spinning = phase !== 'confirm' && companions.length > 0
  useEffect(() => {
    if (!spinning || progress.every((value) => value >= 1)) return
    const timer = window.setTimeout(() => setProgress((list) => list.map((value, index) => Math.min(1, value + 0.022 + index * 0.006))), TIMING.friendTick)
    return () => window.clearTimeout(timer)
  }, [spinning, progress])

  const angleOf = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const scale = rect.width / 260
    return Math.atan2(event.clientY - (rect.top + 284 * scale), event.clientX - (rect.left + 130 * scale))
  }
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* 捕捉できない環境ではそのまま */ }
    lastAngle.current = angleOf(event)
  }
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (lastAngle.current === null) return
    const angle = angleOf(event)
    let delta = angle - lastAngle.current
    if (delta > Math.PI) delta -= TAU
    if (delta < -Math.PI) delta += TAU
    lastAngle.current = angle
    advance(delta)
  }
  const onPointerUp = () => { lastAngle.current = null }

  const again = () => {
    setRound((value) => value + 1)
    setWon(null); setAcc(0); setPhase('confirm'); setBanner(null); setChip(null); setBurst(null); setBubbles({})
    setProgress(companions.map(() => 0)); shownTurns.current = 0
    talk(pipiLines.again)
  }

  const onReveal = () => {
    if (!won) return
    setPhase('revealed')
    talk(revealLine(won.prize.glow), true)
    fire(14, won.prize.glow === 'normal' ? 12 : 30, won.prize.glow === 'featured')
    ring(won.prize.glow === 'normal' ? [784, 988, 1175] : CHIMES.big, [60, 40, 90])
    if (won.prize.glow === 'featured') setBanner({ title: 'おめでとうございます！', sub: '✦ すごーい！ ✦', kind: 'congrats', key: nextKey() })
    if (companions.length > 0) say(companions[0], won.prize.glow === 'featured' ? 'えー！すごーい！！' : 'かわいい〜！')
  }

  if (problem) return <SpinProblem gacha={gacha} problem={problem} />

  const machineClass = [
    turns >= 1 ? 'lv1' : '', turns >= 2 ? 'lv2' : '', turns >= 3 ? 'lv3' : '',
    won && turns >= 1 ? `bow-${glow}` : '', won && turns >= 2 && glow !== 'normal' ? `cap-${glow}` : '',
  ].filter(Boolean).join(' ')
  const kakutei = Boolean(won && shouldShowKakutei(won.prize) && turns >= 2)
  const status = (index: number) => phase === 'confirm' ? '準備OK' : progress[index] >= 1 ? '出た！' : `${Math.floor(progress[index] * TURNS)} / ${TURNS} 回転`
  const confirming = phase === 'confirm'
  const quote = spinQuote(state, gacha)

  return (
    <div className={`screen spin-screen${kakutei ? ' is-kakutei' : ''}${confirming ? ' is-confirm' : ''}`}>
      <LuxBackdrop level={turns} kakutei={kakutei} />
      <BackBar title={confirming ? '回す前に' : 'ハンドルを回す'} back={paths.gacha(gacha.id)} backLabel="詳細へ">
        <p className="backbar-sub">{confirming ? gacha.title : mode === 'room' ? `${gacha.title}・ROOM・${companions.length + 1}人でいっしょに（友達はデモ）` : `${gacha.title}・ひとりで回す`}</p>
      </BackBar>
      <main className="content spin-content">
        {mode === 'room' && (
          <ul className="spin-members" aria-label="ルームのメンバー">
            <MemberRing name={state.nickname} me progress={acc / FULL} bubble={bubbles.me} status={confirming ? '確認中' : turns >= TURNS ? '開封中…' : `${turns} / ${TURNS} 回転`} />
            {companions.map((name, index) => <MemberRing key={name} name={name} progress={progress[index]} bubble={bubbles[name]} status={status(index)} />)}
          </ul>
        )}
        <div className="machine-wrap">
          <Machine price={gacha.price} angle={acc} className={machineClass} label={confirming ? 'ガチャガチャ。確定すると回せます' : undefined}
            onPointerDown={confirming ? undefined : onPointerDown} onPointerMove={confirming ? undefined : onPointerMove} onPointerUp={confirming ? undefined : onPointerUp} />
          {!confirming && phase !== 'turning' && <span className={`drop-cap cap-${glow}`} aria-hidden="true" />}
          {chip && <span key={chip.key} className="turn-chip" aria-hidden="true">{chip.text}</span>}
          <Particles burst={burst} />
        </div>
        {confirming ? (
          <>
            <h2 className="confirm-title">1回だけ引きます</h2>
            <div className="pay-card">
              <p className="pay-need">必要 <b>{coinText(quote.price)}</b> コイン</p>
              <p className="pay-balance">所持 {coinText(quote.balance)} <span aria-hidden="true">→</span><span className="visually-hidden">から</span> 確定後 {coinText(quote.after)}</p>
              <p className="fine confirm-lead">確定すると結果が決まり、{TURNS}回転で出てきます。ハンドルかボタンで進めます。確率と残りは、確定の直前にもう一度確かめます。</p>
            </div>
            <button ref={confirmButton} type="button" className="btn btn-main btn-block" onClick={confirm}>{coinText(quote.price)}コイン使って1回引く</button>
          </>
        ) : (
          <>
            <p className="turn-count" aria-live="polite">{phase === 'turning' ? `回転 ${turns} / ${TURNS}` : 'ガチャが出たよ！'}</p>
            <p className="turn-bars" aria-hidden="true">{Array.from({ length: TURNS }, (_, i) => <span key={i} className={i < turns ? 'on' : ''} />)}</p>
            <p className="lead spin-lead">ハンドルを指で時計回りになぞるか、下のボタンで進めます。</p>
            <Pipi text={pipi.text} cheer={pipi.cheer} />
            <button ref={turnButton} type="button" className="btn btn-outline btn-block" onClick={oneTurn} disabled={phase !== 'turning'}>1タップで1回転</button>
            <p className="fine spent">{coinText(gacha.price)}コイン使用済み・残高 {coinText(state.coins)}</p>
            <p className="fine">確定演出は、本当に目玉が出るときだけ出ます。</p>
          </>
        )}
        <MockNotice />
      </main>
      {mode === 'room' && phase !== 'board' && <StampBar onStamp={(text) => say('me', text)} />}
      {banner && <div key={banner.key} className={`big-banner ${banner.kind}`} role="status"><b>{banner.title}</b><small>{banner.sub}</small></div>}
      {won && (phase === 'opening' || phase === 'revealed') && (
        <OpenScene key={round} won={won} gacha={gacha} mode={mode} balance={state.coins} onReveal={onReveal} onTap={() => ring(CHIMES.tap, 30)}
          onBoard={() => setPhase('board')} onAgain={again} canAgain={spinCheck(state, gacha.id) === null} revealed={phase === 'revealed'} />
      )}
      {won && phase === 'board' && (
        <ResultBoard won={won} gacha={gacha} nickname={state.nickname} onAgain={again} canAgain={spinCheck(state, gacha.id) === null}
          onFriendReveal={(name, prize) => {
            if (prize?.glow === 'featured') { setBanner({ title: 'おめでとうございます！', sub: `${name} に目玉が出た！`, kind: 'congrats', key: nextKey() }); talk(pipiLines.friendFeatured(name), true); fire(10, 30, true) }
            if (prize?.id === won.prize.id) { talk(pipiLines.pair(name), true); fire(10, 20) }
            ring([988])
          }} />
      )}
    </div>
  )
}

function MemberRing({ name, progress, status, bubble, me = false }: { name: string; progress: number; status: string; bubble?: { text: string; key: number }; me?: boolean }) {
  const circumference = 2 * Math.PI * 28
  return (
    <li className={`member${me ? ' me' : ''}`}>
      {bubble && <span key={bubble.key} className="member-bubble" role="status">{bubble.text}</span>}
      <span className="ring" aria-hidden="true">
        <svg viewBox="0 0 62 62"><circle className="ring-bg" cx="31" cy="31" r="28" /><circle className="ring-fg" cx="31" cy="31" r="28" strokeDasharray={`${circumference * Math.min(progress, 1)} ${circumference}`} /></svg>
        <span>{name.slice(0, 1)}</span>
      </span>
      <b>{me ? selfLabel(name) : `${name}（デモ）`}</b>
      <small>{status}</small>
    </li>
  )
}

function StampBar({ onStamp }: { onStamp: (text: string) => void }) {
  return (
    <div className="stampbar" role="group" aria-label="スタンプを送る">
      {STAMPS.map((text) => <button key={text} type="button" className="chip" onClick={() => onStamp(text)}>{text}</button>)}
    </div>
  )
}

interface OpenProps { won: Won; gacha: Gacha; mode: Mode; balance: number; revealed: boolean; onReveal: () => void; onTap: () => void; onBoard: () => void; onAgain: () => void; canAgain: boolean }

/** カプセルの見た目の段階。閉じている → すきまが光る → ふたが離れる。 */
const CAPSULE_STAGES = ['closed', 'crack', 'apart'] as const

/**
 * 開封（マスター 267:8387 / 8404 / 8421）と今回の結果（267:8438）。
 * タップの回数は光り方で決まる（ほか1回・キラキラ2回・目玉3回）。動きを減らす設定でも、段階の絵と文字で進む。
 */
function OpenScene({ won, gacha, mode, balance, revealed, onReveal, onTap, onBoard, onAgain, canAgain }: OpenProps) {
  const need = tapsToOpen(won.prize.glow)
  const [taps, setTaps] = useState(0)
  const [opening, setOpening] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const resultRef = useRef<HTMLHeadingElement>(null)
  const revealRef = useRef(onReveal)
  useEffect(() => { revealRef.current = onReveal })
  useEffect(() => { ref.current?.focus() }, [])
  // 結果が出たら、タップのボタンが消えるので結果の見出しへ焦点を移す
  useEffect(() => { if (revealed) resultRef.current?.focus() }, [revealed])
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
    if (next >= need) setOpening(true)
  }
  const step = opening ? need : taps + 1
  const stage = opening ? 'apart' : CAPSULE_STAGES[Math.min(taps, CAPSULE_STAGES.length - 1)]
  return (
    <div className={`open-scene glow-${won.prize.glow}${revealed ? ' is-revealed' : ''}`} role="dialog" aria-modal="true" aria-labelledby="open-title">
      {!revealed ? (
        <div className="open-stage">
          <h2 id="open-title" className="open-title">カプセルをひらく</h2>
          {/* 指で押しやすい大きな絵。キーボードと読み上げでは下のボタンを使う */}
          <div className={`capsule-art stage-${stage}${taps > 0 && !opening ? ` shake-${Math.min(taps, 2)}` : ''}`} aria-hidden="true" onClick={tap}>
            <span className="capsule-glow" /><span className="capsule-top" /><span className="capsule-bottom" /><span className="capsule-band" /><span className="capsule-knob" />
          </div>
          <p className="open-step">開封 {step} / {need}</p>
          <p className="open-sub">ゆっくり、好きなタイミングで。</p>
          <p className="turn-bars" aria-hidden="true">{Array.from({ length: need }, (_, i) => <span key={i} className={i < step ? 'on' : ''} />)}</p>
          <p className="open-msg" aria-live="polite">{opening ? 'ひらくよ…！' : tapMessage(need - taps, need)}</p>
          <button ref={ref} type="button" className="btn btn-main btn-block open-tap" onClick={tap} aria-label={`カプセルをタップ（あと${Math.max(need - taps, 0)}回であきます）`}>カプセルをタップ</button>
        </div>
      ) : (
        <div className="prize-reveal">
          <p className="result-kicker">今回の結果</p>
          {won.prize.glow === 'featured' && <p className="congrats">おめでとうございます！</p>}
          <GoodsImage art={won.prize.art} glow={won.prize.glow} size="lg" />
          <h2 id="open-title" ref={resultRef} tabIndex={-1} className="reveal-name">{won.prize.name}</h2>
          <p className="versus"><span>使ったコイン<b>{coinText(gacha.price)}</b></span><span aria-hidden="true">→</span><span>当たった物<b>{yen(won.prize.refPrice)}<small>相当</small></b></span></p>
          <p className="result-meta">{coinText(gacha.price)}コイン使用・残高 {coinText(balance)}・1点を獲得</p>
          <p className="result-saved">この1点は「当てたもの」に記録しました。</p>
          <p className="fine">検品済みの正規品として扱う想定です。参考価格は目安で、買取額や交換額ではありません。</p>
          <div className="reveal-actions">
            {mode === 'room' ? (
              <button type="button" className="btn btn-lux btn-block" onClick={onBoard}>みんなの結果を見る</button>
            ) : (
              <>
                <a className="btn btn-main btn-block" href={paths.collection}>当てたものを見る</a>
                <button type="button" className="btn btn-outline btn-block" onClick={onAgain} disabled={!canAgain}>{canAgain ? 'もう1回まわす' : 'コインが足りないか、売り切れです'}</button>
                <a className="btn btn-text btn-block" href={paths.town}>街へ戻る</a>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface BoardProps { won: Won; gacha: Gacha; nickname: string; onAgain: () => void; canAgain: boolean; onFriendReveal: (name: string, prize: Prize | null) => void }

function ResultBoard({ won, gacha, nickname, onAgain, canAgain, onFriendReveal }: BoardProps) {
  const [shown, setShown] = useState(0)
  const [likes, setLikes] = useState<string[]>([])
  const ref = useRef<HTMLHeadingElement>(null)
  const revealRef = useRef(onFriendReveal)
  useEffect(() => { revealRef.current = onFriendReveal })
  useEffect(() => { ref.current?.focus() }, [])
  useEffect(() => {
    if (shown >= won.friends.length) return
    const timer = window.setTimeout(() => {
      const friend = won.friends[shown]
      revealRef.current(friend.name, friend.prize)
      setShown((value) => value + 1)
    }, TIMING.friendReveal)
    return () => window.clearTimeout(timer)
  }, [shown, won.friends])
  const visible = won.friends.slice(0, shown)
  const prizes: Prize[] = [won.prize, ...visible.flatMap((friend) => friend.prize ? [friend.prize] : [])]
  const total = prizes.reduce((sum, prize) => sum + prize.refPrice, 0)
  const pair = visible.find((friend) => friend.prize?.id === won.prize.id)
  return (
    <div className="board-layer" role="dialog" aria-modal="true" aria-labelledby="board-title">
      <div className="board">
        <h2 id="board-title" ref={ref} tabIndex={-1}>みんなの結果<small>同じルームの{won.friends.length + 1}人</small></h2>
        <div className="board-total">
          <p><small>あなた</small><b>{coinText(gacha.price)}<em>コイン</em></b><span aria-hidden="true">→</span><b>{yen(won.prize.refPrice)}<em>相当</em></b></p>
          <p><small>みんなで（{prizes.length}人）</small><b>{coinText(gacha.price * prizes.length)}<em>コイン</em></b><span aria-hidden="true">→</span><b>{yen(total)}<em>相当</em></b></p>
        </div>
        <ul className="board-rows">
          <li className={`board-row me glow-${won.prize.glow}`}><GoodsImage art={won.prize.art} glow={won.prize.glow} size="sm" /><div><b>{selfLabel(nickname)}</b><span>{won.prize.name}</span><small>{yen(won.prize.refPrice)}相当</small></div></li>
          {won.friends.map((friend, index) => index < shown ? (
            <li key={friend.name} className={`board-row glow-${friend.prize?.glow ?? 'normal'}`}>
              {friend.prize && <GoodsImage art={friend.prize.art} glow={friend.prize.glow} size="sm" />}
              <div><b>{friend.name}（デモ）</b><span>{friend.prize ? friend.prize.name : '売り切れで回せませんでした'}</span>{friend.prize && <small>{yen(friend.prize.refPrice)}相当</small>}</div>
              {friend.prize && (
                <button type="button" className="chip like" aria-pressed={likes.includes(friend.name)} onClick={() => setLikes((list) => list.includes(friend.name) ? list : [...list, friend.name])}>
                  {likes.includes(friend.name) ? '送った♡' : 'いいな〜'}<span className="visually-hidden">（{friend.name}へ）</span>
                </button>
              )}
            </li>
          ) : (
            <li key={friend.name} className="board-row waiting"><span className="goods goods-sm" aria-hidden="true">?</span><div><b>{friend.name}（デモ）</b><span>カプセルを開けています…</span></div></li>
          ))}
        </ul>
        {pair && <p className="osoroi" role="status">✦ {pair.name}と おそろい！ ✦<small>{won.prize.name} を2人で当てました</small></p>}
        <div className="reveal-actions">
          <button type="button" className="btn btn-lux btn-block" onClick={onAgain} disabled={!canAgain}>{canAgain ? 'もう1回、みんなで回す' : 'コインが足りないか、売り切れです'}</button>
          <a className="btn btn-outline btn-block" href={paths.collection}>当てたものを見る</a>
        </div>
        <p className="fine">友達の結果はデモの再現です。結果を画像で保存・シェアする機能は次のフェーズで作ります。当てた物は「当てたもの」から届けてもらうか、コインに交換できます。</p>
      </div>
    </div>
  )
}

/** 売り切れ（マスター 267:8450）とコイン不足（267:8461）。回す操作は出さず、コインは減らさない。 */
function SpinProblem({ gacha, problem }: { gacha: Gacha; problem: NonNullable<ReturnType<typeof spinCheck>> }) {
  const { state } = useApp()
  const quote = spinQuote(state, gacha)
  const soldOut = problem !== 'insufficient-coins'
  return (
    <div className="screen">
      <BackBar title={soldOut ? '売り切れ' : 'コイン不足'} back={paths.gacha(gacha.id)} backLabel="詳細へ">
        <p className="backbar-sub">{gacha.title}</p>
      </BackBar>
      <main className="content problem-content">
        {soldOut ? (
          <>
            <div className="machine-wrap is-soldout">
              <Machine price={gacha.price} angle={0} className="soldout" label="売り切れのガチャガチャ。回せません" />
            </div>
            <h2 className="problem-title">このガチャは売り切れです</h2>
            <p className="lead problem-lead">抽選はできません。コインは減っていません。</p>
            <p className="fine">次の入荷の時期は決まっていません。</p>
            <a className="btn btn-outline btn-block" href={paths.gachaList}>ガチャ一覧に戻る</a>
          </>
        ) : (
          <>
            <div className="short-card">
              <p className="short-main">あと <b>{coinText(quote.shortBy)}</b> コイン</p>
              <p>所持 {coinText(quote.balance)}</p>
              <p>必要 {coinText(quote.price)}</p>
            </div>
            <h2 className="problem-title">今回は引けません</h2>
            <p className="lead problem-lead">コインが足りません。残高はそのままです。</p>
            <p className="fine">コインの購入や決済は、この提案モックにはありません。マイページのデモ操作でコインを増やせます。</p>
            <a className="btn btn-main btn-block" href={paths.me}>マイページでコインを追加</a>
            <a className="btn btn-outline btn-block" href={paths.gachaList}>ガチャ一覧に戻る</a>
          </>
        )}
        <MockNotice />
      </main>
      <TabBar active="gacha" />
    </div>
  )
}
