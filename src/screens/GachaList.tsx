import { useState } from 'react'
import { asset, useApp } from '../app/appContext'
import { paths } from '../app/router'
import { catalog, categoryList, seriesList } from '../domain/catalog'
import { coinText, oddsOf, remainingRatio } from '../domain/odds'
import type { CategoryId, Gacha, SeriesId } from '../domain/types'
import { ExampleNotice, SaveWarning, TabBar, TopBar } from '../components/Chrome'
import { Banner, GoodsImage, RemainBar } from '../components/Goods'
import './gacha.css'

type Sort = 'recommended' | 'sellout' | 'few' | 'new'
const sorts: Array<{ id: Sort; label: string }> = [
  { id: 'recommended', label: 'おすすめ順' },
  { id: 'sellout', label: '即完売品' },
  { id: 'few', label: '残りわずか' },
  { id: 'new', label: '新入荷' },
]

/** ガチャのお店（ガチャ一覧）。下のタブ「ガチャ」と、街の「ガチャのお店」から来る。 */
export function GachaList() {
  const { state } = useApp()
  const [series, setSeries] = useState<SeriesId>('sanrio')
  const [category, setCategory] = useState<CategoryId | 'all'>('all')
  const [sort, setSort] = useState<Sort>('recommended')

  let list = catalog.filter((gacha) => gacha.series === series && (category === 'all' || gacha.categories.includes(category)))
  if (sort === 'sellout') list = list.filter((gacha) => gacha.tags.includes('即完売品'))
  if (sort === 'few') list = [...list].sort((a, b) => remainingRatio(a, state.stock) - remainingRatio(b, state.stock))
  if (sort === 'new') list = [...list].sort((a, b) => b.addedOrder - a.addedOrder)

  return (
    <div className="screen world-lavender">
      <TopBar title="ガチャのお店" sub="GACHA SHOP" />
      <main className="content">
        <p className="lead shop-lead">売り切れて買えなかった限定グッズを、JTCC が買い取って検品。中身と確率を確かめてから、友達といっしょに回せます。</p>
        <div className="series-card" role="group" aria-label="作品をえらぶ">
          {seriesList.map((item) => (
            <button key={item.id} type="button" className="series" aria-pressed={series === item.id} onClick={() => { setSeries(item.id); setCategory('all') }}>
              <img src={asset(`assets/series/${item.id}.png`)} alt="" width="40" height="40" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="scroller" role="group" aria-label="グッズの種類">
          <button type="button" className="cat" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>すべて</button>
          {categoryList.map((item) => (
            <button key={item.id} type="button" className="cat" aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>
              <img src={asset(`assets/categories/${item.icon}.png`)} alt="" width="24" height="24" />{item.label}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="並び替え">
          {sorts.map((item) => (
            <button key={item.id} type="button" className="chip" aria-pressed={sort === item.id} onClick={() => setSort(item.id)}>{item.label}</button>
          ))}
        </div>
        {list.length === 0 ? (
          <div className="empty">
            <p>この条件のガチャは、いまありません。</p>
            <button type="button" className="btn btn-outline" onClick={() => { setCategory('all'); setSort('recommended') }}>条件をもどす</button>
          </div>
        ) : (
          <ul className="card-list">
            {list.map((gacha) => <li key={gacha.id}><GachaCard gacha={gacha} /></li>)}
          </ul>
        )}
        <SaveWarning />
        <ExampleNotice />
      </main>
      <TabBar active="gacha" />
    </div>
  )
}

function GachaCard({ gacha }: { gacha: Gacha }) {
  const { state } = useApp()
  const preview = oddsOf(gacha, state.stock).slice(0, 4)
  return (
    <article className="card" aria-labelledby={`card-${gacha.id}`}>
      <div className="tags">{gacha.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}</div>
      <Banner gacha={gacha} as="h2" titleId={`card-${gacha.id}`} />
      <div className="inside">
        <p className="inside-head"><span>このガチャの中身（全{gacha.prizes.length}種の一部）</span></p>
        <ul className="preview">
          {preview.map(({ prize }) => (
            <li key={prize.id}><GoodsImage art={prize.art} glow={prize.glow} size="sm" /><span>{prize.name}</span></li>
          ))}
        </ul>
      </div>
      <div className="card-foot">
        <p className="price"><b>{coinText(gacha.price)}</b> デモコイン／1回</p>
        <RemainBar gacha={gacha} stock={state.stock} />
      </div>
      <div className="card-actions">
        <a className="btn btn-main" href={paths.gacha(gacha.id)} aria-label={`${gacha.title}の中身を見る（全${gacha.prizes.length}種と確率）`}>中身を見る</a>
        <a className="btn btn-lux" href={paths.createRoom}>♡ 友達と回す</a>
      </div>
    </article>
  )
}
