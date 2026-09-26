import { useApp } from '../app/appContext'
import { navigate, paths } from '../app/router'
import { findGacha } from '../domain/catalog'
import { featuredCandidate, ROOM_CAPACITY, spinCheck, spinQuote } from '../domain/game'
import { coinText, oddsOf, percentLabels } from '../domain/odds'
import type { Gacha } from '../domain/types'
import { MockNotice, PageHeader, TabBar } from '../components/Chrome'
import { GoodsImage } from '../components/Goods'
import { InviteActions, WaitingRoom } from '../components/Room'
import { Sheet } from '../components/Sheet'
import { NotFound } from './NotFound'
import './gacha.css'

/**
 * ガチャ詳細（マスター 267:8279）。目玉の候補・支払う金額だけを見せ、中身と確率・回す前の確認へ進む。
 * 確率はマスターの「初期参考」ではなく、いまの残りから計算した値（確率を正直に出すため）。
 * 「友達と回す」はマスターにないが、ルームの入口がここだけなので残す（Figma 修正待ち）。
 */
export function GachaDetail({ id, room }: { id: string; room: boolean }) {
  const { state } = useApp()
  const gacha = findGacha(id)
  if (!gacha) return <NotFound />
  const labels = percentLabels(oddsOf(gacha, state.stock))
  const candidate = featuredCandidate(gacha, state.stock)
  const quote = spinQuote(state, gacha)
  const problem = spinCheck(state, gacha.id)

  return (
    <div className="screen">
      <PageHeader title="ガチャ詳細" back={paths.gachaList} />
      <main className="content">
        <h2 className="detail-title">{gacha.title}</h2>
        {candidate && (
          <div className="gacha-feature">
            <GoodsImage art={candidate.art} glow={candidate.glow} size="lg" />
            <div className="gacha-feature-text">
              <p className="gacha-feature-kicker">目玉の候補</p>
              <p className="gacha-feature-name">{candidate.name}</p>
              <p className="fine">絵は商品のイメージです</p>
              <p className="gacha-feature-odds">いまの確率<b>{labels.get(candidate.id) ?? '0%'}</b></p>
            </div>
          </div>
        )}
        <section className="pay-card" aria-labelledby="pay-title">
          <h2 id="pay-title" className="pay-kicker">1回だけ引く</h2>
          <p className="pay-price"><b>{coinText(quote.price)}</b> デモコイン</p>
          <p className="pay-balance">
            {problem === 'sold-out'
              ? <>所持 {coinText(quote.balance)}・売り切れのため引けません</>
              : quote.shortBy > 0
              ? <>所持 {coinText(quote.balance)}・あと {coinText(quote.shortBy)} デモコイン足りません</>
              : <>所持 {coinText(quote.balance)} <span aria-hidden="true">→</span><span className="visually-hidden">から</span> 引いた後 {coinText(quote.after)}</>}
          </p>
        </section>
        <p className="fine detail-lead">確率は抽選前に更新・当選保証なし</p>
        <div className="detail-actions">
          <a className="btn btn-outline btn-block" href={paths.odds(gacha.id)}>中身{gacha.prizes.length}種と確率を見る</a>
          <a className="btn btn-main btn-block" href={paths.soloSpin(gacha.id)}>1回引く準備へ</a>
          <a className={`btn btn-lux btn-block${problem ? ' is-disabled' : ''}`} href={problem ? undefined : paths.createRoom(gacha.id)} aria-disabled={problem ? true : undefined} role={problem ? 'link' : undefined}>
            ♡ 友達と回す<small>リンクで招待</small>
          </a>
        </div>
        <MockNotice />
      </main>
      <TabBar active="gacha" />
      {room && !problem && <RoomSheet gacha={gacha} />}
    </div>
  )
}

/** 「友達と回す」で下から出るシート。その場でルームができ、招待と待ち合わせをする。 */
function RoomSheet({ gacha }: { gacha: Gacha }) {
  const { state } = useApp()
  return (
    <Sheet title="友達と いっしょに回そう" onClose={() => navigate(paths.gacha(gacha.id))}>
      <p className="sheet-lead">ルームができました。このリンクを受け取った人だけが入れます（最大{ROOM_CAPACITY}人・24時間有効）。</p>
      <div className="room-card"><b>{gacha.title}</b><small>{state.nickname}のルーム</small></div>
      <InviteActions gacha={gacha} />
      <WaitingRoom gacha={gacha} />
      <MockNotice />
    </Sheet>
  )
}
