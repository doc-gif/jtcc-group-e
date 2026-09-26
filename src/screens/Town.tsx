import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion, useApp } from '../app/appContext'
import { OPENING_TIMING, shouldShowOpening } from '../app/opening'
import { LOADING_DELAY, useAssetStatus, useDelayed, type AssetGate } from '../app/assets'
import { paths } from '../app/router'
import { townFeature } from '../app/townAssets'
import { CoinPill, MockNotice, SaveWarning, TabBar } from '../components/Chrome'
import { GoodsImage } from '../components/Goods'
import { TownMapLayer, TownViewport } from '../components/TownMap'

const OPENING_COPY = {
  first: { title: ['好きが集まる、', 'あなたの街へ。'], lead: ['見つける。集める。見せ合う。', '今日のひとつに、会いにいこう。'], action: 'すぐに街へ' },
  second: { title: ['いっしょに、', 'わくわくを開けよう。'], lead: ['ガチャのお店や、コレクション。', '気になる場所をのぞいてみよう。'], action: 'すぐに街へ' },
  /** 動きを減らす設定のとき（267:8254）。1枚だけにして、自動では進めない。 */
  still: { title: ['ようこそ、', 'ラストピースへ。'], lead: ['お気に入りが見つかる街。', '自分のペースで楽しもう。'], action: '街へ' },
}

/** 読み込み中（267:8244）の文。進み具合の数字は出さない（本当の割合が分からないため）。 */
const LOADING_COPY = {
  loading: { title: '街の準備をしています', lead: ['先に街を見て回れます。', '準備ができたら、そのまま街へ進みます。'] },
  error: { title: '街の準備ができませんでした', lead: ['通信の状態を確かめて、もう一度読み込んでください。', '先に街を見ることもできます。'] },
}

/** 導入 → （待つときだけ）読み込み中 → 街。wait は読み込み中を出す前の短い猶予（LOADING_DELAY）。 */
type View = 'opening' | 'wait' | 'loading' | 'home'

function focusTitle() {
  if (typeof window.scrollTo === 'function' && !/jsdom/i.test(navigator.userAgent)) window.scrollTo(0, 0)
  const title = document.getElementById('page-title')
  if (title && (document.activeElement === document.body || document.activeElement === null)) title.focus({ preventScroll: true })
}

/**
 * 街（ホーム）。アプリを開いた直後は導入をはさむ。
 * 街の絵などがまだ準備できていなければ、LOADING_DELAY 待っても準備できないときだけ読み込み中を出す。
 * すでに準備できていれば読み込み中は出さない（わざと待たせない）。
 */
export function Town({ assets }: { assets: AssetGate }) {
  const status = useAssetStatus(assets)
  const [fromOpening] = useState(() => shouldShowOpening(window.location.hash))
  const [view, setView] = useState<View>(fromOpening ? 'opening' : 'wait')
  const finished = useRef(false)
  const waited = useDelayed(view === 'wait' && status === 'loading', LOADING_DELAY)
  const shown: View = view === 'opening' || view === 'home' ? view : status === 'ready' ? 'home' : status === 'error' || waited ? 'loading' : view
  // 一度出した読み込み中の画面は、もう一度読み込むあいだも出したままにする（猶予の空白に戻さない）
  const retry = () => { setView('loading'); assets.load() }
  const finish = () => {
    if (finished.current) return
    finished.current = true
    // 再読み込みや戻るで導入をくり返さないよう、街の URL に置き換える
    if (shouldShowOpening(window.location.hash)) window.history.replaceState(window.history.state, '', paths.town)
    setView('wait')
  }
  const previous = useRef(shown)
  useEffect(() => {
    const before = previous.current
    previous.current = shown
    if (before !== shown && (shown === 'loading' || shown === 'home')) focusTitle()
  }, [shown])
  // 導入のあとの猶予のあいだは導入を出したままにし、画面を一瞬空にしない
  if (shown === 'opening' || (shown === 'wait' && fromOpening)) return <Opening onDone={finish} />
  if (shown === 'wait') return <div className="screen" aria-busy="true" />
  if (shown === 'loading') return <TownLoading failed={status === 'error'} onEnter={() => setView('home')} onRetry={retry} />
  return <TownHome />
}

/**
 * 読み込み中（デザインマスター 267:8244「T07 / Loading / static」）。動きのない1枚。
 * 準備できたら自動で街へ進む。先に街を見ることもできる。失敗したらもう一度読み込める。
 */
