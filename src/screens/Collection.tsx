import { useState } from 'react'
import { useApp } from '../app/appContext'
import { paths } from '../app/router'
import { findGacha, findPrize, seriesList } from '../domain/catalog'
import { exchange, exchangeQuote, requestDelivery, summarize } from '../domain/game'
import { coinText, EXCHANGE_RATE, yen } from '../domain/odds'
import type { SeriesId, WinRecord, WinStatus } from '../domain/types'
import { shelfOf, slotText } from '../domain/shelf'
import { ExampleNotice, PageHeader, SaveWarning, TabBar } from '../components/Chrome'
import { GoodsImage } from '../components/Goods'
import { Sheet } from '../components/Sheet'

type Filter = 'all' | WinStatus
const statusLabel: Record<WinStatus, string> = { kept: '手元にある', delivery: '届け待ち', exchanged: 'コインに交換済み' }
const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'すべて' },
  { id: 'kept', label: '手元にある' },
  { id: 'delivery', label: '届け待ち' },
  { id: 'exchanged', label: '交換済み' },
]

const dateText = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}` }
const withText = (win: WinRecord) => win.companions.length === 0 ? 'ひとりで' : `♡ ${win.companions.join('・')}と`

/**
 * 当てたもの（T09 267:8623）。上はマスターどおり、棚と同じ枠の一覧（持っている品を先に）。
 * その下の「当てた記録」（絞り込み・コインに交換・届けてもらう）はマスターにないが、PRODUCT の決定（当てたものは記録。
 * 1つずつ届けてもらうかコインに交換）の入口がここだけなので残す（Figma 修正待ち）。
 */
export function Collection() {
  const { state, update } = useApp()
  const [filter, setFilter] = useState<Filter>('all')
  const [series, setSeries] = useState<SeriesId | 'all'>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [sheet, setSheet] = useState<'exchange' | 'delivery' | null>(null)
  const [message, setMessage] = useState('')
  const summary = summarize(state.wins)
  const visible = state.wins.filter((win) => (filter === 'all' || win.status === filter) && (series === 'all' || findGacha(win.gachaId)?.series === series))
  const count = (status: WinStatus) => state.wins.filter((win) => win.status === status).length
  const toggle = (id: string) => setSelected((list) => list.includes(id) ? list.filter((item) => item !== id) : [...list, id])
  const quote = exchangeQuote(state, selected)
  const quoteTotal = quote.reduce((sum, row) => sum + row.coins, 0)
  // 棚と同じ枠（T09 267:8623 の「持っている・棚 01」「未入手・棚 03」）。持っている品を先に並べる
  const shelf = shelfOf(state)
  const numbered = shelf.slots.map((slot, index) => ({ ...slot, no: index + 1 }))
  const shelfRows = [...numbered.filter((slot) => slot.item), ...numbered.filter((slot) => !slot.item)]
  const shelfSlot = new Map(numbered.map((slot) => [slot.prize.id, slot.no]))

  const doExchange = () => {
    update((current) => exchange(current, selected))
    setMessage(`${quote.length}点をコインに交換しました（+${coinText(quoteTotal)}コイン）`)
    setSelected([]); setSheet(null)
  }
  const doDelivery = () => {
    update((current) => requestDelivery(current, selected))
    setMessage(`${selected.length}点を届け待ちにしました`)
    setSelected([]); setSheet(null)
  }

  return (
    <div className="screen">
      <PageHeader title="当てたもの" back={paths.shelf} />
      <main className="content">
        <p className="lead collection-lead">棚と同じ{shelf.slots.length}枠。持っている品を先に表示。</p>
        <ul className="shelf-list" aria-label={`${shelf.gacha.title}の中身（棚と同じ${shelf.slots.length}枠）`}>
          {shelfRows.map(({ prize, item, no }) => {
            const where = `棚 ${String(no).padStart(2, '0')}`
            return (
              <li key={prize.id}>
                {item ? (
                  <a className="shelf-row is-owned" href={paths.shelfItem(prize.id)}>
                    <GoodsImage art={prize.art} glow={prize.glow} size="sm" />
                    <span className="shelf-row-text"><b>{prize.name}</b><span className="shelf-row-state">持っている・{where}</span></span>
                  </a>
                ) : (
                  <span className="shelf-row is-missing">
                    <span className="shelf-row-plus" aria-hidden="true">+</span>
                    <span className="shelf-row-text"><b>{prize.name}</b><span className="shelf-row-state">未入手・{where}</span></span>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
        <a className="btn btn-outline btn-block" href={paths.shelf}>棚ビューに戻る</a>
        <h2 id="records-title" className="section-title">当てた記録<small>届けてもらう・コインに交換</small></h2>
        <p className="lead records-lead">これまで当てた物の記録です。手元にある物は、届けてもらうか、コインに交換できます。</p>
        <dl className="summary">
          <div><dt>使ったコイン</dt><dd>{coinText(summary.spent)}</dd></div>
          <div><dt>当たった物の相当額</dt><dd className="accent">{yen(summary.refTotal)}</dd></div>
          <div><dt>当てた数</dt><dd>{summary.count}</dd></div>
        </dl>
        <p className="fine">相当額は参考価格の合計で、買取額ではありません。</p>
        {message && <p className="toast" role="status">{message}</p>}
        <div className="chips" role="group" aria-label="状態でしぼりこむ">
          {filters.map((item) => (
            <button key={item.id} type="button" className="chip" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}{item.id !== 'all' && ` ${count(item.id)}`}
            </button>
          ))}
        </div>
        <div className="scroller" role="group" aria-label="作品でしぼりこむ">
          <button type="button" className="cat" aria-pressed={series === 'all'} onClick={() => setSeries('all')}>すべての作品</button>
          {seriesList.map((item) => <button key={item.id} type="button" className="cat" aria-pressed={series === item.id} onClick={() => setSeries(item.id)}>{item.label}</button>)}
        </div>
        {state.wins.length === 0 ? (
          <div className="empty">
            <p>まだ当てたものはありません。</p>
            <a className="btn btn-main" href={paths.gachaList}>ガチャを見る</a>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty"><p>この条件のものはありません。</p></div>
        ) : (
          <ul className="win-grid">
            {visible.map((win) => {
              const found = findPrize(win.gachaId, win.prizeId)
              if (!found) return null
              const { prize } = found
              const selectable = win.status === 'kept'
              const slot = win.status === 'exchanged' ? undefined : shelfSlot.get(prize.id)
              return (
                <li key={win.id} className={`win glow-${prize.glow}`}>
                  <GoodsImage art={prize.art} glow={prize.glow} />
                  <b>{prize.name}</b>
                  <span className="win-with">{withText(win)}</span>
                  <span className="win-meta">{yen(prize.refPrice)}相当・{dateText(win.wonAt)}</span>
                  <span className={`win-status st-${win.status}`}>{statusLabel[win.status]}{win.exchangedCoins !== undefined && `（+${coinText(win.exchangedCoins)}）`}</span>
                  {win.status !== 'exchanged' && <a className="win-link" href={paths.shelfItem(prize.id)}>{slot ? `棚 ${slotText(slot, shelf.slots.length)} で見る` : 'くわしく見る'} ›</a>}
                  {selectable && (
                    <label className="win-check">
                      <input type="checkbox" checked={selected.includes(win.id)} onChange={() => toggle(win.id)} />
                      <span>えらぶ</span>
                    </label>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <SaveWarning />
        <ExampleNotice />
      </main>
      <div className="dock">
        {selected.length > 0 && (
          <div className="selbar" role="region" aria-label="えらんだものの操作">
            <span>{selected.length}点をえらび中</span>
            <button type="button" className="btn btn-outline" onClick={() => setSheet('exchange')}>コインに交換</button>
            <button type="button" className="btn btn-main" onClick={() => setSheet('delivery')}>届けてもらう</button>
          </div>
        )}
        <TabBar active="collection" />
      </div>
      {sheet === 'exchange' && (
        <Sheet title="コインに交換しますか？" onClose={() => setSheet(null)}>
          <p className="sheet-lead">交換した物は、手元から外れます。交換額は参考価格の一律{Math.round(EXCHANGE_RATE * 100)}%です。</p>
          <ul className="quote">
            {quote.map(({ win, coins }) => {
              const prize = findPrize(win.gachaId, win.prizeId)!.prize
              return <li key={win.id}><span>{prize.name}（{yen(prize.refPrice)}相当 × {Math.round(EXCHANGE_RATE * 100)}%）</span><b>+{coinText(coins)}</b></li>
            })}
          </ul>
          <p className="quote-total"><span>もらえるコイン</span><b>+{coinText(quoteTotal)}</b></p>
          <ul className="caution">
            <li>コインはアプリの中だけで使えます。<b>出金はできません。</b></li>
            <li>交換は取り消せません。</li>
          </ul>
          <button type="button" className="btn btn-main btn-block" onClick={doExchange}>コインに交換する</button>
          <button type="button" className="btn btn-text btn-block" onClick={() => setSheet(null)}>やめる</button>
        </Sheet>
      )}
      {sheet === 'delivery' && (
        <Sheet title="届けてもらいますか？" onClose={() => setSheet(null)}>
          <p className="sheet-lead">{selected.length}点を「届け待ち」にします。</p>
          <ul className="caution">
            <li>デモ版のため、住所の入力と実際の発送はまだありません。</li>
            <li>届け待ちにした物は、コインに交換できなくなります。</li>
          </ul>
          <button type="button" className="btn btn-main btn-block" onClick={doDelivery}>届け待ちにする</button>
          <button type="button" className="btn btn-text btn-block" onClick={() => setSheet(null)}>やめる</button>
        </Sheet>
      )}
    </div>
  )
}
