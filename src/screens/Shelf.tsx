import { useState } from 'react'
import './shelf.css'
import { useApp } from '../app/appContext'
import { paths } from '../app/router'
import { ownedItems, SHELF_SIZE, shelfSlots, slotOf, slotText, toggleFavorite, type ShelfItem } from '../domain/shelf'
import { BackBar, MockNotice, SaveWarning, TabBar } from '../components/Chrome'
import { GoodsImage } from '../components/Goods'
import { ShelfGrid, type ShelfEntry } from '../components/ShelfGrid'

const toEntry = (item: ShelfItem, note: string): ShelfEntry => ({ id: item.prize.id, name: item.prize.name, art: item.prize.art, glow: item.prize.glow, note })

/** わたしの棚（T09 267:8476 空・267:8550 所有あり）。下のタブ「コレクション」の行き先。文言はマスターに合わせる。 */
export function Shelf() {
  const { state } = useApp()
  const items = ownedItems(state)
  const shown = Math.min(items.length, SHELF_SIZE)
  const slots = shelfSlots(items.map((item) => toEntry(item, '持っている')))
  const empty = items.length === 0
  return (
    <div className="screen">
      <BackBar title="わたしの棚" back={paths.town} backLabel="戻る" />
      <main className="content">
        <p className="lead shelf-lead">{empty ? 'ここから、好きな品で棚をつくろう。' : 'お気に入りを並べて、わたしだけの棚に。'}</p>
        <div className="shelf-summary">
          <div className="shelf-summary-text">
            <p><b className="shelf-count">{shown} / {SHELF_SIZE} 枠</b>{!empty && <b className="shelf-count">を展示中</b>}</p>
            <p className="fine">{empty ? '絵のある枠は、当てた後に飾られます。' : '持っている品を表示'}</p>
          </div>
          {!empty && <a className="btn btn-outline" href={paths.collection}><span><span className="visually-hidden">当てたもの</span>一覧</span></a>}
        </div>
        <ShelfGrid slots={slots} label={`わたしの棚（${SHELF_SIZE}枠）`} emptyTitle="未入手" emptyNote="空き枠" hrefFor={(entry) => paths.shelfItem(entry.id)} />
        <p className="fine">{empty
          ? '空き枠にも「未入手」と表示します。'
          : items.length > SHELF_SIZE
            ? `全${SHELF_SIZE}枠。ほかの${items.length - SHELF_SIZE}点は「一覧」で見られます。`
            : `全${SHELF_SIZE}枠・下へスクロールして見られます。`}</p>
        {empty
          ? <a className="btn btn-main btn-block" href={paths.gachaList}>ガチャのお店へ</a>
          : <a className="btn btn-main btn-block" href={paths.shelfShare}>友だちからの見え方を見る</a>}
        <SaveWarning />
        <MockNotice />
      </main>
      <TabBar active="collection" />
    </div>
  )
}

/** わたしの1点（T09 267:8668 詳細・267:8681 お気に入り済み）。お気に入りはいつでも外せる。 */
export function ShelfItemScreen({ id }: { id: string }) {
  const { state, update } = useApp()
  const [message, setMessage] = useState('')
  const item = ownedItems(state).find((entry) => entry.prize.id === id)
  const slot = slotOf(state, id)
  const slotLabel = slot ? `棚 ${slotText(slot)}` : '棚の外（一覧にあります）'

  const toggle = () => {
    const next = !item?.favorite
    update((current) => toggleFavorite(current, id))
    setMessage(next ? 'お気に入りにしました。' : 'お気に入りをやめました。')
  }
  // 押したボタンは同じ要素のまま残し（key）、焦点が外れないようにする
  const toggleButton = (
    <button key="toggle" type="button" className={`btn btn-block ${item?.favorite ? 'btn-outline' : 'btn-main'}`} onClick={toggle}>
      {item?.favorite ? 'お気に入りをやめる' : 'お気に入りにする'}
    </button>
  )

  return (
    <div className="screen">
      <BackBar title={item?.favorite ? 'お気に入りの1点' : 'わたしの1点'} back={paths.shelf} backLabel="戻る" />
      <main className="content">
        {!item ? (
          <>
            <p className="lead item-lead">この品は、いま持っていません。コインに交換した品や、まだ当てていない品は棚に並びません。</p>
            <a className="btn btn-main btn-block" href={paths.shelf}>わたしの棚を見る</a>
          </>
        ) : (
          <>
            <p className="item-eyebrow">{item.favorite ? 'あなたの持ち物・お気に入り登録済み' : `あなたの持ち物・${slotLabel}`}</p>
            <article className="item-card" aria-labelledby="item-name">
              <GoodsImage art={item.prize.art} glow={item.prize.glow} size="lg" />
              <h2 id="item-name">{item.prize.name}</h2>
              {item.favorite
                ? <p className="item-sub item-fav">♡ お気に入り・{slotLabel}</p>
                : <p className="item-sub">{item.gacha.title}で当てた1点{item.count > 1 && `（${item.count}個持っている）`}</p>}
              <p className="item-state">{item.favorite ? '持っている・デモの保存イメージ' : '持っている・いつでも棚で見られます'}</p>
            </article>
            {message && <p className="toast" role="status">{message}</p>}
            <p className="lead item-lead">{item.favorite ? '棚に戻って、ほかの品も見てみよう。' : '好きな1点に目印をつけられます。'}</p>
            <div className="item-actions">
              {item.favorite
                ? [<a key="shelf" className="btn btn-main btn-block" href={paths.shelf}>わたしの棚を見る</a>, toggleButton]
                : [toggleButton]}
            </div>
          </>
        )}
        <SaveWarning />
        <MockNotice />
      </main>
      <TabBar active="collection" />
    </div>
  )
}

/** 友だちからの見え方（T09 267:8694）。見え方を確かめるだけで、どこにも公開しない。 */
export function ShelfShare() {
  const { state } = useApp()
  const items = ownedItems(state)
  const shown = Math.min(items.length, SHELF_SIZE)
  const slots = shelfSlots(items.map((item) => toEntry(item, 'あなたの品')))
  return (
    <div className="screen">
      <BackBar title="友だちからの見え方" back={paths.shelf} backLabel="戻る" />
      <main className="content">
        <p className="lead share-lead">これはあなたの棚のプレビューです。</p>
        <div className="shelf-summary">
          <div className="shelf-summary-text">
            <p><b className="shelf-count">あなたの棚・{shown} / {SHELF_SIZE} 枠</b></p>
            <p className="fine">共有はまだ実行していません。</p>
          </div>
        </div>
        <ShelfGrid slots={slots} label="友だちから見えるあなたの棚（プレビュー）" emptyTitle="未入手" emptyNote="空き枠" />
        <p className="fine">見せる範囲と招待は後続で決めます。</p>
        <a className="btn btn-main btn-block" href={paths.together}>友だち一覧へ</a>
        <MockNotice />
      </main>
      <TabBar active="collection" />
    </div>
  )
}
