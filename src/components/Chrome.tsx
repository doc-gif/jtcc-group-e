import type { ReactNode } from 'react'
import { asset, useApp } from '../app/appContext'
import { paths } from '../app/router'
import { coinText } from '../domain/odds'

/** コイン残高（マイページへ）とマイページへの入口。demo のときは「デモ」と文字でも示す。 */
export function CoinPill({ demo = false }: { demo?: boolean }) {
  const { state } = useApp()
  return (
    <div className="topbar-actions">
      <a className="coin-pill" href={paths.me} aria-label={`${demo ? 'デモの' : ''}コイン残高 ${coinText(state.coins)}。マイページでコインを追加`}>
        <img src={asset('assets/icons/coin.png')} alt="" width="22" height="22" />
        {demo && <span className="coin-demo">デモ</span>}
        <span>{coinText(state.coins)}</span>
      </a>
      <a className="icon-link" href={paths.me} aria-label="マイページ"><img src={asset('assets/icons/mypage.png')} alt="" width="28" height="28" /></a>
    </div>
  )
}

/** タブで行き来する画面の上部。 */
export function TopBar({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="topbar">
      <div className="topbar-title">
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

export type Tab = 'town' | 'gacha' | 'collection' | 'friend'

/** 下のタブのアイコン。選んでいるタブは塗りつぶして、色だけに頼らず示す。 */
function TabIcon({ id, active }: { id: Tab; active: boolean }) {
  const fill = active ? 'currentColor' : 'none'
  const common = { fill, fillOpacity: 0.22, stroke: 'currentColor', strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      {id === 'town' && <path {...common} d="M4 11.5 12 4.5l8 7V20h-5.5v-5.5h-5V20H4z" />}
      {id === 'gacha' && <><circle {...common} cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" fill="currentColor" /></>}
      {id === 'collection' && <path {...common} d="M12 3.5 20 12l-8 8.5L4 12z" />}
      {id === 'friend' && <path {...common} d="M12 20s-7.5-4.6-7.5-10.2A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z" />}
    </svg>
  )
}

/**
 * 共通の下のタブ（デザインマスター 267:8198 の 4 タブ）。
 * コレクションは「わたしの棚」、フレンドは友だち（デモ）の入口（F04・T09）。
 */
export function TabBar({ active }: { active?: Tab }) {
  const tabs: Array<{ id: Tab; label: string; href: string }> = [
    { id: 'town', label: '街', href: paths.town },
    { id: 'gacha', label: 'ガチャ', href: paths.gachaList },
    { id: 'collection', label: 'コレクション', href: paths.shelf },
    { id: 'friend', label: 'フレンド', href: paths.together },
  ]
  return (
    <nav className="tabbar" aria-label="メイン">
      <ul className="tab-list">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <a href={tab.href} className="tab" aria-current={active === tab.id ? 'page' : undefined}>
              <TabIcon id={tab.id} active={active === tab.id} />
              <span>{tab.label}</span>
            </a>
          </li>
        ))}
      </ul>
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
