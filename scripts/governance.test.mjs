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

test('内部素材の ID・Figma のファイルと URL をアプリのコードに入れない（コメントは除く。ビルドに残るため）', async () => {
  for (const path of sources) {
    const code = (await read(path)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code.match(/\b[WPL]0\d\d\b|figma\.com|yeDF1BwhrxpXI57Daainle|MYYMoB2wL7LvA2oXZ2gxpT/g), path).toBeNull()
  }
})

test('「提案モック・公式サービスではありません」を表示する部品があり、各入口で使う', async () => {
  expect(await read('src/components/Chrome.tsx')).toContain('提案モック・公式サービスではありません')
  for (const screen of ['Town', 'GachaList', 'GachaDetail', 'GachaOdds', 'Welcome', 'Room', 'Spin', 'Collection', 'Me', 'Together', 'Shelf', 'Friend']) {
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

test('ガチャ詳細・中身と確率に残り口数の数字（◯/◯）を出さない。残りは一覧のカードで数字なしのバーと言葉で出す', async () => {
  for (const file of ['src/screens/GachaDetail.tsx', 'src/screens/GachaOdds.tsx']) {
    expect(await read(file)).not.toMatch(/remaining\}\s*\/|残り\s*\{/)
  }
  // 担当者の決定（2026-09-26）でガチャ詳細はマスター 267:8279 に合わせ、残りバーは一覧のカード（マスター 267:8266「残り たっぷり」）で出す
  expect(await read('src/screens/GachaList.tsx')).toContain('<RemainBar')
})

test('F15: ビルドの Supabase 設定（.env.production）はブラウザに公開してよい URL と publishable キーだけ', async () => {
  const lines = (await read('.env.production')).split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  const entries = Object.fromEntries(lines.map((line) => line.split(/=(.*)/s).slice(0, 2)))
  expect(Object.keys(entries).sort()).toEqual(['VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_URL'])
  expect(entries.VITE_SUPABASE_URL).toMatch(/^https:\/\/[a-z0-9]{20}\.supabase\.co$/)
  expect(entries.VITE_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_[A-Za-z0-9_-]+$/)
  // service_role・secret・旧形式の JWT（anon でも service_role でも同じ形）を置かない
  for (const path of ['.env.production', ...sources]) {
    const text = await read(path)
    expect(/sb_secret_|service_role|eyJhbGciOi/.test(text), path).toBe(false)
  }
})
