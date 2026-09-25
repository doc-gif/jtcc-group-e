import type { ReactNode } from 'react'
import { asset, useApp } from '../app/appContext'
import { paths } from '../app/router'
import { coinText } from '../domain/odds'

export function CoinPill() {
  const { state } = useApp()
  return (
    <div className="topbar-actions">
      <a className="coin-pill" href={paths.me} aria-label={`コイン残高 ${coinText(state.coins)}。マイページでコインを追加`}>
        <img src={asset('assets/icons/coin.png')} alt="" width="22" height="22" />
        <span>{coinText(state.coins)}</span>
      </a>
      <a className="icon-link" href={paths.me} aria-label="マイページ"><img src={asset('assets/icons/mypage.png')} alt="" width="28" height="28" /></a>
    </div>
  )
}

/** タブで行き来する画面の上部。ホームではロゴを主見出しにする。 */
export function TopBar({ title, sub, brand = false }: { title: string; sub: string; brand?: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        {brand && <img className="topbar-logo" src={asset('assets/logo/logo.png')} alt="" width="40" height="40" />}
        <h1 id="page-title" tabIndex={-1}>{title}<small lang="en">{sub}</small></h1>
      </div>
      <CoinPill />
    </header>
  )
}

/** 詳細・演出など、戻り先がある画面の上部。 */
export function BackBar({ title, back, backLabel = 'もどる', children }: { title: string; back: string; backLabel?: string; children?: ReactNode }) {
  return (
    <header className="backbar">
      <a className="back-link" href={back}><span aria-hidden="true">‹</span>{backLabel}</a>
      <h1 id="page-title" tabIndex={-1}>{title}</h1>
      {children}
    </header>
  )
}

type Tab = 'home' | 'together' | 'collection'

export function TabBar({ active }: { active?: Tab }) {
  const tabs: Array<{ id: Tab; label: string; href: string; icon: string }> = [
    { id: 'home', label: 'ガチャ', href: paths.home, icon: 'gacha' },
    { id: 'together', label: 'いっしょに', href: paths.together, icon: 'together' },
    { id: 'collection', label: '当てたもの', href: paths.collection, icon: 'collection' },
  ]
  return (
    <nav className="tabbar" aria-label="メイン">
      {tabs.map((tab) => (
        <a key={tab.id} href={tab.href} className={`tab${tab.id === 'together' ? ' tab-mid' : ''}`} aria-current={active === tab.id ? 'page' : undefined}>
          <img src={asset(`assets/icons/${tab.icon}.png`)} alt="" width="30" height="30" />
          <span>{tab.label}</span>
        </a>
      ))}
    </nav>
  )
}

export function MockNotice() {
  return (
    <p className="mock-notice">
      提案モック・公式サービスではありません。掲載の商品・価格・在庫・確率は説明用の架空データで、各権利者とは関係ありません。
    </p>
  )
}

export function SaveWarning() {
  const { saveFailed } = useApp()
  if (!saveFailed) return null
  return <p className="save-warning" role="status">この端末では記録を保存できません。遊べますが、再読み込みすると最初に戻ります。</p>
}
