import type { Gacha, Prize, Stock } from './types'

/** コインへの交換率。参考価格に対して一律 20%。 */
export const EXCHANGE_RATE = 0.2

export function exchangeCoins(refPrice: number): number {
  if (!Number.isFinite(refPrice) || refPrice <= 0) return 0
  return Math.floor(refPrice * EXCHANGE_RATE)
}

export function remainingOf(stock: Stock, gachaId: string, prizeId: string): number {
  return Math.max(0, stock[gachaId]?.[prizeId] ?? 0)
}

export function totalRemaining(gacha: Gacha, stock: Stock): number {
  return gacha.prizes.reduce((sum, prize) => sum + remainingOf(stock, gacha.id, prize.id), 0)
}

export function totalCapacity(gacha: Gacha): number {
  return gacha.prizes.reduce((sum, prize) => sum + prize.total, 0)
}

export interface OddsRow { prize: Prize; remaining: number; probability: number }

/** 確率は「いまの残り」から計算する。並びは参考価格の高い順。 */
export function oddsOf(gacha: Gacha, stock: Stock): OddsRow[] {
  const total = totalRemaining(gacha, stock)
  return [...gacha.prizes]
    .sort((a, b) => b.refPrice - a.refPrice)
    .map((prize) => {
      const remaining = remainingOf(stock, gacha.id, prize.id)
      return { prize, remaining, probability: total === 0 ? 0 : remaining / total }
    })
}

export function formatPercent(probability: number): string {
  if (probability <= 0) return '0%'
  const value = probability * 100
  return `${value < 0.1 ? value.toFixed(2) : value.toFixed(1)}%`
}

/**
 * 確率の表示用の文字（マスター 267:8299「合計100.0%に端数調整（小数第1位）」）。
 * 値はいまの残りから計算したままで、表示だけを 0.1% 単位に丸める。合計がちょうど 100.0% になるよう、
 * 切り捨てた残りを端数の大きい順に 0.1% ずつ配る（最大剰余法）。残りがある品は 0.0% と出さず、残り 0 の品だけ 0%。
 */
export function percentLabels(rows: OddsRow[]): Map<string, string> {
  const labels = new Map<string, string>()
  const total = rows.reduce((sum, row) => sum + row.probability, 0)
  if (total <= 0) {
    for (const row of rows) labels.set(row.prize.id, '0%')
    return labels
  }
  const exact = rows.map((row) => (row.probability / total) * 1000)
  const units = exact.map((value) => Math.floor(value + 1e-9))
  let rest = 1000 - units.reduce((sum, value) => sum + value, 0)
  const byRemainder = exact.map((value, index) => ({ index, remainder: value - units[index] })).sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const { index } of byRemainder) {
    if (rest <= 0) break
    units[index] += 1
    rest -= 1
  }
  // 残りがあるのに 0.0% になる品には 0.1% を回す（いちばん大きい品から借りる）
  rows.forEach((row, index) => {
    if (row.probability <= 0 || units[index] > 0) return
    const largest = units.indexOf(Math.max(...units))
    units[largest] -= 1
    units[index] = 1
  })
  rows.forEach((row, index) => labels.set(row.prize.id, row.probability <= 0 ? '0%' : `${(units[index] / 10).toFixed(1)}%`))
  return labels
}

export type RemainLevel = 'plenty' | 'half' | 'few' | 'soldout'

export function remainingRatio(gacha: Gacha, stock: Stock): number {
  const capacity = totalCapacity(gacha)
  return capacity === 0 ? 0 : totalRemaining(gacha, stock) / capacity
}

export function remainLevel(ratio: number): RemainLevel {
  if (ratio <= 0) return 'soldout'
  if (ratio < 0.3) return 'few'
  if (ratio < 0.6) return 'half'
  return 'plenty'
}

export const remainLabel: Record<RemainLevel, string> = {
  plenty: 'たっぷり',
  half: '半分くらい',
  few: '残りわずか',
  soldout: '売り切れ',
}

/**
 * 残りの数で重み付けして 1 つ選ぶ。`random` は 0 以上 1 未満。
 * `forceFeatured` は審査用デモ操作で、目玉が残っている場合だけ目玉から選ぶ。
 */
export function pickPrize(gacha: Gacha, stock: Stock, random: number, forceFeatured = false): Prize | null {
  const available = gacha.prizes.filter((prize) => remainingOf(stock, gacha.id, prize.id) > 0)
  const featured = available.filter((prize) => prize.glow === 'featured')
  const pool = forceFeatured && featured.length > 0 ? featured : available
  const total = pool.reduce((sum, prize) => sum + remainingOf(stock, gacha.id, prize.id), 0)
  if (total === 0) return null
  const r = Math.min(Math.max(random, 0), 0.999999999) * total
  let cursor = 0
  for (const prize of pool) {
    cursor += remainingOf(stock, gacha.id, prize.id)
    if (r < cursor) return prize
  }
  return pool[pool.length - 1]
}

/**
 * カプセルを開けるまでのタップ数。デザインマスター（267:8387 / 8404 / 8421）どおり、光り方にかかわらず常に3段階。
 * 担当者の決定（2026-09-26「基本的にマスターを正として」）で、以前の「光り方で1〜3回」から変えた。
 */
export const OPEN_TAPS = 3

export const yen = (value: number) => `¥${value.toLocaleString('ja-JP')}`
export const coinText = (value: number) => value.toLocaleString('ja-JP')
