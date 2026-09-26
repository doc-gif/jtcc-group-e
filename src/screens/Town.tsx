import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion, useApp } from '../app/appContext'
import { OPENING_TIMING, shouldShowOpening } from '../app/opening'
import { paths } from '../app/router'
import { catalog } from '../domain/catalog'
import { CoinPill, MockNotice, SaveWarning, TabBar } from '../components/Chrome'
import { GoodsImage } from '../components/Goods'
import { TownMapLayer, TownViewport } from '../components/TownMap'

const OPENING_COPY = {
  first: { title: ['好きが集まる、', 'あなたの街へ。'], lead: ['見つける。集める。見せ合う。', '今日のひとつに、会いにいこう。'], action: 'すぐに街へ' },
  second: { title: ['いっしょに、', 'わくわくを開けよう。'], lead: ['ガチャのお店や、コレクション。', '気になる場所をのぞいてみよう。'], action: 'すぐに街へ' },
  /** 動きを減らす設定のとき（267:8254）。1枚だけにして、自動では進めない。 */
  still: { title: ['ようこそ、', 'ラストピースへ。'], lead: ['お気に入りが見つかる街。', '自分のペースで楽しもう。'], action: '街へ' },
}

/** 街（ホーム）。アプリを開いた直後は導入をはさむ。 */
export function Town() {
  const [opening, setOpening] = useState(() => shouldShowOpening(window.location.hash))
  const finished = useRef(false)
  const finish = () => {
    if (finished.current) return
    finished.current = true
    // 再読み込みや戻るで導入をくり返さないよう、街の URL に置き換える
    if (shouldShowOpening(window.location.hash)) window.history.replaceState(window.history.state, '', paths.town)
    setOpening(false)
  }
  useEffect(() => {
    if (opening || !finished.current) return
    if (typeof window.scrollTo === 'function' && !/jsdom/i.test(navigator.userAgent)) window.scrollTo(0, 0)
    const title = document.getElementById('page-title')
    if (title && (document.activeElement === document.body || document.activeElement === null)) title.focus({ preventScroll: true })
  }, [opening])
  return opening ? <Opening onDone={finish} /> : <TownHome />
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
        <div className="opening-town" aria-hidden="true">
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
  const gacha = catalog[0]
  const prize = gacha.prizes.find((item) => item.glow === 'featured') ?? gacha.prizes[0]
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
