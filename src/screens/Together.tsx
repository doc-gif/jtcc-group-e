import { useApp } from '../app/appContext'
import { paths } from '../app/router'
import { catalog, findPrize } from '../domain/catalog'
import { MockNotice, TabBar, TopBar } from '../components/Chrome'
import { GoodsImage } from '../components/Goods'

export function Together() {
  const { state } = useApp()
  const memories = state.wins.filter((win) => win.companions.length > 0).slice(0, 6)
  return (
    <div className="screen">
      <TopBar title="いっしょに回す" sub="TOGETHER" />
      <main className="content">
        <p className="lead together-lead">友達とリンクでつながって、同じガチャを同時に回せます。当たった物も、はずれも、その場でいっしょに見られます。</p>
        <ol className="steps">
          <li><b>ルームを作る</b><span>ガチャを選んで「友達と回す」</span></li>
          <li><b>リンクを送る</b><span>最大4人・リンクを持つ人だけ</span></li>
          <li><b>みんなで回す</b><span>結果とおそろいを一緒に楽しむ</span></li>
        </ol>
        <section aria-labelledby="pick-title">
          <h2 id="pick-title" className="section-title">どのガチャで回す？</h2>
          <ul className="pick-list">
            {catalog.map((gacha) => (
              <li key={gacha.id}><a className="pick" href={paths.createRoom(gacha.id)}><span>{gacha.title}</span><small>♡ 友達と回す ›</small></a></li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="memory-title">
          <h2 id="memory-title" className="section-title">いっしょに当てた記録</h2>
          {memories.length === 0 ? <p className="empty-line">まだありません。はじめての1回を、友達といっしょに。</p> : (
            <ul className="memory-list">
              {memories.map((win) => {
                const found = findPrize(win.gachaId, win.prizeId)
                if (!found) return null
                return <li key={win.id}><GoodsImage art={found.prize.art} glow={found.prize.glow} size="sm" /><span><b>{found.prize.name}</b><small>♡ {win.companions.join('・')}と</small></span></li>
              })}
            </ul>
          )}
        </section>
        <MockNotice />
      </main>
      <TabBar active="friend" />
    </div>
  )
}
