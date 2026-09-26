import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react'
import type { RoomState } from '../realtime/roomController'
import { readRecords, useRoomSession, type RoomSession } from './sharedRoom'

/**
 * 限定公開アプリだけで出すキャラクターの絵（#144 案 D）。絵そのものはリポジトリ・ビルドに置かない。
 * 担当者が非公開バケット `pitch-characters` の下の名前にアップロードし、開いているルームのホストと参加者だけが読める。
 * どの絵をどの名前で置くかは docs/PITCH_CHARACTERS.md にだけ書く（素材の対応はコードに持たせない）。
 * 読めない・無いときは何も出さない（CharacterArt が null を返す。画面の配置は変わらない）。
 */
export type CharacterSlot =
  | 'townShop' | 'townHouseLeft' | 'townHouseRight' | 'townFountain'
  | 'spinCorner'
  | 'resultNormal' | 'resultFeatured'

/** 場所 → バケットの中のオブジェクト名。 */
export const CHARACTER_SLOTS: Readonly<Record<CharacterSlot, string>> = {
  townShop: 'chars/town-shop.png',
  townHouseLeft: 'chars/town-house-left.png',
  townHouseRight: 'chars/town-house-right.png',
  townFountain: 'chars/town-fountain.png',
  spinCorner: 'chars/spin-corner.png',
  resultNormal: 'chars/result.png',
  resultFeatured: 'chars/result-featured.png',
}

const SLOTS = Object.keys(CHARACTER_SLOTS) as CharacterSlot[]

/** 読めた場所だけの object URL。 */
export type CharacterUrls = Partial<Record<CharacterSlot, string>>

const CharacterContext = createContext<CharacterUrls>({})

/** 開いているルームの中にいる（ルームの ID と snapshot がある）。 */
const inRoom = (state: RoomState) => state.roomId !== null && state.snapshot !== null

/**
 * この端末がルームに関わっている（入ったルームの記録か、ホスト用キーがある）。
 * どちらも無い端末（一般公開アプリの入口・初めて開いた人）は、キャラクターを取りに行かない。
 */
function involved(session: RoomSession) {
  return session.controller.getState().hostKey !== null || Object.keys(readRecords(session.records)).length > 0
}

/** 取得は最初の 1 回と、ルームに入ったときの取り直し 1 回まで。 */
const MAX_LOADS = 2

/**
 * キャラクターの絵を読み、下の画面に渡す。取得元（session.characters）が無い端末内の模擬ルーム・テストでは何もしない。
 * - ルームの記録かホスト用キーがあるときだけ、7 か所を並列に 1 回読む。
 * - ルームに入った・ホストになった（ルームの中に変わった）ときに、読めていない場所だけもう 1 回読む。
 * - ルームの外に出て、ルームの記録もホスト用キーも無くなったら（退室・期限切れ）、読んだ絵を捨てる。また入れば読み直す。
 * - 絵はメモリの object URL だけに持つ（Cache Storage・localStorage・IndexedDB に残さない）。外れるときに取り消す。
 * session はテスト用。省略時はアプリ全体のルームの接続。
 */
export function CharacterProvider({ children, session }: { children?: ReactNode; session?: RoomSession }) {
  const shared = useRoomSession()
  const room = session ?? shared
  const source = room.characters
  const [urls, setUrls] = useState<CharacterUrls>({})

  useEffect(() => {
    if (!source) return
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
    const { controller } = room
    const made: string[] = []
    const got: CharacterUrls = {}
    let disposed = false
    let loads = 0
    let loading = false
    let pending = false
    let generation = 0

    const missing = () => SLOTS.filter(slot => !got[slot])
    const load = async () => {
      loads += 1
      loading = true
      const started = generation
      const slots = missing()
      const blobs = await Promise.all(slots.map(slot => source.load(CHARACTER_SLOTS[slot]).catch(() => null)))
      if (disposed || started !== generation) return
      loading = false
      let changed = false
      slots.forEach((slot, index) => {
        const blob = blobs[index]
        if (!blob) return
        let url: string
        try { url = URL.createObjectURL(blob) } catch { return }
        made.push(url)
        got[slot] = url
        changed = true
      })
      if (changed) setUrls({ ...got })
      if (pending) { pending = false; retry() }
    }
    const retry = () => {
      if (loads >= MAX_LOADS || missing().length === 0) return
      if (loading) { pending = true; return }
      void load()
    }

    /** 退室・期限切れで、この端末がルームに関わらなくなったら、読んだ絵を捨てて最初からにする。 */
    const forget = () => {
      if (loads === 0 && made.length === 0) return
      generation += 1
      loads = 0
      loading = false
      pending = false
      for (const url of made.splice(0)) URL.revokeObjectURL(url)
      for (const slot of SLOTS) delete got[slot]
      setUrls({})
    }

    let wasInRoom = inRoom(controller.getState())
    if (wasInRoom || involved(room)) void load()
    const check = () => {
      const now = inRoom(controller.getState())
      const entered = now && !wasInRoom
      wasInRoom = now
      if (entered) retry()
      else if (!now && !involved(room)) forget()
    }
    const stop = controller.subscribe(check)
    // 退室の記録（forgetRecord）は画面が状態の変化の後に消すので、画面の移動でも確かめ直す。
    window.addEventListener('hashchange', check)
    return () => {
      disposed = true
      stop()
      window.removeEventListener('hashchange', check)
      for (const url of made) URL.revokeObjectURL(url)
      setUrls({})
    }
  }, [room, source])

  return createElement(CharacterContext.Provider, { value: urls }, children)
}

/** 場所の絵の URL。読めていなければ null（何も出さない）。 */
export function useCharacter(slot: CharacterSlot): string | null {
  return useContext(CharacterContext)[slot] ?? null
}
