import type { ReactNode } from 'react'
import { asset, useApp } from '../app/appContext'
import { paths } from '../app/router'
import { coinText } from '../domain/odds'
import './pageHeader.css'

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

/*
 * F14 サンリオの世界観の飾り（マスターの「F14 / BG」の雲、「Kitty bow / Lavender bow」のリボン、「Heart」「Star」）。
 * すべてコードで描いたオリジナルの図形で、キャラクターの絵・© 表記の札・サンリオのアセット画像は使わない
 * （docs/ADOPTED_DESIGN.md「実装時の境界」）。色は src/index.css の --lp-v2-sanrio-* だけ。読み上げには出さない。
 */

/** 白い雲（マスターの F14 / BG の右上）。 */
export function Cloud({ className = '' }: { className?: string }) {
  return (
    <svg className={`deco-cloud ${className}`.trim()} viewBox="0 0 64 29" aria-hidden="true" focusable="false">
      <path d="M14 29a9 9 0 0 1-2-17.8A12 12 0 0 1 35 8a9 9 0 0 1 14 5.5A8 8 0 0 1 56 29z" />
    </svg>
  )
}

/** リボン（マスターのカードの留めのリボン・題のリボン）。tone は赤かラベンダー。 */
export function Bow({ className = '', tone = 'red' }: { className?: string; tone?: 'red' | 'lavender' }) {
  return (
    <svg className={`bow bow-${tone} ${className}`.trim()} viewBox="0 0 34 18" aria-hidden="true" focusable="false">
      <path className="bow-tail" d="M12.5 10 8 17.5h5l3-5zM21.5 10l4.5 7.5h-5l-3-5z" />
      <path className="bow-loop" d="M17 8.5C13 2.5 6.5.5 3.5 2.5.5 4.5 1 12.5 4 14.8c3 2.4 9-.8 13-6.3z" />
      <path className="bow-loop" d="M17 8.5c4-6 10.5-8 13.5-6 3 2 2.5 10-.5 12.3-3 2.4-9-.8-13-6.3z" />
      <circle className="bow-knot" cx="17" cy="8.5" r="3.6" />
      <circle className="bow-shine" cx="16" cy="7.4" r="1.1" />
    </svg>
  )
}

/** カードのまわりのハートと星（マスターの結果・詳細の飾り）。 */
export function Sparkles() {
  return (
    <span className="sparkles" aria-hidden="true">
      <svg className="sparkle sparkle-1" viewBox="0 0 12 11"><path d="M6 11 1.2 6.2A3.2 3.2 0 0 1 6 2a3.2 3.2 0 0 1 4.8 4.2z" /></svg>
      <svg className="sparkle sparkle-2" viewBox="0 0 12 12"><path d="m6 0 1.7 4.1L12 4.6 8.7 7.5l1 4.3L6 9.6 2.3 11.8l1-4.3L0 4.6l4.3-.5z" /></svg>
      <svg className="sparkle sparkle-3" viewBox="0 0 12 12"><path d="m6 0 1.7 4.1L12 4.6 8.7 7.5l1 4.3L6 9.6 2.3 11.8l1-4.3L0 4.6l4.3-.5z" /></svg>
      <svg className="sparkle sparkle-4" viewBox="0 0 12 11"><path d="M6 11 1.2 6.2A3.2 3.2 0 0 1 6 2a3.2 3.2 0 0 1 4.8 4.2z" /></svg>
    </span>
  )
}

/** タブで行き来する画面の上部。 */
export function TopBar({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="topbar">
      <Cloud />
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
      <Cloud />
      <a className="back-link" href={back}><span aria-hidden="true">‹</span>{backLabel}</a>
      <h1 id="page-title" tabIndex={-1}>{title}</h1>
      {children}
    </header>
  )
}

/**
 * デザインマスター（T08・T09）の上部。「開発中のサービス」の1行、枠付きの「戻る」、見出しの順に並べる。
 * 回転・開封の途中など、マスターに戻る操作がない画面では back を渡さない。
 */
export function PageHeader({ title, back, onBack, children }: {
  title: string; back?: string
  /** 画面の中の一段前へ戻る（URL が変わらないとき。共有ルームの詳細など）。 */
  onBack?: () => void
  children?: ReactNode
}) {
  return (
    <header className="page-header">
      <Cloud />
      <ServiceNotice className="page-header-notice" />
      <div className="page-header-row">
        {back && <a className="btn btn-outline page-header-back" href={back}>戻る</a>}
        {!back && onBack && <button type="button" className="btn btn-outline page-header-back" onClick={onBack}>戻る</button>}
        <h1 id="page-title" tabIndex={-1}>{title}</h1>
      </div>
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

/** 各画面の上部の1行（マスター T07〜T10。担当者の決定 #69）。 */
export const SERVICE_NOTICE = 'ラストピースは開発中のサービスです'

export function ServiceNotice({ className }: { className: string }) {
  return <p className={className}>{SERVICE_NOTICE}</p>
}

/** 各画面の下の注記。上部の1行がない入口（はじめに・ガチャのお店・マイページ）でも同じ1文を出す。 */
export function ExampleNotice() {
  return (
    <p className="mock-notice">
      {SERVICE_NOTICE}。商品・価格・在庫は例です。各権利者とは関係ありません。
    </p>
  )
}

export function SaveWarning() {
  const { saveFailed } = useApp()
  if (!saveFailed) return null
  return <p className="save-warning" role="status">この端末では記録を保存できません。遊べますが、再読み込みすると最初に戻ります。</p>
}
