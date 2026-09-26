// 法務・ブランドのきまりを CI で落とせる状態にする（docs/PRODUCT.md「守ること」）。
import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { expect, test } from 'vitest'

async function files(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await files(path))
    else out.push(path)
  }
  return out
}

const sources = (await files('src')).filter((path) => /\.(ts|tsx|css)$/.test(path) && !/\.test\.tsx?$/.test(path))
const read = async (path) => (await readFile(path, 'utf8'))

test('禁止語（換金・必ず当たる・還元率100%・等級の文字）を画面の文言に使わない', async () => {
  const banned = ['換金', '必ず当たる', '還元率100', '還元率 100', '大当たり', '中当たり']
  for (const path of sources) {
    const text = await read(path)
    for (const word of banned) expect(text.includes(word), `${path} に「${word}」`).toBe(false)
  }
})

test('「提案モック・公式サービスではありません」を表示する部品があり、各入口で使う', async () => {
  expect(await read('src/components/Chrome.tsx')).toContain('提案モック・公式サービスではありません')
  for (const screen of ['Town', 'GachaList', 'GachaDetail', 'GachaOdds', 'Welcome', 'Room', 'Spin', 'Collection', 'Me', 'Together']) {
    expect(await read(`src/screens/${screen}.tsx`), screen).toContain('<MockNotice />')
  }
})

test('ピピのセリフに実在キャラクターの名前を入れない', async () => {
  const text = await read('src/copy/pipi.ts')
  for (const name of ['マイメロ', 'クロミ', 'キティ', 'シナモ', 'ポムポム', 'すみっコ', 'ちいかわ', 'ハチワレ', 'うさぎ', 'ハイキュー', '日向', '影山', 'サンリオ']) {
    expect(text.includes(name), `ピピのセリフに「${name}」`).toBe(false)
  }
})

test('画像は assets/lastpiece 由来のオリジナル素材だけ（許可した置き場所のみ）', async () => {
  const allowedDirs = ['assets/banners', 'assets/categories', 'assets/goods', 'assets/icons', 'assets/logo', 'assets/series']
  const allowedRoot = ['favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'manifest.json']
  for (const path of await files('public')) {
    const relative = path.slice('public/'.length).replaceAll('\\', '/')
    const ok = allowedRoot.includes(relative) || (allowedDirs.some((dir) => relative.startsWith(`${dir}/`)) && extname(relative) === '.png')
    expect(ok, `許可されていない公開ファイル: ${relative}`).toBe(true)
  }
})

test('コインの交換率は一律 20%、出金不可と取り消し不可を交換シートに書く', async () => {
  expect(await read('src/domain/odds.ts')).toMatch(/EXCHANGE_RATE = 0\.2\b/)
  const sheet = await read('src/screens/Collection.tsx')
  expect(sheet).toContain('出金はできません')
  expect(sheet).toContain('交換は取り消せません')
})

test('ガチャ詳細に残り口数の数字（◯/◯）を出さない', async () => {
  const detail = await read('src/screens/GachaDetail.tsx')
  expect(detail).not.toMatch(/remaining\}\s*\/|残り\s*\{/)
  expect(detail).toContain('<RemainBar')
})
