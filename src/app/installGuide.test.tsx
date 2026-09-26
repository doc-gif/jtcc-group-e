// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallGuide } from '../components/InstallGuide'
import { captureInstallPrompt, INSTALL_GUIDE_KEY, isStandalone, resetInstallPrompt } from './installGuide'

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, data }
}

const media = (standalone: boolean) => vi.fn((query: string) => ({ matches: standalone && query === '(display-mode: standalone)' }) as MediaQueryList)

function promptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
  event.prompt = vi.fn(() => Promise.resolve())
  event.userChoice = Promise.resolve({ outcome })
  return event
}

describe('isStandalone', () => {
  it('ホーム画面から開いた（display-mode: standalone・iOS の navigator.standalone）ときだけ true', () => {
    expect(isStandalone({ matchMedia: media(true), navigator: {} as unknown as Navigator })).toBe(true)
    expect(isStandalone({ matchMedia: media(false), navigator: { standalone: true } as unknown as Navigator })).toBe(true)
    expect(isStandalone({ matchMedia: media(false), navigator: { standalone: false } as unknown as Navigator })).toBe(false)
    // matchMedia のない環境でもタブとして扱う
    expect(isStandalone({ navigator: {} as unknown as Navigator })).toBe(false)
  })
})

describe('InstallGuide（#57）', () => {
  let release: (() => void) | undefined
  beforeEach(() => { window.matchMedia = media(false); release = captureInstallPrompt() })
  afterEach(() => { cleanup(); release?.(); resetInstallPrompt(); vi.restoreAllMocks() })

  it('タブで開いたときは手順と「閉じる」を出し、閉じるとその端末に保存して二度と出さない', () => {
    const store = memoryStore()
    render(<><h1 id="page-title" tabIndex={-1}>ラストピース</h1><InstallGuide storage={store} /></>)
    expect(screen.getByRole('heading', { name: 'ホーム画面に追加すると、全画面で遊べます' })).toBeTruthy()
    expect(screen.getByText('iPhone：共有ボタン →「ホーム画面に追加」')).toBeTruthy()
    expect(screen.getByText('Android：メニュー →「ホーム画面に追加」')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'ホーム画面に追加' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('heading', { name: /ホーム画面に追加/ })).toBeNull()
    expect(store.data.get(INSTALL_GUIDE_KEY)).toBe('1')
    // 押したボタンが消えるので、見出しへ焦点を戻す
    expect(document.activeElement?.id).toBe('page-title')
    cleanup()
    render(<InstallGuide storage={store} />)
    expect(screen.queryByRole('heading', { name: /ホーム画面に追加/ })).toBeNull()
  })

  it('ホーム画面から開いたときは出さない', () => {
    window.matchMedia = media(true)
    render(<InstallGuide storage={memoryStore()} />)
    expect(screen.queryByRole('heading', { name: /ホーム画面に追加/ })).toBeNull()
  })

  it('ブラウザが追加の画面を出せるときはボタンで出し、追加したら二度と出さない', async () => {
    const store = memoryStore()
    render(<InstallGuide storage={store} />)
    const event = promptEvent('accepted')
    act(() => { window.dispatchEvent(event) })
    // ブラウザが自分で出す案内の代わりに、この案内から出す
    expect(event.defaultPrevented).toBe(true)
    expect(screen.queryByText(/iPhone：/)).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'ホーム画面に追加' })) })
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('heading', { name: /ホーム画面に追加/ })).toBeNull()
    expect(store.data.get(INSTALL_GUIDE_KEY)).toBe('1')
  })

  it('追加の画面でやめたら、手順の案内に戻り「閉じる」で閉じられる', async () => {
    const store = memoryStore()
    render(<InstallGuide storage={store} />)
    act(() => { window.dispatchEvent(promptEvent('dismissed')) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'ホーム画面に追加' })) })
    expect(screen.getByText(/iPhone：/)).toBeTruthy()
    expect(store.data.has(INSTALL_GUIDE_KEY)).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(store.data.get(INSTALL_GUIDE_KEY)).toBe('1')
  })

  it('ほかの方法で追加が済んだ（appinstalled）ら消し、次からも出さない', () => {
    const store = memoryStore()
    render(<InstallGuide storage={store} />)
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(screen.queryByRole('heading', { name: /ホーム画面に追加/ })).toBeNull()
    expect(store.data.get(INSTALL_GUIDE_KEY)).toBe('1')
  })

  it('保存できない端末でも、閉じればこの画面では消える', () => {
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    render(<InstallGuide storage={broken} />)
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('heading', { name: /ホーム画面に追加/ })).toBeNull()
  })
})
