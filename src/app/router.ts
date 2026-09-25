import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'welcome' }
  | { name: 'gacha'; id: string; room: boolean }
  | { name: 'spin'; id: string }
  | { name: 'room'; code: string; spin: boolean }
  | { name: 'collection' }
  | { name: 'together' }
  | { name: 'me' }
  | { name: 'notfound' }

const ID = /^[a-z0-9-]+$/

/** 静的ホスティング（固定版 URL を含む）で再読み込みできるよう、画面はハッシュで表す。 */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+|\/+$/g, '')
  if (path === '') return { name: 'home' }
  const parts = path.split('/')
  const [head, id, extra] = parts
  if (parts.length === 1 && (head === 'collection' || head === 'together' || head === 'me' || head === 'welcome')) return { name: head }
  if (!id || !ID.test(id)) return { name: 'notfound' }
  if (head === 'gacha' && parts.length === 2) return { name: 'gacha', id, room: false }
  if (head === 'gacha' && parts.length === 3 && extra === 'room') return { name: 'gacha', id, room: true }
  if (head === 'gacha' && parts.length === 3 && extra === 'spin') return { name: 'spin', id }
  if (head === 'room' && parts.length === 2) return { name: 'room', code: id, spin: false }
  if (head === 'room' && parts.length === 3 && extra === 'spin') return { name: 'room', code: id, spin: true }
  return { name: 'notfound' }
}

export const paths = {
  home: '#/',
  welcome: '#/welcome',
  gacha: (id: string) => `#/gacha/${id}`,
  createRoom: (id: string) => `#/gacha/${id}/room`,
  soloSpin: (id: string) => `#/gacha/${id}/spin`,
  /** 招待リンクの行き先。デモではルームのコード＝ガチャの ID。 */
  room: (code: string) => `#/room/${code}`,
  roomSpin: (code: string) => `#/room/${code}/spin`,
  collection: '#/collection',
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
