import { useApp } from '../app/appContext'
import { navigate, paths } from '../app/router'
import { findGacha } from '../domain/catalog'
import { ROOM_CAPACITY, spinCheck } from '../domain/game'
import { coinText, EXCHANGE_RATE, formatPercent, oddsOf, yen } from '../domain/odds'
import type { Gacha } from '../domain/types'
import { BackBar, MockNotice } from '../components/Chrome'
import { Banner, GoodsImage, RemainBar } from '../components/Goods'
import { InviteActions, WaitingRoom } from '../components/Room'
import { Sheet } from '../components/Sheet'
import { NotFound } from './NotFound'

export function GachaDetail({ id, room }: { id: string; room: boolean }) {
  const { state } = useApp()
  const gacha = findGacha(id)
  if (!gacha) return <NotFound />
  const rows = oddsOf(gacha, state.stock)
  const featured = rows.filter((row) => row.prize.glow === 'featured')
  const others = rows.filter((row) => row.prize.glow !== 'featured')
  const problem = spinCheck(state, gacha.id)

  return (
    <div className="screen">
      <BackBar title="ガチャ詳細" back={paths.home} backLabel="一覧へ" />
      <main className="content">
        <Banner gacha={gacha} as="h2" />
        <div className="price-row">
          <p className="price"><b>{coinText(gacha.price)}</b> コイン／1回</p>
          <RemainBar gacha={gacha} stock={state.stock} />
        </div>
        <section className="notice-box" aria-labelledby="notice-title">
          <h2 id="notice-title">大事なお知らせ</h2>
          <ul className="lead detail-lead">
            <li>確率は、いまの残りから計算した値をそのまま出しています。目玉が当たることを約束するものではありません。</li>
            <li>当たった物は、届けてもらうか、参考価格の一律{Math.round(EXCHANGE_RATE * 100)}%のコインに交換できます。コインは出金できません。</li>
            <li>1回ずつ回します（連続で回す機能はありません）。</li>
          </ul>
        </section>
        <section aria-labelledby="contents-title">
          <h2 id="contents-title" className="section-title">中身の全リスト<small>参考価格の高い順・全{gacha.prizes.length}種</small></h2>
          {featured.length > 0 && <p className="featured-head">✦ 目玉</p>}
          <PrizeList rows={featured} />
          {others.length > 0 && <PrizeList rows={others} />}
        </section>
        <section className="notice-box" aria-labelledby="terms-title">
          <h2 id="terms-title">注意事項</h2>
          <ul className="fine-list">
            <li>中身はすべて JTCC が買い取り、検品した正規品です（という想定のデモです）。発売から90日以内の新作は扱いません。</li>
            <li>参考価格は目安で、買取額や交換額ではありません。</li>
            <li>特定商取引法・資金決済法に基づく表示は、提案モックのため未作成です。</li>
          </ul>
        </section>
        <MockNotice />
      </main>
      <div className="sticky-actions">
        {problem === 'sold-out' ? (
          <p className="sticky-note" role="status">このガチャは売り切れました。</p>
        ) : problem === 'insufficient-coins' ? (
          <p className="sticky-note" role="status">コインが足りません。<a href={paths.me}>マイページでコインを追加</a></p>
        ) : null}
        <div className="sticky-row">
          <a className={`btn btn-outline${problem ? ' is-disabled' : ''}`} href={problem ? undefined : paths.soloSpin(gacha.id)} aria-disabled={problem ? true : undefined} role={problem ? 'link' : undefined}>
            ひとりで回す<small>{coinText(gacha.price)}コイン</small>
          </a>
          <a className={`btn btn-lux${problem ? ' is-disabled' : ''}`} href={problem ? undefined : paths.createRoom(gacha.id)} aria-disabled={problem ? true : undefined} role={problem ? 'link' : undefined}>
            ♡ 友達と回す<small>リンクで招待</small>
          </a>
        </div>
      </div>
      {room && !problem && <RoomSheet gacha={gacha} />}
    </div>
  )
}

function PrizeList({ rows }: { rows: ReturnType<typeof oddsOf> }) {
  return (
    <ul className="prize-list">
      {rows.map(({ prize, remaining, probability }) => (
        <li key={prize.id} className={`prize glow-${prize.glow}${remaining === 0 ? ' is-out' : ''}`}>
          <GoodsImage art={prize.art} glow={prize.glow} />
          <div className="prize-name">
            <b>{prize.name}</b>
            <small>{prize.condition}・参考 {yen(prize.refPrice)}</small>
          </div>
          <p className="prize-odds"><strong>{formatPercent(probability)}</strong>{remaining === 0 && <small>なくなりました</small>}</p>
        </li>
      ))}
    </ul>
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
