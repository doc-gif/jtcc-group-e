// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import { track } from './app/analytics'
import { createAssetGate } from './app/assets'
import { createInitialState } from './domain/game'
import { exchangeCoins } from './domain/odds'
import { STORAGE_KEY } from './domain/storage'
import type { WinRecord } from './domain/types'

// 計測（#45）: 当てたものの「コインに交換」「届けてもらう」の確定で track が呼ばれることだけを確かめる。
// 本物の analytics は jsdom では何も送らないため、差し替えて呼び出しを見る。
vi.mock('./app/analytics', () => ({ track: vi.fn(), trackOnce: vi.fn(), initAnalytics: vi.fn() }))

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

/** 手元にある当たり（サンリオ カプセルミックス。参考価格 900 円と 800 円） */
const wins: WinRecord[] = [
  { id: 'w1', gachaId: 'sanrio-capsule', prizeId: 'sanrio-capsule-3', spent: 500, wonAt: '2026-09-26T00:00:00.000Z', companions: [], status: 'kept' },
  { id: 'w2', gachaId: 'sanrio-capsule', prizeId: 'sanrio-capsule-4', spent: 500, wonAt: '2026-09-26T00:00:00.000Z', companions: ['ぴぴ'], status: 'kept' },
]

let store: MemoryStorage
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const tracked = () => vi.mocked(track).mock.calls

function openCollection(seed: WinRecord[] = wins) {
  store.setItem(STORAGE_KEY, JSON.stringify({ ...createInitialState(), nickname: 'ひみつの名前', wins: seed }))
  window.location.hash = '#/collection'
  render(<App storage={store} assets={createAssetGate([])} />)
}

beforeEach(() => {
  store = new MemoryStorage()
  vi.mocked(track).mockClear()
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('当てたものの計測（exchange / deliver）', () => {
  test('コインに交換を確定すると exchange を 1 回、点数と得たコインの合計で送る', () => {
    openCollection()
    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[0])
    fireEvent.click(boxes[1])
    fireEvent.click(button('コインに交換'))
    const sheet = screen.getByRole('dialog', { name: 'コインに交換しますか？' })
    expect(within(sheet).getByText(/出金はできません/)).toBeVisible()
    expect(within(sheet).getByText('交換は取り消せません。')).toBeVisible()
    expect(tracked()).toHaveLength(0)
    fireEvent.click(within(sheet).getByRole('button', { name: 'コインに交換する' }))
    expect(tracked()).toEqual([['exchange', { count: 2, coins: exchangeCoins(900) + exchangeCoins(800) }]])
    expect(screen.getByRole('status')).toHaveTextContent('2点をコインに交換しました')
  })

  test('届けてもらうを確定すると deliver を 1 回、点数で送る', () => {
    openCollection()
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(button('届けてもらう'))
    const sheet = screen.getByRole('dialog', { name: '届けてもらいますか？' })
    expect(tracked()).toHaveLength(0)
    fireEvent.click(within(sheet).getByRole('button', { name: '届け待ちにする' }))
    expect(tracked()).toEqual([['deliver', { count: 1 }]])
    expect(screen.getByRole('status')).toHaveTextContent('1点を届け待ちにしました')
  })

  test('シートを「やめる」で閉じたときは送らない', () => {
    openCollection()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(button('コインに交換'))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'やめる' }))
    fireEvent.click(button('届けてもらう'))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'やめる' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(tracked()).toHaveLength(0)
  })

  test('パラメータに賞品名・ニックネーム・自由入力・招待コード・ホストキーを含めない', () => {
    openCollection()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(button('コインに交換'))
    fireEvent.click(button('コインに交換する'))
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(button('届けてもらう'))
    fireEvent.click(button('届け待ちにする'))
    expect(tracked().map(([event]) => event)).toEqual(['exchange', 'deliver'])
    for (const [, params] of tracked()) {
      expect(Object.keys(params ?? {}).every((key) => ['count', 'coins'].includes(key))).toBe(true)
      expect(Object.values(params ?? {}).every((value) => typeof value === 'number')).toBe(true)
      expect(JSON.stringify(params)).not.toMatch(/ひみつの名前|アクリルスタンド|ミニポーチ|ぴぴ/)
    }
  })
})
