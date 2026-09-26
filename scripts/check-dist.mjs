// ビルドの成果物（dist/）に、限定公開アプリのキャラクターの絵・内部素材の ID・Figma の URL・公開 URL と署名付き URL を
// 入れていないことを確かめる（#144 案 D の 2-3、#149）。`pnpm build` の最後に走るので、Quality gate・Preview build・
// 本番公開に使う web-dist の 3 つとも同じ検査を通る。使い方: node scripts/check-dist.mjs dist [public]
import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 画像の拡張子。dist/ のこれらは public/ に同じパス・同じ中身があるものだけ許す（Vite が import した画像も含む）。 */
export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg', '.ico', '.bmp'])
/** 中身の文字を検査する成果物。 */
export const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.json', '.webmanifest', '.map', '.txt', '.svg', '.xml'])
/** これ以上長い data:image/ の埋め込みは、画像を base64 で同梱したとみなす。 */
export const DATA_IMAGE_LIMIT = 2048

/**
 * テキストの成果物に入れてはいけないもの。
 * createSignedUrl・getPublicUrl は @supabase/supabase-js がメソッドとして定義しているので、名前ではなく「呼び出し」（`.名前(`）を探す。
 */
export const FORBIDDEN_TEXT = [
  { name: '内部素材の ID（W・P・L + 3 桁）', pattern: /\b[WPL]0\d\d\b/ },
  { name: 'Figma の URL', pattern: /figma\.com/ },
  { name: '素材ライブラリの Figma ファイル', pattern: /MYYMoB2wL7LvA2oXZ2gxpT/ },
  { name: 'デザインの Figma ファイル', pattern: /yeDF1BwhrxpXI57Daainle/ },
  { name: '署名付き URL の作成（createSignedUrl の呼び出し）', pattern: /\.createSignedUrls?\s*\(/ },
  { name: '公開 URL の作成（getPublicUrl の呼び出し）', pattern: /\.getPublicUrl\s*\(/ },
  { name: 'Storage の公開 URL', pattern: /\/storage\/v1\/object\/public\// },
  { name: 'Storage の署名付き URL', pattern: /\/storage\/v1\/object\/sign\// },
]

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(path))
    else if (entry.isFile()) out.push(path)
  }
  return out
}

async function readOrNull(path) {
  try { return await readFile(path) } catch { return null }
}

/**
 * dist の問題の一覧（空なら合格）。各要素は「ファイル: 理由」。
 * @param {string} distDir
 * @param {string} [publicDir]
 * @returns {Promise<string[]>}
 */
export async function checkDist(distDir, publicDir = 'public') {
  const problems = []
  for (const path of await walk(distDir)) {
    const rel = relative(distDir, path).replaceAll('\\', '/')
    const ext = extname(path).toLowerCase()
    const body = await readFile(path)
    if (IMAGE_EXTENSIONS.has(ext)) {
      const original = await readOrNull(join(publicDir, rel))
      if (!original) problems.push(`${rel}: public/ に無い画像（許可リストの外の画像はビルドに入れない）`)
      else if (!original.equals(body)) problems.push(`${rel}: public/ の同じパスの画像と中身が違う`)
    }
    if (TEXT_EXTENSIONS.has(ext)) {
      const text = body.toString('utf8')
      for (const { name, pattern } of FORBIDDEN_TEXT) {
        const found = pattern.exec(text)
        if (found) problems.push(`${rel}: ${name}「${found[0]}」`)
      }
      for (const match of text.matchAll(/data:image\/[^"'`)\s]*/g)) {
        if (match[0].length >= DATA_IMAGE_LIMIT) {
          problems.push(`${rel}: ${match[0].length} 文字の data:image/ の埋め込み（画像を同梱しない）`)
          break
        }
      }
    }
  }
  return problems
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [dist = 'dist', pub = 'public'] = process.argv.slice(2)
  const problems = await checkDist(dist, pub)
  if (problems.length > 0) {
    console.error(`check-dist: ${dist}/ に入れてはいけないものがあります（docs/PITCH_CHARACTERS.md）`)
    for (const problem of problems) console.error(`- ${problem}`)
    process.exit(1)
  }
  console.log(`check-dist: ${dist}/ に素材の画像・内部素材の ID・Figma の URL・公開 URL・署名付き URL はありません`)
}
