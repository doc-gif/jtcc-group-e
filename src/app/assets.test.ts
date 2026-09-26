// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createAssetGate, fontsReady, loadImage } from './assets'
import { TOWN_IMAGES } from './townAssets'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('準備の待ち合わせ（読み込み中の画面の元）', () => {
  test('待つものがなければ最初から準備済み', () => {
    expect(createAssetGate([]).getStatus()).toBe('ready')
  })

  test('全部そろったら準備済み。load を何度呼んでも読み込みは1回', async () => {
    const task = vi.fn(() => Promise.resolve())
    const gate = createAssetGate([task, task])
    const listener = vi.fn()
    const unsubscribe = gate.subscribe(listener)
    expect(gate.getStatus()).toBe('loading')
    gate.load()
    gate.load()
    expect(task).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(gate.getStatus()).toBe('ready'))
    expect(listener).toHaveBeenCalledTimes(1)
    gate.load()
    expect(task).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  test('ひとつでも失敗したら失敗。もう一度読み込むと、読み込み中に戻ってやり直す', async () => {
    let fail = true
    const task = vi.fn(() => (fail ? Promise.reject(new Error('offline')) : Promise.resolve()))
    const gate = createAssetGate([() => Promise.resolve(), task])
    gate.load()
    await vi.waitFor(() => expect(gate.getStatus()).toBe('error'))
    fail = false
    gate.load()
    expect(gate.getStatus()).toBe('loading')
    await vi.waitFor(() => expect(gate.getStatus()).toBe('ready'))
    expect(task).toHaveBeenCalledTimes(2)
  })
})

describe('画像と文字の読み込み', () => {
  class FakeImage {
    static instances: FakeImage[] = []
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    decoding = ''
    src = ''
    decode?: () => Promise<void>
    constructor() { FakeImage.instances.push(this) }
  }

  test('読み込めてデコードが終わったら準備済み。デコードに失敗しても表示はできるので準備済み', async () => {
    FakeImage.instances = []
    vi.stubGlobal('Image', FakeImage)
    const ok = loadImage('a.png')
    const image = FakeImage.instances[0]
    expect(image.src).toBe('a.png')
    image.decode = () => Promise.resolve()
    image.onload?.()
    await expect(ok).resolves.toBeUndefined()
    const broken = loadImage('b.png')
    FakeImage.instances[1].decode = () => Promise.reject(new Error('decode'))
    FakeImage.instances[1].onload?.()
    await expect(broken).resolves.toBeUndefined()
    const old = loadImage('c.png')
    FakeImage.instances[2].onload?.()
    await expect(old).resolves.toBeUndefined()
  })

  test('読み込めなければ失敗', async () => {
    FakeImage.instances = []
    vi.stubGlobal('Image', FakeImage)
    const failed = loadImage('missing.png')
    FakeImage.instances[0].onerror?.()
    await expect(failed).rejects.toThrow('missing.png')
  })

  test('文字の読み込みを待つ。対応していなければ待たない', async () => {
    const ready = Promise.resolve('fonts')
    Object.defineProperty(document, 'fonts', { value: { ready }, configurable: true })
    await expect(fontsReady()).resolves.toBe('fonts')
    Object.defineProperty(document, 'fonts', { value: undefined, configurable: true })
    await expect(fontsReady()).resolves.toBeUndefined()
  })

  test('街で待つのは、街の上部のアイコンと注目のピースの絵だけ（地図は組み込みの SVG）', () => {
    expect(TOWN_IMAGES).toEqual(['/assets/icons/coin.png', '/assets/icons/mypage.png', expect.stringMatching(/^\/assets\/goods\/[a-z-]+\.png$/)])
  })
})
