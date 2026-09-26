// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { pipiLines } from '../copy/pipi'
import { buzz, chime, CHIMES, speak } from './feedback'
import { parseHash, paths } from './router'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('画面のハッシュ', () => {
  test('設計書のルートに対応する', () => {
    expect(parseHash('')).toEqual({ name: 'town' })
    expect(parseHash('#/')).toEqual({ name: 'town' })
    expect(parseHash(paths.gachaList)).toEqual({ name: 'gachaList' })
    expect(parseHash('#/gacha/')).toEqual({ name: 'gachaList' })
    expect(parseHash(paths.welcome)).toEqual({ name: 'welcome' })
    expect(parseHash(paths.gacha('a-1'))).toEqual({ name: 'gacha', id: 'a-1' })
    expect(parseHash(paths.createRoom)).toEqual({ name: 'roomNew' })
    // 以前の「友達と回す」のリンクは、共有ルームを作る画面へ
    expect(parseHash('#/gacha/a-1/room')).toEqual({ name: 'roomNew' })
    expect(parseHash(paths.odds('a-1'))).toEqual({ name: 'odds', id: 'a-1' })
    expect(parseHash(paths.soloSpin('a-1'))).toEqual({ name: 'spin', id: 'a-1' })
    expect(parseHash(paths.room('0f8e-a1'))).toEqual({ name: 'room', invite: '0f8e-a1' })
    expect(parseHash(paths.host('Key_1-a'))).toEqual({ name: 'host', key: 'Key_1-a' })
    expect(parseHash(paths.host())).toEqual({ name: 'host', key: null })
    // 形の違うキーは「ホスト用リンクが無効」で案内する（見つからない扱いにしない）
    expect(parseHash('#/host/A B')).toEqual({ name: 'host', key: 'A B' })
    for (const name of ['collection', 'together', 'me', 'shelf'] as const) expect(parseHash(`#/${name}/`)).toEqual({ name })
    expect(parseHash(paths.shelfShare)).toEqual({ name: 'shelfShare' })
    expect(parseHash(paths.shelfItem('a-1'))).toEqual({ name: 'shelfItem', id: 'a-1' })
    expect(parseHash(paths.friend('yui'))).toEqual({ name: 'friend', id: 'yui' })
    expect(parseHash(paths.friendItem('yui', 'a-1'))).toEqual({ name: 'friendItem', id: 'yui', item: 'a-1' })
  })

  test('不正な形は見つからない扱い', () => {
    for (const hash of ['#/gacha/A B', '#/gacha/x/y', '#/room/x/y', '#/room/x/spin', '#/host/x/y', '#/spin/x', '#/other/x', '#/shelf/A B', '#/shelf/x/y', '#/friend/yui/A B', '#/friend/yui/x/y']) expect(parseHash(hash)).toEqual({ name: 'notfound' })
  })
})

describe('声・音・振動', () => {
  test('使えない端末では何もしない', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(() => chime(CHIMES.turn)).not.toThrow()
    expect(() => speak(pipiLines.turn1)).not.toThrow()
    expect(() => buzz(30)).not.toThrow()
  })

  test('使える端末では鳴らし、読み上げる', () => {
    const started: number[] = []
    class FakeAudio {
      state = 'suspended'
      currentTime = 0
      destination = {}
      resume = vi.fn(async () => {})
      createOscillator() { return { frequency: { value: 0 }, connect: (node: unknown) => node, start: (t: number) => started.push(t), stop: vi.fn() } }
      createGain() { const gain = { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (node: unknown) => node }; return gain }
    }
    vi.stubGlobal('AudioContext', FakeAudio)
    chime(CHIMES.big)
    expect(started.length).toBe(CHIMES.big.length)
    const spoken: string[] = []
    vi.stubGlobal('SpeechSynthesisUtterance', class { lang = ''; pitch = 1; rate = 1; text: string; constructor(text: string) { this.text = text } })
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: (u: { text: string }) => spoken.push(u.text) })
    speak('いい感じ〜！ その調子♡')
    expect(spoken[0]).toBe('いい感じー その調子')
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    buzz([30, 40])
    expect(vibrate).toHaveBeenCalledWith([30, 40])
  })
})

test('ピピのセリフは関数でも名前を受け取って返す', () => {
  expect(pipiLines.pair('さき')).toContain('さき')
  expect(pipiLines.friendFeatured('ゆい')).toContain('ゆい')
})
