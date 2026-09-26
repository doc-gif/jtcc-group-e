// scripts/check-dist.mjs の検査（#149）。仮の dist/ と public/ を一時フォルダに作る。画像は無地のダミー（数バイト）で、素材は使わない。
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { checkDist, DATA_IMAGE_LIMIT } from './check-dist.mjs'

const dummyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const otherPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 1, 1, 1])

let root
let dist
let pub

async function put(base, path, body) {
  await mkdir(dirname(join(base, path)), { recursive: true })
  await writeFile(join(base, path), body)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'check-dist-'))
  dist = join(root, 'dist')
  pub = join(root, 'public')
  // 正常な成果物: public/ の画像のコピー・JS・CSS・HTML・フォント
  await put(pub, 'assets/goods/plush.png', dummyPng)
  await put(pub, 'manifest.json', '{"name":"ラストピース"}')
  await put(dist, 'assets/goods/plush.png', dummyPng)
  await put(dist, 'manifest.json', '{"name":"ラストピース"}')
  await put(dist, 'index.html', '<!doctype html><link rel="icon" href="data:image/svg+xml,%3Csvg%3E%3C/svg%3E">')
  await put(dist, 'assets/index.css', '.a{background:url(data:image/png;base64,AAAA)}')
  await put(dist, 'assets/font.woff2', Buffer.from([0x77, 0x4f, 0x46, 0x32]))
  // supabase-js のメソッドの定義と、バケットから本人の認証で読むだけの呼び出しは許す
  await put(dist, 'assets/index.js', 'class S{async createSignedUrl(e,t){return`${this.url}/object/sign/${e}`}getPublicUrl(e){return e}}x.storage.from("pitch-characters").download("chars/town-shop.png")')
})

afterEach(async () => { await rm(root, { recursive: true, force: true }) })

test('正常な成果物は合格', async () => {
  await expect(checkDist(dist, pub)).resolves.toEqual([])
})

test('public/ に無い画像・中身の違う画像があれば失敗（キャラクターの絵を同梱しない）', async () => {
  await put(dist, 'chars/town-shop.png', dummyPng)
  await put(dist, 'assets/character-abc123.webp', dummyPng)
  await put(dist, 'assets/goods/plush.png', otherPng)
  const problems = await checkDist(dist, pub)
  expect(problems).toHaveLength(3)
  expect(problems.join('\n')).toMatch(/chars\/town-shop\.png: public\/ に無い画像/)
  expect(problems.join('\n')).toMatch(/character-abc123\.webp: public\/ に無い画像/)
  expect(problems.join('\n')).toMatch(/plush\.png: public\/ の同じパスの画像と中身が違う/)
})

test.each([
  ['内部素材の ID', 'const a="W001"'],
  ['内部素材の ID', 'const a="L015"'],
  ['Figma の URL', 'const a="https://www.figma.com/design/x"'],
  ['素材ライブラリの Figma ファイル', 'const a="MYYMoB2wL7LvA2oXZ2gxpT"'],
  ['デザインの Figma ファイル', 'const a="yeDF1BwhrxpXI57Daainle"'],
  ['createSignedUrl の呼び出し', 'x.storage.from("pitch-characters").createSignedUrl("chars/a.png",60)'],
  ['createSignedUrl の呼び出し', 'x.storage.from("b").createSignedUrls(["a"],60)'],
  ['getPublicUrl の呼び出し', 'x.storage.from("pitch-characters").getPublicUrl("chars/a.png")'],
  ['Storage の公開 URL', 'const a="https://abc.supabase.co/storage/v1/object/public/pitch-characters/chars/a.png"'],
  ['Storage の署名付き URL', 'const a="https://abc.supabase.co/storage/v1/object/sign/pitch-characters/chars/a.png?token=x"'],
])('テキストの成果物に %s があれば失敗', async (name, code) => {
  await put(dist, 'assets/leak.js', code)
  const problems = await checkDist(dist, pub)
  expect(problems).toHaveLength(1)
  expect(problems[0]).toMatch(/^assets\/leak\.js: /)
  expect(problems[0]).toContain(name.replace(/ の呼び出し$/, ''))
})

test('素材の ID に似た別の語（W0010・AW001・W01）は失敗にしない', async () => {
  await put(dist, 'assets/ok.js', 'const a="W0010 AW001 W01 w001"')
  await expect(checkDist(dist, pub)).resolves.toEqual([])
})

test(`${DATA_IMAGE_LIMIT} 文字以上の data:image/ の埋め込みは失敗（base64 で絵を同梱しない）`, async () => {
  const big = `data:image/png;base64,${'A'.repeat(DATA_IMAGE_LIMIT)}`
  await put(dist, 'assets/big.css', `.c{background:url(${big})}`)
  await put(dist, 'assets/small.css', `.c{background:url(data:image/png;base64,${'A'.repeat(100)})}`)
  const problems = await checkDist(dist, pub)
  expect(problems).toHaveLength(1)
  expect(problems[0]).toMatch(/^assets\/big\.css: \d+ 文字の data:image\//)
})

test('コマンドとして実行すると、問題があれば一覧を出して失敗し、無ければ成功する', async () => {
  const run = () => execFileSync(process.execPath, ['scripts/check-dist.mjs', dist, pub], { encoding: 'utf8', stdio: 'pipe' })
  expect(run()).toContain('check-dist:')
  await put(dist, 'chars/town-shop.png', dummyPng)
  let error
  try { run() } catch (caught) { error = caught }
  expect(error?.status).toBe(1)
  expect(String(error?.stderr)).toContain('chars/town-shop.png')
})
