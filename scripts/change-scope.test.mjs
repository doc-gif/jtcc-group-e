import { expect, test } from 'vitest'
import { changedPaths, classify, isDocPath } from './change-scope.mjs'

test('文書だけ: docs/ 以下と、コードの場所の外にある .md', () => {
  expect(classify(['docs/STATUS.md', 'docs/ux-reviews/f15-multi-device.json', 'README.md', 'docs/design-reviews/a.png'])).toMatchObject({ docsOnly: true })
})

test('コードが混ざったら全部の検査', () => {
  expect(classify(['docs/STATUS.md', 'src/App.tsx'])).toMatchObject({ docsOnly: false })
  expect(classify(['README.md', 'package.json'])).toMatchObject({ docsOnly: false })
  expect(classify(['docs/STATUS.md', 'pnpm-lock.yaml'])).toMatchObject({ docsOnly: false })
})

test('規則の文書（AGENTS.md・CLAUDE.md）は .md でも全部の検査', () => {
  for (const path of ['AGENTS.md', 'CLAUDE.md', 'docs/AGENTS.md', 'Agents.md']) expect(classify([path]), path).toMatchObject({ docsOnly: false })
})

test('.github・スクリプト・DB・環境変数・部品・UI の digest に入る文書は全部の検査', () => {
  for (const path of ['.github/workflows/ci.yml', '.github/pull_request_template.md', '.github/copilot-instructions.md', 'scripts/change-scope.mjs', 'scripts/README.md',
    'supabase/migrations/20260926000000_x.sql', 'supabase/README.md', '.env.production', '.env', 'docs/.env.example', 'src/notes.md', 'e2e/README.md', 'public/a.md',
    'design-system/README.md', '.claude/settings.json', 'docs/UI_UX_STANDARDS.md', 'index.html', 'vite.config.ts']) {
    expect(isDocPath(path), path).toBe(false)
  }
})

test('判定できないものは全部の検査に倒す', () => {
  expect(classify([])).toMatchObject({ docsOnly: false })
  expect(classify(null)).toMatchObject({ docsOnly: false })
  expect(classify(['docs/a.md'], { limit: 1 })).toMatchObject({ docsOnly: false })
  for (const path of ['', '/docs/a.md', 'docs/../src/App.tsx', 'docs\\a.md', './docs/a.md', 'docs//a.md', undefined]) expect(isDocPath(path), String(path)).toBe(false)
})

test('git の差分を NUL 区切りで読む（同じコミット同士は空で、全部の検査）', () => {
  expect(changedPaths('HEAD', 'HEAD')).toEqual([])
  expect(classify(changedPaths('HEAD', 'HEAD'))).toMatchObject({ docsOnly: false })
})
