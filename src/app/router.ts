import { useEffect, useState } from 'react'

export type Route =
  | { name: 'town' }
  | { name: 'gachaList' }
  | { name: 'welcome' }
  | { name: 'gacha'; id: string }
  | { name: 'odds'; id: string }
  | { name: 'spin'; id: string }
  | { name: 'roomNew' }
  | { name: 'room'; invite: string }
  | { name: 'host'; key: string | null }
  | { name: 'collection' }
  | { name: 'shelf' }
  | { name: 'shelfShare' }
  | { name: 'shelfItem'; id: string }
  | { name: 'friend'; id: string }
  | { name: 'friendItem'; id: string; item: string }
  | { name: 'together' }
  | { name: 'me' }
  | { name: 'notfound' }

const ID = /^[a-z0-9-]+$/

/** 静的ホスティング（固定版 URL を含む）で再読み込みできるよう、画面はハッシュで表す。 */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+|\/+$/g, '')
  if (path === '') return { name: 'town' }
  const parts = path.split('/')
  const [head, id, extra] = parts
  if (parts.length === 1 && head === 'gacha') return { name: 'gachaList' }
  if (parts.length === 1 && head === 'shelf') return { name: 'shelf' }
  if (parts.length === 1 && (head === 'collection' || head === 'together' || head === 'me' || head === 'welcome')) return { name: head }
  // ホスト用リンクのキーは大文字・_ を含む（形の確かめは画面と状態層で行い、違えば「無効」と案内する）
  if (head === 'host' && parts.length <= 2) return { name: 'host', key: id && /^[A-Za-z0-9_-]+$/.test(id) ? id : null }
  if (!id || !ID.test(id)) return { name: 'notfound' }
  if (head === 'gacha' && parts.length === 2) return { name: 'gacha', id }
  // 以前の「友達と回す」のリンク。ルームはガチャに結びつかない共有ルーム（T10）になった
  if (head === 'gacha' && parts.length === 3 && extra === 'room') return { name: 'roomNew' }
  if (head === 'gacha' && parts.length === 3 && extra === 'odds') return { name: 'odds', id }
  if (head === 'gacha' && parts.length === 3 && extra === 'spin') return { name: 'spin', id }
  if (head === 'room' && parts.length === 2) return id === 'new' ? { name: 'roomNew' } : { name: 'room', invite: id }
  if (head === 'shelf' && parts.length === 2) return id === 'share' ? { name: 'shelfShare' } : { name: 'shelfItem', id }
  if (head === 'friend' && parts.length === 2) return { name: 'friend', id }
  if (head === 'friend' && parts.length === 3 && ID.test(extra)) return { name: 'friendItem', id, item: extra }
  return { name: 'notfound' }
}

export const paths = {
  /** 街（ホーム）。アプリを開いた直後だけ導入を出す（URL にハッシュがないとき）。 */
  town: '#/',
  /** ガチャのお店（ガチャ一覧） */
  gachaList: '#/gacha',
  welcome: '#/welcome',
  gacha: (id: string) => `#/gacha/${id}`,
  /** 中身と確率（確率一覧） */
  odds: (id: string) => `#/gacha/${id}/odds`,
  /** 共有ルームを作る（ホストになる）。 */
  createRoom: '#/room/new',
  soloSpin: (id: string) => `#/gacha/${id}/spin`,
  /** 招待リンクの行き先（参加者）。invite はサーバーが作る推測しにくい ID。 */
  room: (invite: string) => `#/room/${invite}`,
  /** ホスト用リンク（F10 の秘密のキー）。 */
  host: (key?: string) => key ? `#/host/${key}` : '#/host',
  /** 当てたもの（記録の一覧・交換・届けてもらう） */
  collection: '#/collection',
  /** わたしの棚（下のタブ「コレクション」） */
  shelf: '#/shelf',
  /** 友だちからの見え方（共有前のプレビュー。公開はしない） */
  shelfShare: '#/shelf/share',
  shelfItem: (prizeId: string) => `#/shelf/${prizeId}`,
  /** 友だち（デモ）の棚 */
  friend: (id: string) => `#/friend/${id}`,
  friendItem: (id: string, prizeId: string) => `#/friend/${id}/${prizeId}`,
  /** フレンド（下のタブ「フレンド」） */
  together: '#/together',
  me: '#/me',
}

export function navigate(to: string) {
  window.location.hash = to
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
