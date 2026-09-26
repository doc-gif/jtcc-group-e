import { useEffect, useState } from 'react'

export type Route =
  | { name: 'town' }
  | { name: 'gachaList' }
  | { name: 'welcome' }
  | { name: 'gacha'; id: string; room: boolean }
  | { name: 'spin'; id: string }
  | { name: 'room'; code: string; spin: boolean }
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
  if (!id || !ID.test(id)) return { name: 'notfound' }
  if (head === 'gacha' && parts.length === 2) return { name: 'gacha', id, room: false }
  if (head === 'gacha' && parts.length === 3 && extra === 'room') return { name: 'gacha', id, room: true }
  if (head === 'gacha' && parts.length === 3 && extra === 'spin') return { name: 'spin', id }
  if (head === 'room' && parts.length === 2) return { name: 'room', code: id, spin: false }
  if (head === 'room' && parts.length === 3 && extra === 'spin') return { name: 'room', code: id, spin: true }
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
  createRoom: (id: string) => `#/gacha/${id}/room`,
  soloSpin: (id: string) => `#/gacha/${id}/spin`,
  /** 招待リンクの行き先。デモではルームのコード＝ガチャの ID。 */
  room: (code: string) => `#/room/${code}`,
  roomSpin: (code: string) => `#/room/${code}/spin`,
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
