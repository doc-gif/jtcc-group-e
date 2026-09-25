import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { qrPng } from './qr.mjs'
import { previewUrls } from './preview-request.mjs'

const TARGET = 'doc-gif/jtcc-group-e-preview'
const MAX_BYTES = 50 * 1024 * 1024
const html = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const page = (title, body) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${html(title)}</title><style>body{margin:0;background:#f5f7f5;color:#172324;font:1.0625rem/1.7 system-ui,sans-serif}main{max-width:720px;margin:auto;padding:24px}a{color:#16634d;display:inline-block;min-height:44px}a:focus-visible{outline:3px solid #16634d;outline-offset:3px}header{padding:8px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;background:white;border-bottom:1px solid #71827d}header a{display:flex;align-items:center}iframe{width:100%;flex:1;min-height:0;border:0;background:white}.viewer{height:100dvh;display:flex;flex-direction:column}small{font-size:.875rem}ul{padding-left:24px}</style></head><body>${body}</body></html>`

export function validatePreviewRequest(r) {
  if (!r || r.repository !== 'doc-gif/jtcc-group-e' || !Number.isSafeInteger(r.pr) || r.pr < 1
    || !Number.isSafeInteger(r.runId) || r.runId < 1 || !Number.isSafeInteger(r.artifactId) || r.artifactId < 1
    || !/^[a-f0-9]{40}$/.test(r.sha)) throw new Error('Invalid preview request')
}

// Bound size, forbid hidden files (including .git/.github), links and executable filesystem tricks.
export async function inspectBuild(dir) {
  const hash = createHash('sha256')
  let bytes = 0, count = 0
  async function walk(relative = '') {
    for (const name of (await readdir(join(dir, relative))).sort()) {
      if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name)) throw new Error('Unsafe build filename')
      const path = join(relative, name)
      const info = await lstat(join(dir, path))
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error('Build links or special files are forbidden')
      if (++count > 10000) throw new Error('Too many build entries')
      if (info.isDirectory()) await walk(path)
      else {
        bytes += info.size
        if (bytes > MAX_BYTES) throw new Error('Build too large')
        hash.update(path.split(sep).join('/')).update('\0').update(await readFile(join(dir, path)))
      }
    }
  }
  await walk()
  if (!(await lstat(join(dir, 'index.html'))).isFile()) throw new Error('Missing index.html')
  return { digest: hash.digest('hex'), bytes }
}

export function keepPreviews(entries, now) {
  const perPr = new Map()
  return [...entries].sort((a, b) => b.runId - a.runId).filter((e) => {
    const count = perPr.get(e.pr) ?? 0
    if (now - Date.parse(e.createdAt) > 30 * 86400000 || count >= 3) return false
    perPr.set(e.pr, count + 1)
    return true
  })
}

export async function composePreview({ siteDir, distDir, request, now = new Date().toISOString() }) {
  validatePreviewRequest(request)
  if (!Number.isFinite(Date.parse(now))) throw new Error('Invalid preview date')
  siteDir = resolve(siteDir)
  const marker = JSON.parse(await readFile(join(siteDir, '.preview-site.json'), 'utf8'))
  if (marker.repository !== TARGET) throw new Error('Refusing to write outside preview repository')
  let entries = []
  try { entries = JSON.parse(await readFile(join(siteDir, 'previews.json'), 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e }
  if (!Array.isArray(entries)) throw new Error('Invalid preview index')
  for (const e of entries) {
    validatePreviewRequest(e)
    if (!Number.isFinite(Date.parse(e.createdAt))) throw new Error('Invalid preview date')
    if (!Number.isSafeInteger(e.bytes) || e.bytes < 0 || !/^[a-f0-9]{64}$/.test(e.digest)) throw new Error('Invalid preview metadata')
  }
  if (entries.some((e) => e.pr === request.pr && e.runId > request.runId)) return { skipped: true }
  const { digest, bytes } = await inspectBuild(distDir)
  const existing = entries.find((e) => e.pr === request.pr && e.runId === request.runId)
  if (existing && (existing.digest !== digest || existing.sha !== request.sha || existing.artifactId !== request.artifactId)) throw new Error('Preview run is immutable')
  const entry = existing ?? { ...request, digest, bytes, createdAt: now }
  const folder = join(siteDir, `pr-${request.pr}`, 'runs', String(request.runId))
  if (!existing) {
    try { await lstat(folder); throw new Error('Unindexed preview directory exists') } catch (e) { if (e.code !== 'ENOENT') throw e }
    await mkdir(folder, { recursive: true })
    await cp(distDir, join(folder, 'app'), { recursive: true, dereference: false })
    await writeFile(join(folder, 'preview.json'), JSON.stringify(entry, null, 2) + '\n')
    await writeFile(join(folder, 'qr.png'), await qrPng(previewUrls(request).fixed))
    await writeFile(join(folder, 'index.html'), page('確認用プレビュー', `<div class="viewer"><header><strong>確認用・本番ではありません</strong><small>PR #${request.pr}・全体テストはCIで確認</small><a href="app/" target="_blank" rel="noopener">別画面で開く</a></header><iframe src="app/" title="変更後のアプリ" allow="clipboard-write"></iframe></div>`))
  }
  const all = existing ? entries : [...entries, entry]
  const kept = keepPreviews(all, Date.parse(now))
  if (kept.reduce((total, e) => total + e.bytes, 0) > 700 * 1024 * 1024) throw new Error('Preview quota exceeded; clean old previews before retrying')
  for (const e of all.filter((e) => !kept.includes(e))) await rm(join(siteDir, `pr-${e.pr}`, 'runs', String(e.runId)), { recursive: true, force: true })
  const prNumbers = [...new Set(kept.map((e) => e.pr))]
  for (const pr of new Set(all.map((e) => e.pr))) {
    const latest = kept.find((e) => e.pr === pr)
    const body = latest ? `<h1>修正結果を確認する</h1><p>本番とは別の確認用サイトです。</p><a href="runs/${latest.runId}/">PR #${pr} の最新の確認用画面を開く</a><p>確認した画面と気になる操作を担当者に伝えてください。</p>` : '<h1>このプレビューの保管期間は終了しました</h1><p>担当者に新しい確認用 URL を依頼してください。</p>'
    await writeFile(join(siteDir, `pr-${pr}`, 'index.html'), page('修正結果の確認', `<main>${body}</main>`))
  }
  await writeFile(join(siteDir, 'index.html'), page('JTCC 確認用サイト', `<main><h1>修正結果を確認する</h1><p>本番とは別の確認用サイトです。担当者から案内された PR を開いてください。</p><ul>${prNumbers.map((n) => `<li><a href="pr-${n}/">PR #${n} の確認用画面</a></li>`).join('')}</ul></main>`))
  await writeFile(join(siteDir, 'previews.json'), JSON.stringify(kept, null, 2) + '\n')
  await writeFile(join(siteDir, '.nojekyll'), '')
  return { skipped: false, entry }
}
