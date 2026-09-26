import { useEffect, useRef, useState } from 'react'
import './shelf.css'
import { useApp } from '../app/appContext'
import { paths } from '../app/router'
import { findFriend, findPrizeById, FRIEND_SHELF_SIZE, friendsOf, hasReacted, sendReaction, shelfSlots, type DemoFriend } from '../domain/shelf'
import { MockNotice, PageHeader, SaveWarning, TabBar } from '../components/Chrome'
import { GoodsImage } from '../components/Goods'
import { ShelfGrid, type ShelfEntry } from '../components/ShelfGrid'
import { NotFound } from './NotFound'

/**
 * 友だちの棚は見られない（T09 267:8899）。理由と戻り先を出す。
 * まだいっしょに回していない友だちの URL を直接開いたときも、マスターにある同じ状態を出す（専用の文言は作らない）。
 */
function Unavailable({ friend }: { friend: DemoFriend }) {
  return (
    <div className="screen">
      <PageHeader title="今は見られません" back={paths.together} />
      <main className="content">
        <span className="friend-art" aria-hidden="true">
          <svg viewBox="0 0 120 120" width="120" height="120" focusable="false">
            <rect x="22" y="20" width="76" height="80" rx="10" className="art-fill" stroke="currentColor" strokeWidth="4" />
            <path d="M60 22v76M34 40h52" stroke="currentColor" strokeWidth="2.5" opacity="0.5" />
            <circle cx="53" cy="64" r="3.5" fill="currentColor" /><circle cx="67" cy="64" r="3.5" fill="currentColor" />
          </svg>
        </span>
        <h2 className="friend-empty-title">{friend.name}さんの棚は見られません</h2>
        <p className="lead unavailable-lead">公開範囲や接続状態が変わるまで待ってください。</p>
        <p className="fine">あなたの棚や所有品には影響しません。</p>
        <a className="btn btn-outline btn-block" href={paths.together}>友だち一覧へ</a>
        <MockNotice />
      </main>
      <TabBar active="friend" />
    </div>
  )
}

function useFriend(id: string) {
  const { state } = useApp()
  const friend = findFriend(id)
  const met = friend ? friendsOf(state).some((item) => item.id === friend.id) : false
  return { friend, visible: friend !== undefined && met && friend.viewable }
}

/** 友だち（デモ）の棚（T09 267:8786）。自分の棚ではないことを見出しと各枠の文字で示す。 */
export function FriendShelf({ id }: { id: string }) {
  const { friend, visible } = useFriend(id)
  if (!friend) return <NotFound />
  if (!visible) return <Unavailable friend={friend} />
  const entries = friend.shelf.flatMap((prizeId): ShelfEntry[] => {
    const found = findPrizeById(prizeId)
    return found ? [{ id: prizeId, name: found.prize.name, art: found.prize.art, glow: found.prize.glow, note: `${friend.name}さんの品` }] : []
  })
  return (
    <div className="screen">
      <PageHeader title={`${friend.name}さんの棚`} back={paths.together} />
      <main className="content">
        <p className="item-eyebrow">友だちの持ち物・あなたの棚ではありません</p>
        <div className="shelf-summary">
          <div className="shelf-summary-text">
            <p><b className="shelf-count">{friend.name}さんの棚・{entries.length} / {FRIEND_SHELF_SIZE} 枠</b></p>
            <p className="lead friend-lead">{friend.name}さんが飾っている品を見ています（デモ）。</p>
          </div>
        </div>
        <ShelfGrid slots={shelfSlots(entries)} label={`${friend.name}さんの棚（デモ）`} emptyTitle="まだ飾っていません" emptyNote="空き枠" hrefFor={(entry) => paths.friendItem(friend.id, entry.id)} />
        <p className="fine">見られるのは飾られた品だけです。</p>
        {entries[0] && <a className="btn btn-main btn-block" href={paths.friendItem(friend.id, entries[0].id)}>{friend.name}さんの1点を見る</a>}
        <MockNotice />
      </main>
      <TabBar active="friend" />
    </div>
  )
}

/** 友だちの1点（T09 267:8858）と「いいな〜」を送った後（267:8871）。同じ品には1回だけ送れる。 */
export function FriendItem({ id, item }: { id: string; item: string }) {
  const { state, update } = useApp()
  const { friend, visible } = useFriend(id)
  const found = findPrizeById(item)
  // 送るボタンは送った後に消えるので、焦点を結果の文へ移す
  const [justSent, setJustSent] = useState(false)
  const statusRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (justSent) statusRef.current?.focus() }, [justSent])
  if (!friend || !found || !friend.shelf.includes(item)) return <NotFound />
  if (!visible) return <Unavailable friend={friend} />
  const sent = hasReacted(state, friend.id, item)
  return (
    <div className="screen">
      <PageHeader title={sent ? '気持ちを送った' : `${friend.name}さんの1点`} back={paths.friend(friend.id)} />
      <main className="content">
        <p className="item-eyebrow">{friend.name}さんの持ち物・あなたの品ではありません</p>
        <article className="item-card" aria-labelledby="item-name">
          <GoodsImage art={found.prize.art} glow={found.prize.glow} size="lg" />
          <h2 id="item-name">{found.prize.name}</h2>
          {sent ? (
            <>
              <p className="item-sub item-fav" role="status" tabIndex={-1} ref={statusRef}>♡ いいな〜を送った・デモ</p>
              <p className="fine">同じ反応を続けて送ることはできません</p>
            </>
          ) : (
            <>
              <p className="item-sub">{friend.name}さんが飾っている展示例（デモ）</p>
              <p className="item-state">見るだけ・あなたの棚には追加されません</p>
            </>
          )}
        </article>
        <p className="lead item-lead">{sent ? `${friend.name}さんの棚をもっと見てみよう。` : '「いいな〜」を伝えられます（デモ）。'}</p>
        {sent
          ? <a className="btn btn-main btn-block" href={paths.friend(friend.id)}>{friend.name}さんの棚へ</a>
          : <button type="button" className="btn btn-main btn-block" onClick={() => { update((current) => sendReaction(current, friend.id, item)); setJustSent(true) }}>いいな〜を送る</button>}
        <SaveWarning />
        <MockNotice />
      </main>
      <TabBar active="friend" />
    </div>
  )
}