function TownLoading({ failed, onEnter, onRetry }: { failed: boolean; onEnter: () => void; onRetry: () => void }) {
  const { state } = useApp()
  const copy = LOADING_COPY[failed ? 'error' : 'loading']
  // もう一度読み込むと押したボタンが消えるので、状態を伝える見出しへ焦点を移す
  useEffect(focusTitle, [failed])
  return (
    <div className="screen opening-screen loading-screen">
      <header className="opening-bar">
        <p className="opening-brand" lang="en">LASTPIECE</p>
        <button type="button" className="btn btn-outline opening-skip" onClick={onEnter}>スキップ</button>
      </header>
      <main className="opening-main">
        <div className="opening-town loading-town" aria-hidden="true" inert>
          <TownMapLayer interactive={false} winCount={state.wins.length} />
        </div>
        <div className="opening-copy" role="status" aria-busy={!failed}>
          <h1 id="page-title" tabIndex={-1}>{copy.title}</h1>
          <p className="lead opening-lead loading-lead">{copy.lead[0]}<br />{copy.lead[1]}</p>
        </div>
        {failed && <button key="retry" type="button" className="btn btn-main btn-block" onClick={onRetry}>もう一度読み込む</button>}
        <button key="enter" type="button" className={`btn ${failed ? 'btn-outline' : 'btn-main'} btn-block`} onClick={onEnter}>街を見る</button>
        <p className="opening-notice">提案モック・公式サービスではありません</p>
      </main>
    </div>
  )
}

function Opening({ onDone }: { onDone: () => void }) {
  const { state } = useApp()
  const [still] = useState(prefersReducedMotion)
  const [step, setStep] = useState<'first' | 'second'>('first')
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })
  useEffect(() => {
    if (still) return
    const second = window.setTimeout(() => setStep('second'), OPENING_TIMING.second)
    const end = window.setTimeout(() => done.current(), OPENING_TIMING.end)
    return () => { window.clearTimeout(second); window.clearTimeout(end) }
  }, [still])
  const copy = OPENING_COPY[still ? 'still' : step]
  return (
    <div className={`screen opening-screen${still ? ' is-still' : ''}`}>
      <header className="opening-bar">
        <p className="opening-brand" lang="en">LASTPIECE</p>
        <button type="button" className="btn btn-outline opening-skip" onClick={onDone}>スキップ</button>
      </header>
      <main className="opening-main">
        <div className="opening-town" aria-hidden="true" inert>
          <TownMapLayer interactive={false} winCount={state.wins.length} />
        </div>
        <div className="opening-copy">
          <h1 id="page-title" tabIndex={-1}><span key={step} className="opening-fade">{copy.title[0]}<br />{copy.title[1]}</span></h1>
          <p className="lead opening-lead"><span key={step} className="opening-fade">{copy.lead[0]}<br />{copy.lead[1]}</span></p>
        </div>
        <button type="button" className="btn btn-main btn-block" onClick={onDone}>{copy.action}</button>
        <p className="opening-notice">提案モック・公式サービスではありません</p>
      </main>
    </div>
  )
}

function TownHome() {
  const { state } = useApp()
  const { gacha, prize } = townFeature()
  const count = state.wins.length
  return (
    <div className="screen town-screen">
      <header className="town-header">
        <h1 id="page-title" tabIndex={-1}>ラストピース</h1>
        <CoinPill demo />
        <p className="town-disclaimer">提案モック・公式サービスではありません</p>
      </header>
      <main className="town-main">
        <div className="town-area">
          <h2 className="visually-hidden">街の地図</h2>
          <TownViewport winCount={count} />
          <p className="town-hint" aria-hidden="true">街をドラッグして探索</p>
        </div>
        <div className="content town-content">
          {!state.welcomed && <a className="welcome-card" href={paths.welcome}><b>はじめての方へ</b><span>ラストピースの遊び方とニックネーム ›</span></a>}
          <a className="feature-card" href={paths.gacha(gacha.id)}>
            <GoodsImage art={prize.art} glow={prize.glow} size="lg" />
            <span className="feature-copy">
              <span className="feature-kicker">注目のピース</span>
              <b className="feature-name">{prize.name}</b>
              <span className="feature-desc">{gacha.title}</span>
              <span className="feature-more">中身と確率を見る ›</span>
            </span>
          </a>
          <div className="town-actions">
            <a className="btn btn-main btn-block" href={paths.gachaList}>ガチャのお店へ</a>
            <a className="town-sub-link" href={paths.collection}>当てたもの {count}点・コレクションへ ›</a>
          </div>
          <SaveWarning />
          <MockNotice />
        </div>
      </main>
      <TabBar active="town" />
    </div>
  )
}
