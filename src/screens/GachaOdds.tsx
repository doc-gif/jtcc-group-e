import { useApp } from '../app/appContext'
import { paths } from '../app/router'
import { findGacha } from '../domain/catalog'
import { spinCheck } from '../domain/game'
import { coinText, formatPercent, oddsOf } from '../domain/odds'
import { BackBar, MockNotice, TabBar } from '../components/Chrome'
import { SpinLink, SpinUnavailable } from '../components/SpinGate'
import { NotFound } from './NotFound'
import './gacha.css'

const glowMark = { featured: '目玉', sparkle: 'キラキラ', normal: '' } as const

/** 中身と確率（マスター 267:8299）。いまの残りから計算した確率を、全種そろえて見せる。 */
export function GachaOdds({ id }: { id: string }) {
  const { state } = useApp()
  const gacha = findGacha(id)
  if (!gacha) return <NotFound />
  const rows = oddsOf(gacha, state.stock)
  const problem = spinCheck(state, gacha.id)
  return (
    <div className="screen">
      <BackBar title="中身と確率" back={paths.gacha(gacha.id)} backLabel="詳細へ" />
      <main className="content">
        <p className="lead odds-lead">{gacha.title}の中身{rows.length}種と、いまの残りから計算した確率です。ほかの人が引くと変わります。</p>
        <p className="fine">回す直前の残りで抽選します。目玉が当たることを約束するものではありません。</p>
        <table className="odds-table">
          <caption className="visually-hidden">{gacha.title}の中身と確率（参考価格の高い順）</caption>
          <thead className="visually-hidden">
            <tr><th scope="col">中身</th><th scope="col">確率</th></tr>
          </thead>
          <tbody>
            {rows.map(({ prize, remaining, probability }) => (
              <tr key={prize.id} className={`glow-${prize.glow}${remaining === 0 ? ' is-out' : ''}`}>
                <th scope="row">
                  {prize.name}
                  {prize.glow !== 'normal' && <span className="visually-hidden">（{glowMark[prize.glow]}）</span>}
                  {remaining === 0 && <small>なくなりました</small>}
                </th>
                <td>{formatPercent(probability)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fine">並びは参考価格の高い順です。確率は小数第1位（とても小さいときは第2位）までの表示のため、足すと100%から少しずれることがあります。</p>
        <SpinUnavailable problem={problem} />
        <SpinLink gachaId={gacha.id} problem={problem}>{coinText(gacha.price)}コインで1回引く準備へ</SpinLink>
        <MockNotice />
      </main>
      <TabBar active="gacha" />
    </div>
  )
}
