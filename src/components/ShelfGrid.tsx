import type { ReactNode } from 'react'
import { slotText } from '../domain/shelf'
import type { Glow, GoodsArt } from '../domain/types'
import { GoodsImage } from './Goods'

export interface ShelfEntry { id: string; name: string; art: GoodsArt; glow: Glow; note: ReactNode }

/**
 * 9 枠の棚（デザインマスター T09）。飾ってある枠は商品の絵と「持ち主」の文字、
 * 空いている枠は点線の丸と「未入手」などの文字で示し、色だけで見分けさせない。
 */
export function ShelfGrid({ slots, label, emptyTitle, emptyNote, hrefFor }: {
  slots: Array<ShelfEntry | null>
  label: string
  emptyTitle: string
  emptyNote: string
  /** なければ枠は押せない（共有前のプレビューなど） */
  hrefFor?: (entry: ShelfEntry) => string
}) {
  return (
    <ol className="shelf-board" aria-label={label}>
      {slots.map((entry, index) => {
        const number = <span className="slot-no">{slotText(index + 1)}</span>
        if (!entry) {
          return (
            <li key={`empty-${index}`} className="shelf-slot is-empty">
              {number}
              <span className="slot-plus" aria-hidden="true">+</span>
              <b>{emptyTitle}</b>
              <span className="slot-note">{emptyNote}</span>
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
          <li key={entry.id} className="shelf-slot is-filled">
            {hrefFor ? <a className="slot-link" href={hrefFor(entry)}>{body}</a> : <span className="slot-link">{body}</span>}
          </li>
        )
      })}
    </ol>
  )
}
