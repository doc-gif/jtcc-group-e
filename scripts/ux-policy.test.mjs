import { expect, test } from 'vitest'
import { requiredCriteria, validateReview, uiDigest } from './ux-policy.mjs'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const complete = () => ({ uiDigest: 'current', reviewer: 'agent', summary: 'Reviewed', criteria: requiredCriteria.map((id) => ({ id, result: 'pass', evidence: 'Confirmed visible behavior on mobile and inspected the actual source.' })) })
test('accepts documented review of the current UI only', () => {
  expect(validateReview(complete(), 'current')).toBe(true)
  expect(() => validateReview(complete(), 'new UI')).toThrow('stale')
})
test.each(['fail', 'pending', ''])('unresolved result %s blocks the gate', (result) => {
  const review = complete()
  review.criteria[0].result = result
  expect(() => validateReview(review, 'current')).toThrow('HIG-01')
})
test('missing, duplicate and unexplained criteria fail', () => {
  const review = complete()
  review.criteria.pop()
  expect(() => validateReview(review, 'current')).toThrow('GAME-05')
  const duplicate = complete()
  duplicate.criteria.push(duplicate.criteria[0])
  expect(() => validateReview(duplicate, 'current')).toThrow('HIG-01')
  const blank = complete()
  blank.criteria[0] = { id: 'HIG-01', result: 'not-applicable', evidence: '' }
  expect(() => validateReview(blank, 'current')).toThrow('HIG-01')
})
test('reviewer identity and unknown criteria are rejected', () => {
  expect(() => validateReview({ ...complete(), reviewer: '' }, 'current')).toThrow('identity')
  const review = complete()
  review.criteria.push({ id: 'UNKNOWN', result: 'pass', evidence: 'irrelevant' })
  expect(() => validateReview(review, 'current')).toThrow('Unknown')
})
test('digest is stable across CRLF and changes for actual UI or binary asset edits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jtcc-ux-test-'))
  try {
    for (const directory of ['src/nested', 'public', 'e2e', 'scripts', 'docs']) await mkdir(join(root, directory), { recursive: true })
    for (const file of ['index.html', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'playwright.config.ts', 'scripts/release-lib.mjs', 'scripts/preview-site.mjs', 'scripts/qr.mjs', 'scripts/ux-policy.mjs', 'docs/UI_UX_STANDARDS.md']) await writeFile(join(root, file), 'content\n')
    await writeFile(join(root, 'src/nested/App.tsx'), 'Hello\r\n')
    await writeFile(join(root, 'public/asset.png'), Buffer.from([0, 128, 255]))
    const original = await uiDigest(root)
    await writeFile(join(root, 'src/nested/App.tsx'), 'Hello\n')
    expect(await uiDigest(root)).toBe(original)
    await writeFile(join(root, 'public/asset.png'), Buffer.from([0, 129, 255]))
    expect(await uiDigest(root)).not.toBe(original)
  } finally { await rm(root, { recursive: true, force: true }) }
})
