import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../app/appContext'
import { buzz, chime, CHIMES, speak } from '../app/feedback'
import { paths } from '../app/router'
import { pipiLines } from '../copy/pipi'
import { findGacha } from '../domain/catalog'
import { DEMO_FRIENDS, shouldShowKakutei, spin, spinCheck, spinQuote, type SpinOutcome } from '../domain/game'
import { coinText, OPEN_TAPS, yen } from '../domain/odds'
import { openLine, revealLine, TIMING, turnEffect, TURNS } from '../domain/spinScript'
import type { Gacha, Prize } from '../domain/types'
import { MockNotice, PageHeader, SaveWarning, TabBar } from '../components/Chrome'
import { GoodsImage } from '../components/Goods'
import { LuxBackdrop } from '../components/LuxBackdrop'
import { Machine } from '../components/Machine'
import { Particles, type Burst } from '../components/Particles'
import { Pipi } from '../components/Pipi'
import { NotFound } from './NotFound'
import './gacha.css'

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

/**
 * 回す画面。ひとりで回す流れはデザインマスター T08（回す前 267:8335・回転 267:8348〜8374・開封 267:8387〜8421・結果 267:8438）に合わせる。
 * 筐体は静止の絵（267:10520）で、回転・開封の途中は戻る・下のタブを出さない。右のハンドルか「1タップで1回転」で進める。
 * 友達と回す（デモ）は T10 の画面を作るまで、これまでの演出（背景の豪華化・ピピ・確定の札）を残す。確定の札は本当に目玉のときだけ。
 */
