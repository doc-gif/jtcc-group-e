import './shelf.css'
import { useApp } from '../app/appContext'
import { paths } from '../app/router'
import { friendsOf } from '../domain/shelf'
import { ExampleNotice, PageHeader, TabBar } from '../components/Chrome'

/** フレンドなしのイラスト（T09 267:8884 のベクター画をコードで描き直したもの）。 */
function FriendsArt() {
  return (
    <span className="friend-art is-round" aria-hidden="true">
      <svg viewBox="0 0 160 120" width="160" height="120" focusable="false">
        <circle cx="62" cy="44" r="20" className="art-fill-soft" stroke="currentColor" strokeWidth="3" opacity="0.8" />
        <circle cx="100" cy="44" r="20" className="art-fill-mint" stroke="currentColor" strokeWidth="3" />
        <path d="M30 112c0-26 14-42 32-42s32 16 32 42" className="art-fill" stroke="currentColor" strokeWidth="3" opacity="0.8" />
        <path d="M68 112c0-26 14-42 32-42s32 16 32 42" className="art-fill" stroke="currentColor" strokeWidth="3" />
      </svg>
    </span>
  )
}

/** フレンド（T09 267:8766 友だちあり・267:8884 なし）。友だちはデモ。文言はマスターに合わせる。 */
export function Together() {
  const { state } = useApp()
  const friends = friendsOf(state)
  return (
    <div className="screen">
      <PageHeader title="フレンド" back={paths.town} />
      <main className="content">
        {friends.length === 0 ? (
          <div className="friend-empty">
            <FriendsArt />
            <h2 className="friend-empty-title">まだ友だちはいません</h2>
            <p className="lead together-lead">いっしょに回した友だちの棚を、ここから見られます。</p>
            <p className="fine">招待と共有範囲は後続で設計します。</p>
            <a className="btn btn-main btn-block" href={paths.gachaList}>ガチャを見る</a>
          </div>
        ) : (
          <section aria-labelledby="friends-title">
            <h2 id="friends-title" className="lead together-lead">見に行ける友だち（デモ）</h2>
            <ul className="friend-list">
              {friends.map((friend) => (
                <li key={friend.id} className={`friend-card${friend.viewable ? '' : ' is-unavailable'}`}>
                  <span className="friend-avatar" aria-hidden="true">{friend.name.slice(0, 1)}</span>
                  <span className="friend-text">
                    <b>{friend.name}さんの棚</b>
                    <span>{friend.viewable ? `飾っている ${friend.shelf.length} 点・デモ表示` : '今は見られません・デモ表示'}</span>
                  </span>
                  <a className={`btn btn-block ${friend.viewable ? 'btn-main' : 'btn-outline'}`} href={paths.friend(friend.id)}
                    aria-label={friend.viewable ? `${friend.name}さんの棚を見に行く` : `${friend.name}さんの棚の状態を見る`}>
                    {friend.viewable ? '棚を見に行く' : '状態を見る'}
                  </a>
                </li>
              ))}
            </ul>
            <p className="fine">友だちの品は、あなたの持ち物に入りません。</p>
            <a className="btn btn-outline btn-block" href={paths.gachaList}>ガチャのお店へ</a>
          </section>
        )}
        <ExampleNotice />
      </main>
      <TabBar active="friend" />
    </div>
  )
}
