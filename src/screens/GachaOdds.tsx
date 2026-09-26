import { useApp } from '../app/appContext'
import { paths } from '../app/router'
import { findGacha } from '../domain/catalog'
import { coinText, oddsOf, percentLabels } from '../domain/odds'
import { ExampleNotice, PageHeader, TabBar } from '../components/Chrome'
import { NotFound } from './NotFound'
import './gacha.css'

const glowMark = { featured: '目玉', sparkle: 'キラキラ', normal: '' } as const

/**
 * 中身と確率（マスター 267:8299）。並びはマスターと同じ中身の順。
 * 確率はマスターの「初期在庫の参考値」ではなく、いまの残りから計算する（正直に出すため）。
 * 表示だけをマスターどおり小数第1位に丸め、合計 100.0% に端数を調整する。
 */
export function GachaOdds({ id }: { id: string }) {
  const { state } = useApp()
  const gacha = findGacha(id)
  if (!gacha) return <NotFound />
  const rows = oddsOf(gacha, state.stock)
  const labels = percentLabels(rows)
  const byId = new Map(rows.map((row) => [row.prize.id, row]))
  const ordered = gacha.prizes.flatMap((prize) => byId.get(prize.id) ?? [])
  return (
    <div className="screen world-lavender">
      <PageHeader title="中身と確率" back={paths.gacha(gacha.id)} />
      <main className="content">
        <div className="odds-intro">
          <p className="lead odds-lead">いまの在庫から計算した値。ほかの人が引くと変動。</p>
          <p className="fine">抽選直前に更新します。目玉の保証はありません。</p>
        </div>
        <table className="odds-table">
          <caption className="visually-hidden">{gacha.title}の中身{rows.length}種と確率</caption>
          <thead className="visually-hidden">
            <tr><th scope="col">中身</th><th scope="col">確率</th></tr>
          </thead>
          <tbody>
            {ordered.map(({ prize, remaining }) => (
              <tr key={prize.id} className={remaining === 0 ? 'is-out' : undefined}>
                <th scope="row">
                  {prize.name}
                  {prize.glow !== 'normal' && <span className="visually-hidden">（{glowMark[prize.glow]}）</span>}
                  {remaining === 0 && <small>なくなりました</small>}
                </th>
                <td>{labels.get(prize.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fine">合計100.0%に端数調整（小数第1位）。</p>
        <a className="btn btn-main btn-block" href={paths.soloSpin(gacha.id)}>{coinText(gacha.price)}コインで1回引く準備へ</a>
        <ExampleNotice />
      </main>
      <TabBar active="gacha" />
    </div>
  )
}
