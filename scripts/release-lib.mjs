import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

export function validateVersion(version) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '')) {
    throw new Error('Version must be vMAJOR.MINOR.PATCH (example: v0.1.0)')
  }
  return version
}

export function compareVersions(a, b) {
  const left = validateVersion(a).slice(1).split('.').map(BigInt)
  const right = validateVersion(b).slice(1).split('.').map(BigInt)
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1
  }
  return 0
}

export async function digestDirectory(directory) {
  const hash = createHash('sha256')
  let size = 0
  async function visit(folder, prefix = '') {
    const entries = await readdir(folder, { withFileTypes: true })
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    for (const entry of entries) {
      const name = `${prefix}${entry.name}`
      const path = join(folder, entry.name)
      if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed in a Pages artifact')
      if (entry.isDirectory()) await visit(path, `${name}/`)
      else if (entry.isFile()) {
        const content = await readFile(path)
        size += content.length
        hash.update(`${name}\0${content.length}\0`).update(content)
      } else throw new Error('Unsupported artifact entry')
    }
  }
  await visit(directory)
  return { digest: hash.digest('hex'), size }
}

export async function composeSite({ siteDir, distDir, version, sha, repository, createdAt = new Date().toISOString(), maxBytes = 900 * 1024 * 1024 }) {
  validateVersion(version)
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Expected a full commit SHA')
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository')
  const site = resolve(siteDir)
  const dist = resolve(distDir)
  if (site === dist || site.startsWith(dist + sep) || dist.startsWith(site + sep)) throw new Error('Source and site must be separate directories')
  await readFile(join(dist, 'index.html'))
  const built = await digestDirectory(dist)
  const distEntries = await readdir(dist)
  if (distEntries.some((name) => ['versions', 'deployment.json', '.git', '.nojekyll'].includes(name))) throw new Error('Build uses a reserved archive path')
  await mkdir(site, { recursive: true })
  if ((await readdir(site)).includes('.git')) throw new Error('Refusing to modify a repository root')
  await mkdir(join(site, 'versions'), { recursive: true })
  const manifestPath = join(site, 'versions', 'manifest.json')
  let entries = []
  try { entries = JSON.parse(await readFile(manifestPath, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!Array.isArray(entries)) throw new Error('Invalid release manifest')
  const seen = new Set()
  for (const entry of entries) {
    validateVersion(entry.version)
    if (seen.has(entry.version) || !/^[a-f0-9]{40}$/.test(entry.sha) || !/^[a-f0-9]{64}$/.test(entry.digest) || entry.repository !== repository) throw new Error('Invalid release manifest entry')
    seen.add(entry.version)
    if ((await digestDirectory(join(site, 'versions', entry.version))).digest !== entry.digest) throw new Error('Archived version was modified')
  }
  const existing = entries.find((entry) => entry.version === version)
  const newest = [...entries].sort((a, b) => compareVersions(b.version, a.version))[0]
  if (newest && compareVersions(version, newest.version) < 0) throw new Error('A release cannot move latest backwards; use a new version')
  const snapshot = join(site, 'versions', version)
  if (existing) {
    if (existing.sha !== sha || existing.digest !== built.digest) throw new Error('An existing version is immutable')
  } else {
    if ((await readdir(join(site, 'versions'))).includes(version)) throw new Error('Unregistered version directory exists')
    await cp(dist, snapshot, { recursive: true, errorOnExist: true, force: false })
    entries.push({ version, sha, digest: built.digest, createdAt, repository })
  }
  // siteDir is a dedicated generated directory, never the repository root.
  for (const name of await readdir(site)) {
    if (name !== 'versions') await rm(join(site, name), { recursive: true, force: true })
  }
  for (const name of distEntries) await cp(join(dist, name), join(site, name), { recursive: true })
  entries.sort((a, b) => compareVersions(b.version, a.version))
  await writeFile(manifestPath, JSON.stringify(entries, null, 2) + '\n')
  await writeFile(join(site, 'deployment.json'), JSON.stringify(entries.find((entry) => entry.version === version), null, 2) + '\n')
  await writeFile(join(site, '.nojekyll'), '')
  await writeFile(join(site, 'versions', 'index.html'), renderHistory(entries))
  if ((await digestDirectory(site)).size > maxBytes) throw new Error('Pages archive exceeds 900 MiB budget; migrate history before publishing')
  return entries.find((entry) => entry.version === version)
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

export function renderHistory(entries) {
  const rows = entries.map(({ version, sha, createdAt, repository }) => `<li><a href="./${escapeHtml(version)}/">${escapeHtml(version)}</a> <small>${escapeHtml(createdAt)} · ${escapeHtml(sha.slice(0, 7))}</small> <a href="https://github.com/${escapeHtml(repository)}/releases/tag/${escapeHtml(version)}">Release</a></li>`).join('\n')
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>バージョン履歴 | JTCC Group E</title><style>body{max-width:52rem;margin:3rem auto;padding:env(safe-area-inset-top) max(1.25rem,env(safe-area-inset-right)) env(safe-area-inset-bottom) max(1.25rem,env(safe-area-inset-left));font:1rem/1.8 system-ui;color:#172324;background:#f5f7f5}h1{overflow-wrap:anywhere}a{color:#16634d;display:inline-block;min-width:44px;min-height:44px;line-height:44px}li{margin:1rem 0;overflow-wrap:anywhere}small{display:block}:focus-visible{outline:3px solid #16634d;outline-offset:3px}</style></head><body><main><h1>バージョン履歴</h1><p><a href="../">最新版を開く</a></p><ul>${rows}</ul></main></body></html>`
}