function SpinStage({ gacha, mode }: { gacha: Gacha; mode: Mode }) {
  const { state, update } = useApp()
  const room = mode === 'room'
  const companions = room ? DEMO_FRIENDS : NO_FRIENDS
  const [round, setRound] = useState(0)
  const [won, setWon] = useState<Won | null>(null)
  const [turns, setTurns] = useState(0)
  const [phase, setPhase] = useState<Phase>('confirm')
  const [pipi, setPipi] = useState<{ text: string; cheer: boolean }>({ text: pipiLines.roomStart, cheer: false })
  const [chip, setChip] = useState<{ text: string; key: number } | null>(null)
  const [banner, setBanner] = useState<BigBanner | null>(null)
  const [burst, setBurst] = useState<Burst | null>(null)
  const [bubbles, setBubbles] = useState<Record<string, { text: string; key: number }>>({})
  const [progress, setProgress] = useState<number[]>(companions.map(() => 0))
  const shownTurns = useRef(0)
  const counter = useRef(0)
  const turnButton = useRef<HTMLButtonElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
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
  /** ピピのひとこと。ピピが出るのは友達と回す（デモ）だけ（ひとりで回す画面のマスターにはいない）。 */
  const talk = useCallback((text: string, cheer = false) => {
    if (!room) return
    setPipi({ text, cheer })
    if (voiceOn) speak(text)
  }, [room, voiceOn])
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
    talk(pipiLines.roomStart)
  }

  // 押したボタンが消えるので、次に押すボタンへ焦点を移す（確定 →「1タップで1回転」、もう1回 → 確定）
  useEffect(() => {
    if (phase === 'turning' && turns === 0) turnButton.current?.focus()
    if (phase === 'confirm' && round > 0) confirmButton.current?.focus()
  }, [phase, turns, round])

  /** 右のハンドルか「1タップで1回転」で、1回転ずつ進める。 */
  const oneTurn = () => {
    if (phase !== 'turning' || !won) return
    setTurns((value) => Math.min(value + 1, TURNS))
  }

  // 1 回転ごとの演出。ひとりで回すときは音（ON のときだけ）とハンドルの動きだけで、筐体・背景は変えない
  useEffect(() => {
    if (!won || turns <= shownTurns.current) return
    for (let turn = shownTurns.current + 1; turn <= turns; turn += 1) {
      if (!room) {
        ring(CHIMES.turn, turn === TURNS ? [40, 60, 80] : 30)
        continue
      }
      const effect = turnEffect(turn, won.prize.glow, true)
      talk(effect.pipi, turn === 3 || Boolean(effect.banner))
      setChip({ text: effect.chip, key: turn })
      if (effect.banner && (effect.banner.kind !== 'kakutei' || shouldShowKakutei(won.prize))) setBanner({ ...effect.banner, key: turn })
      if (effect.friendLine) say(companions[turn % companions.length], effect.friendLine)
      fire(effect.hearts, effect.sparkles, won.prize.glow === 'featured' && turn >= 2)
      ring(turn === 2 && won.prize.glow === 'featured' ? CHIMES.big : CHIMES.turn, turn === 3 ? [40, 60, 80] : 30)
    }
    shownTurns.current = turns
    if (turns === TURNS) setPhase('dropping')
  }, [turns, won, room, companions, fire, say, talk, ring])

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

  const again = () => {
    setRound((value) => value + 1)
    setWon(null); setTurns(0); setPhase('confirm'); setBanner(null); setChip(null); setBurst(null); setBubbles({})
    setProgress(companions.map(() => 0)); shownTurns.current = 0
    talk(pipiLines.again)
  }

  const onReveal = () => {
    if (!won) return
    setPhase('revealed')
    ring(won.prize.glow === 'normal' ? [784, 988, 1175] : CHIMES.big, [60, 40, 90])
    if (!room) return
    talk(revealLine(won.prize.glow), true)
    fire(14, won.prize.glow === 'normal' ? 12 : 30, won.prize.glow === 'featured')
    if (won.prize.glow === 'featured') setBanner({ title: 'おめでとうございます！', sub: '✦ すごーい！ ✦', kind: 'congrats', key: nextKey() })
    say(companions[0], won.prize.glow === 'featured' ? 'えー！すごーい！！' : 'かわいい〜！')
  }

  if (problem) return <SpinProblem gacha={gacha} problem={problem} />

  const kakutei = Boolean(room && won && shouldShowKakutei(won.prize) && turns >= 2)
  const status = (index: number) => phase === 'confirm' ? '準備OK' : progress[index] >= 1 ? '出た！' : `${Math.floor(progress[index] * TURNS)} / ${TURNS} 回転`
  const confirming = phase === 'confirm'
  const opened = phase === 'opening' || phase === 'revealed' || phase === 'board'
  const quote = spinQuote(state, gacha)

  return (
    <div className={`screen spin-screen${kakutei ? ' is-kakutei' : ''}${confirming ? ' is-confirm' : ''}`}>
      {room && !opened && <LuxBackdrop level={turns} kakutei={kakutei} />}
      {won && opened ? (
        <OpenScene key={round} won={won} gacha={gacha} mode={mode} balance={state.coins} onReveal={onReveal} onTap={() => ring(CHIMES.tap, 30)}
          onBoard={() => setPhase('board')} revealed={phase !== 'opening'} />
      ) : (
        <>
          <PageHeader title={confirming ? '回す前に' : 'ハンドルを回す'} back={confirming ? paths.gacha(gacha.id) : undefined}>
            {room && <p className="page-header-sub">{`${gacha.title}・ROOM・${companions.length + 1}人でいっしょに（友達はデモ）`}</p>}
          </PageHeader>
          <main className="content spin-content">
            {room && (
              <ul className="spin-members" aria-label="ルームのメンバー">
                <MemberRing name={state.nickname} me progress={turns / TURNS} bubble={bubbles.me} status={confirming ? '確認中' : turns >= TURNS ? '開封中…' : `${turns} / ${TURNS} 回転`} />
                {companions.map((name, index) => <MemberRing key={name} name={name} progress={progress[index]} bubble={bubbles[name]} status={status(index)} />)}
              </ul>
            )}
            <div className="machine-wrap">
              <Machine turns={turns} label={confirming ? 'ガチャガチャ。確定すると回せます' : undefined} onHandleTap={phase === 'turning' ? oneTurn : undefined} />
              {chip && <span key={chip.key} className="turn-chip" aria-hidden="true">{chip.text}</span>}
              {room && <Particles burst={burst} />}
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
                <button ref={confirmButton} type="button" className="btn btn-main btn-block" onClick={confirm}>{coinText(quote.price)}使って1回引く</button>
              </>
            ) : (
              <>
                <p className="turn-count" aria-live="polite">回転 {turns} / {TURNS}</p>
                <p className="spin-lead">右のハンドルをタップして進めます</p>
                <p className="fine spin-sub">下のボタンでも同じように進められます。</p>
                <p className="turn-bars" aria-hidden="true">{Array.from({ length: TURNS }, (_, i) => <span key={i} className={i < turns ? 'on' : ''} />)}</p>
                {room && <Pipi text={pipi.text} cheer={pipi.cheer} />}
                <button ref={turnButton} type="button" className="btn btn-outline btn-block" onClick={oneTurn} disabled={phase !== 'turning'}>1タップで1回転</button>
                <p className="fine spent">{coinText(gacha.price)}コイン使用済み・残高{coinText(state.coins)}</p>
                {room && <p className="fine">確定演出は、本当に目玉が出るときだけ出ます。</p>}
              </>
            )}
            <MockNotice />
          </main>
          {!room && confirming && <TabBar active="gacha" />}
        </>
      )}
      {room && phase !== 'board' && <StampBar onStamp={(text) => say('me', text)} />}
      {banner && <div key={banner.key} className={`big-banner ${banner.kind}`} role="status"><b>{banner.title}</b><small>{banner.sub}</small></div>}
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

interface OpenProps { won: Won; gacha: Gacha; mode: Mode; balance: number; revealed: boolean; onReveal: () => void; onTap: () => void; onBoard: () => void }

/** カプセルの見た目の段階（マスター 267:8387 閉じている → 8404 すきまがあく → 8421 ふたが離れる）。 */
const CAPSULE_STAGES = ['closed', 'crack', 'apart'] as const

/**
 * 開封（マスター 267:8387 / 8404 / 8421）と今回の結果（267:8438）。
 * 光り方にかかわらず、いつも3回タップで開く（カプセルの見た目も同じ）。動きを減らす設定でも、段階の絵と文字で進む。
 * 開封の途中は戻る・下のタブを出さない。結果は保存済みなので、結果の画面からは戻れる。
 */
function OpenScene({ won, gacha, mode, balance, revealed, onReveal, onTap, onBoard }: OpenProps) {
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
        {mode === 'room'
          ? <button type="button" className="btn btn-lux btn-block" onClick={onBoard}>みんなの結果を見る</button>
          : <a className="btn btn-main btn-block" href={paths.town}>街へ戻る</a>}
        <MockNotice />
      </main>
    </>
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
        <MockNotice />
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
