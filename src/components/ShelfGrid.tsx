import type { ReactNode } from 'react'
import { slotText } from '../domain/shelf'
import type { Glow, GoodsArt } from '../domain/types'
import { GoodsImage } from './Goods'

export interface ShelfEntry { id: string; name: string; art: GoodsArt; glow: Glow; note: ReactNode }

/**
 * 棚（デザインマスター T09）。木の枠の中に2列で枠を並べ、マスターどおり棚の中だけを縦にスクロールする。
 * 飾ってある枠は商品の絵と「持ち主」の文字、空いている枠は「＋」と「未入手」などの文字で示し、色だけで見分けさせない。
 */
export function ShelfGrid({ slots, label, emptyTitle, emptyNote, hrefFor }: {
  slots: Array<ShelfEntry | null>
  label: string
  emptyTitle: string
  /** 空き枠の2行目。わたしの棚では、その枠に入る中身の名前 */
  emptyNote: string | ((index: number) => string)
  /** なければ枠は押せない（共有前のプレビューなど） */
  hrefFor?: (entry: ShelfEntry) => string
}) {
  return (
    // 棚の中だけをスクロールするので、キーボードでも焦点を当ててスクロールできるようにする
    <div className="shelf-scroll" role="region" aria-label={`${label}・${slots.length}枠（棚の中をスクロールできます）`} tabIndex={0}>
      <ol className="shelf-board" aria-label={label}>
        {slots.map((entry, index) => {
          const number = <span className="slot-no">{slotText(index + 1, slots.length)}</span>
          if (!entry) {
            return (
              <li key={`empty-${index}`} className="shelf-slot">
                <span className="slot-card is-empty">
                  {number}
                  <span className="slot-plus" aria-hidden="true">+</span>
                  <b>{emptyTitle}</b>
                  <span className="slot-note">{typeof emptyNote === 'string' ? emptyNote : emptyNote(index)}</span>
                </span>
              </li>
            )
          }
          const body = (
            <>
              {number}
              <GoodsImage art={entry.art} glow={entry.glow} />
              <b>{entry.name}</b>
              <span className="slot-note">{entry.note}</span>
            </>
          )
          return (
            <li key={entry.id} className="shelf-slot">
              {hrefFor ? <a className="slot-card slot-link" href={hrefFor(entry)}>{body}</a> : <span className="slot-card slot-link">{body}</span>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
