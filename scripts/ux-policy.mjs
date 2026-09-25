import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

export const requiredCriteria = ['HIG-01', 'HIG-02', 'HIG-03', 'HIG-04', 'HIG-05', 'GAME-01', 'GAME-02', 'GAME-03', 'GAME-04', 'GAME-05']

export async function uiDigest(root) {
  const hash = createHash('sha256')
  async function visit(relative) {
    const entries = await readdir(join(root, relative), { withFileTypes: true })
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    for (const entry of entries) {
      const path = `${relative}/${entry.name}`
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) {
        const content = await readFile(join(root, path))
        const normalized = ['.ts', '.tsx', '.css', '.svg', '.json'].includes(extname(path)) ? Buffer.from(content.toString().replace(/\r\n/g, '\n')) : content
        hash.update(`${path}\0${normalized.length}\0`).update(normalized)
      }
      else throw new Error('Unsupported UI input')
    }
  }
  for (const directory of ['src', 'public', 'e2e']) await visit(directory)
  for (const file of ['index.html', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'playwright.config.ts', 'scripts/release-lib.mjs', 'scripts/ux-policy.mjs', 'docs/UI_UX_STANDARDS.md']) hash.update(file + '\0').update((await readFile(join(root, file), 'utf8')).replace(/\r\n/g, '\n'))
  return hash.digest('hex')
}

export function validateReview(review, digest) {
  if (review.uiDigest !== digest) throw new Error('UI review is stale: review the current UI and regenerate the digest')
  if (!review.reviewer?.trim() || !review.summary?.trim() || !Array.isArray(review.criteria)) throw new Error('Review identity, summary and criteria are required')
  for (const id of requiredCriteria) {
    const matches = review.criteria.filter((criterion) => criterion.id === id)
    if (matches.length !== 1 || !['pass', 'not-applicable'].includes(matches[0].result) || matches[0].evidence?.trim().length < 20 || !matches[0].evidence) throw new Error(`Missing or incomplete UX evidence: ${id}`)
  }
  if (review.criteria.some((criterion) => !requiredCriteria.includes(criterion.id))) throw new Error('Unknown UX criterion')
  return true
}
