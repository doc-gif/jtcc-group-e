import { readdir, readFile } from 'node:fs/promises'
import { uiDigest, validateReview } from './ux-policy.mjs'

const digest = await uiDigest(process.cwd())
if (process.argv.includes('--digest')) {
  console.log(digest)
} else {
  const paths = (await readdir('docs/ux-reviews')).filter((name) => name.endsWith('.json'))
  let found = false
  for (const path of paths) {
    const review = JSON.parse(await readFile(`docs/ux-reviews/${path}`, 'utf8'))
    if (review.uiDigest === digest) { validateReview(review, digest); found = true; console.log(`Current UI/UX review: ${path}`) }
  }
  if (!found) throw new Error(`UI/UX review required for digest ${digest}. See docs/UI_UX_STANDARDS.md`)
}
