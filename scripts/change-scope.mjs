// 文書だけの PR を判定する。迷ったら「全部の検査」に倒す（品質の門を弱めない）。
// CI は main 側のこのファイルで判定し、マージの Bot（main のコード）も同じ関数で確かめ直す。
import { execFileSync } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// 動き・規則・ビルド・DB に関わる場所。ここに触れたら .md でも全部の検査。
const codePrefixes = ['.github/', '.claude/', '.vscode/', 'src/', 'public/', 'e2e/', 'scripts/', 'supabase/', 'design-system/']
// 規則の文書と、UI の digest（scripts/ux-policy.mjs）に入る文書。
const ruleFiles = ['agents.md', 'claude.md']
const digestFiles = ['docs/UI_UX_STANDARDS.md']

export function isDocPath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.startsWith('/') || path.split('/').some((part) => part === '..' || part === '.' || part === '')) return false
  const name = path.split('/').pop().toLowerCase()
  if (ruleFiles.includes(name) || digestFiles.includes(path) || codePrefixes.some((prefix) => path.startsWith(prefix)) || name.startsWith('.env')) return false
  return path.startsWith('docs/') || name.endsWith('.md')
}

// 変更の一覧が空・取得失敗（null）・上限（GitHub の一覧は 3000 件まで）のときも全部の検査。
export function classify(paths, { limit = 3000 } = {}) {
  if (!Array.isArray(paths) || paths.length === 0) return { docsOnly: false, reason: 'no changed files' }
  if (paths.length >= limit) return { docsOnly: false, reason: 'too many changed files' }
  const code = paths.filter((path) => !isDocPath(path))
  return code.length ? { docsOnly: false, reason: `code or rules changed: ${code.slice(0, 5).join(', ')}` } : { docsOnly: true, reason: `${paths.length} document file(s)` }
}

// PR の CI はマージ用のコミット（main の先頭と PR の先頭の合成）で動く。HEAD^1..HEAD が main に対する PR の差分。
export function changedPaths(base = 'HEAD^1', head = 'HEAD') {
  const out = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base, head], { encoding: 'utf8' })
  return out.split('\0').filter(Boolean)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [base, head] = process.argv.slice(2)
  let result
  try { result = classify(changedPaths(base, head)) } catch (error) { result = { docsOnly: false, reason: `diff failed: ${error.message}` } }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `docs_only=${result.docsOnly}\n`)
  console.log(`${result.docsOnly ? 'Docs only' : 'Full checks'}: ${result.reason}`)
}
