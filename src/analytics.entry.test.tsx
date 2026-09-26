// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import { track, trackOnce } from './app/analytics'
import { createAssetGate } from './app/assets'
import { capsuleDropMs } from './components/spinEffect'
import { TIMING, TURNS } from './domain/spinScript'

/**
 * #43: 入口〜ひとりで回すの計測（demo_start・spin・spin_first）。
 * `src/app/analytics.ts` を差し替え、画面が「いつ・何を」呼ぶかだけを確かめる（送る環境の判定と 1 回だけの仕組みは analytics.test.ts）。
 * trackOnce の偽物は本物と同じ約束（同じ key は 1 回だけ track する）を持ち、2 回目の spin で spin_first が送られないことを見る。
 */
const once = vi.hoisted(() => new Set<string>())
vi.mock('./app/analytics', () => ({
  track: vi.fn(),
  trackOnce: vi.fn((key: string, event: string, params?: Record<string, string | number | boolean>) => {
    if (once.has(key)) return
    once.add(key)
    track(event, params)
  }),
}))

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

let store: MemoryStorage

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}
const tick = (ms: number) => { act(() => { vi.advanceTimersByTime(ms) }) }
const button = (name: string | RegExp) => screen.getByRole('button', { name })

function start(hash = '#/') {
  window.location.hash = hash
  return render(<App storage={store} assets={createAssetGate([])} />)
}

/** 送ったイベント名を順に返す（track の呼び出しだけ。trackOnce は偽物が track に流す）。 */
const sentEvents = () => vi.mocked(track).mock.calls.map(([event]) => event)

/** 回す前の確認で確定し、「1タップで1回転」を 3 回押す（カプセルが落ちる = `dropping`）。 */
function confirmAndTurn() {
  fireEvent.click(button(/使って1回引く/))
  for (let i = 0; i < TURNS; i += 1) fireEvent.click(button(/1タップで1回転/))
}

/** カプセルを開けて結果まで進める（開封へ進むのはカプセルが出て光ったあと。#116、jsdom は通常の動き）。 */
function open() {
  tick(capsuleDropMs(false))
  for (let i = 0; i < 3; i += 1) {
    const capsule = screen.queryByRole('button', { name: /カプセルをタップ/ })
    if (capsule) fireEvent.click(capsule)
  }
  tick(TIMING.open)
}

beforeEach(() => {
  store = new MemoryStorage()
  once.clear()
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.99)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('入口: demo_start', () => {
  test('はじめての画面でニックネームを決めて「はじめる」と、街へ移ってから demo_start を 1 回送る（ニックネームは送らない）', () => {
    start('#/welcome')
    fireEvent.click(button('はじめる'))
    expect(screen.getByText('ニックネームを入れてください')).toBeVisible()
    expect(track).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/ニックネーム/), { target: { value: 'あや' } })
    fireEvent.click(button('はじめる'))
    expect(window.location.hash).toBe('#/')
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('demo_start')
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain('あや')
    expect(trackOnce).not.toHaveBeenCalled()
  })
})

describe('ひとりで回す: spin と spin_first', () => {
  test('確定や途中の回転では送らず、3 回転でカプセルが落ちた時点で spin と spin_first を送る', () => {
    start('#/gacha/melody-anniv/spin')
    fireEvent.click(button(/使って1回引く/))
    expect(track).not.toHaveBeenCalled()
    for (let i = 0; i < TURNS - 1; i += 1) fireEvent.click(button(/1タップで1回転/))
    expect(screen.getByText(`回転 ${TURNS - 1} / ${TURNS}`)).toBeInTheDocument()
    expect(track).not.toHaveBeenCalled()
    expect(trackOnce).not.toHaveBeenCalled()
    fireEvent.click(button(/1タップで1回転/))
    expect(track).toHaveBeenCalledWith('spin', { mode: 'solo', featured: false })
    expect(trackOnce).toHaveBeenCalledWith('spin_first', 'spin_first', { mode: 'solo' })
    expect(sentEvents()).toEqual(['spin', 'spin_first'])
    // 計測は演出の後（phase は既に dropping）で、既存の流れを変えない
    expect(screen.getByRole('button', { name: /1タップで1回転/ })).toBeDisabled()
    open()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('今回の結果')
    expect(sentEvents()).toEqual(['spin', 'spin_first'])
  })

  test('2 回目は spin だけで、spin_first は送らない', () => {
    start('#/gacha/melody-anniv/spin')
    confirmAndTurn()
    open()
    go('#/gacha/melody-anniv')
    go('#/gacha/melody-anniv/spin')
    confirmAndTurn()
    open()
    expect(vi.mocked(track).mock.calls.filter(([event]) => event === 'spin')).toHaveLength(2)
    expect(trackOnce).toHaveBeenCalledTimes(2)
    expect(vi.mocked(trackOnce).mock.calls.every(([key]) => key === 'spin_first')).toBe(true)
    expect(sentEvents()).toEqual(['spin', 'spin_first', 'spin'])
  })

  test('目玉を当てたときは featured が true になり、賞品名・金額は送らない', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    start('#/gacha/melody-anniv/spin')
    confirmAndTurn()
    expect(track).toHaveBeenCalledWith('spin', { mode: 'solo', featured: true })
    open()
    expect(screen.getByRole('heading', { name: '会場限定ドレスマスコット' })).toBeVisible()
    const sent = JSON.stringify([...vi.mocked(track).mock.calls, ...vi.mocked(trackOnce).mock.calls])
    expect(sent).not.toContain('会場限定')
    expect(sent).not.toContain('12000')
    expect(sent).not.toContain('1500')
    for (const [, params] of vi.mocked(track).mock.calls) {
      for (const value of Object.values(params ?? {})) expect(['solo', true, false]).toContain(value)
    }
  })

  test('右のハンドルのタップで回しても、3 回転目で同じイベントを送る', () => {
    start('#/gacha/melody-anniv/spin')
    fireEvent.click(button(/使って1回引く/))
    // 指で押す範囲（`.m-knob-hit`）。読み上げ・キーボードは「1タップで1回転」のボタン
    const handle = document.querySelector('.m-knob-hit')
    expect(handle).not.toBeNull()
    for (let i = 0; i < TURNS; i += 1) fireEvent.click(handle!)
    expect(sentEvents()).toEqual(['spin', 'spin_first'])
  })
})
