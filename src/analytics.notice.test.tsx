// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import App from './App'
import { createAssetGate } from './app/assets'

// 外部送信の公表文（#46）。電気通信事業法の外部送信規律に合わせ、どこへ・何を・何のために送り、どう止めるかを
// マイページの「きまり」で読めるようにする。

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

afterEach(() => { cleanup() })

test('マイページの「きまり」に、送信先・送る情報・送らない情報・止め方を書く', () => {
  window.location.hash = '#/me'
  render(<App storage={new MemoryStorage()} assets={createAssetGate([])} />)
  const summary = screen.getByText('アクセス解析と外部送信について')
  expect(summary.tagName).toBe('SUMMARY')
  fireEvent.click(summary)
  const notice = summary.closest('details')!
  const text = notice.textContent ?? ''
  for (const words of ['Google アナリティクス 4（Google LLC）', 'Microsoft Clarity（Microsoft Corporation）', '広告には使いません', 'Cookie などの識別子',
    'ニックネーム・入力した内容・招待コード・ホスト用のキーは送信しません', '確認用のプレビューと開発中の環境からも送信しません', 'オプトアウト', '?internal=1', '?internal=0']) {
    expect(text).toContain(words)
  }
  expect(screen.getByRole('link', { name: 'オプトアウト アドオン' })).toHaveAttribute('href', 'https://tools.google.com/dlpage/gaoptout?hl=ja')
  expect(screen.getByRole('link', { name: 'Microsoft のプライバシーに関する声明' })).toHaveAttribute('href', 'https://privacy.microsoft.com/ja-jp/privacystatement')
  // 既存の「きまり」と同じ並び（「提案モック」の表示要件などは変えない）
  const summaries = [...document.querySelectorAll('#rules-title ~ details > summary')].map((node) => node.textContent)
  expect(summaries).toEqual(['確率の表示について', 'コインについて', '取り扱い商品のルール', 'アクセス解析と外部送信について', '特定商取引法・資金決済法に基づく表示'])
})
