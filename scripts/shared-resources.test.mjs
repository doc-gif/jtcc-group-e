// 共有資源を同時に触って壊さないための検査（AGENTS.md「共有資源のロックと担当の宣言」）。
import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { migrationVersion } from './live-state.mjs'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const tryGit = (...args) => { try { return git(...args).trim() } catch { return null } }
const MIGRATIONS = 'supabase/migrations/'
const list = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean)

/**
 * 比べる相手（main 側）。PR の CI はマージ用のコミットで動くので HEAD^1 が main の先頭。
 * ローカルでは origin/main との分岐点。main 自体（push の CI）や origin がない環境では null（順番は比べない）。
 */
function baseCommit() {
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    const base = tryGit('rev-parse', '--verify', '--quiet', 'HEAD^1')
    // 取れないのは checkout の fetch-depth が足りないとき。黙って飛ばさず失敗にする。
    if (!base) throw new Error('PR の CI で HEAD^1 が読めない（actions/checkout の fetch-depth: 2 が必要）')
    return { base, top: base }
  }
  const main = tryGit('rev-parse', '--verify', '--quiet', 'origin/main')
  const head = tryGit('rev-parse', 'HEAD')
  if (!main || !head || main === head) return null
  const base = tryGit('merge-base', 'HEAD', 'origin/main')
  return base ? { base, top: main } : null
}

// 順番の例外（ロックを守らずに適用してしまい、DB 側の順番がすでに決まっているもの）。担当者の確認の上で、理由とともに足す。
const ACCEPTED_OUT_OF_ORDER = []

/** 追加した migration が、main にある最新の migration より後か。遅いものを返す。 */
export function olderThanMain(added, onMain, accepted = []) {
  const latest = onMain.map(migrationVersion).filter(Boolean).sort().at(-1) ?? ''
  return added.filter((file) => {
    const version = migrationVersion(file)
    return version && version <= latest && !accepted.includes(file.split('/').pop())
  })
}

describe('Supabase の migration（lock:supabase）', () => {
  test('ファイル名は <14桁の version>_<英小文字・数字・_>.sql で、version が重ならない', async () => {
    const files = (await readdir(MIGRATIONS)).filter((name) => name !== '.gitkeep')
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) expect(migrationVersion(name), `${MIGRATIONS}${name} の名前`).not.toBeNull()
    const versions = files.map(migrationVersion)
    expect(versions.filter((version, i) => versions.indexOf(version) !== i), 'version の重複').toEqual([])
  })

  test('main にある migration を書き換え・消し・名前を変えず、新しい migration は main の最新より後にする', () => {
    const range = baseCommit()
    if (!range) return
    const changed = list(git('diff', '--name-only', '--no-renames', '--diff-filter=MD', range.base, 'HEAD', '--', MIGRATIONS))
    expect(changed, '適用済みの migration は変えない。直すときは新しい migration を足す').toEqual([])
    const added = list(git('diff', '--name-only', '--no-renames', '--diff-filter=A', range.base, 'HEAD', '--', MIGRATIONS))
    // -r で中のファイルを列挙する（一覧が空だと「最新」が空になり、順番の検査が効かなくなる。main には migration があるはず）
    const onMain = list(git('ls-tree', '-r', '--name-only', range.top, '--', MIGRATIONS))
    expect(onMain.filter((file) => migrationVersion(file)), `main 側（${range.top.slice(0, 7)}）の migration の一覧が空。ls-tree の呼び方か checkout の深さを確かめる`).not.toEqual([])
    expect(olderThanMain(added, onMain, ACCEPTED_OUT_OF_ORDER), 'main の最新より前の version。lock:supabase を持たずに別の作業と同時に適用した可能性がある（AGENTS.md）').toEqual([])
  })

  test('順番の判定: main の最新以前は遅い、後なら良い、例外に書いたものは通す', () => {
    const main = ['supabase/migrations/20260926033821_lp_min_guests.sql', 'supabase/migrations/20260926023427_lp_host_key_names.sql']
    expect(olderThanMain(['supabase/migrations/20260926052120_new.sql'], main)).toEqual([])
    expect(olderThanMain(['supabase/migrations/20260926033821_same.sql', 'supabase/migrations/20260926030000_old.sql'], main)).toHaveLength(2)
    expect(olderThanMain(['supabase/migrations/20260926030000_old.sql'], main, ['20260926030000_old.sql'])).toEqual([])
    expect(olderThanMain(['supabase/migrations/20260926030000_old.sql'], [])).toEqual([])
  })
})

describe('進捗の記録は 1 タスク 1 ファイル（docs/status/）', () => {
  const REQUIRED = ['## 成果', '## 検証と証拠', '## 残課題', '## ブランチ・記録']

  test('docs/status/<ID>.md は ID の見出しと4つの節を持つ', async () => {
    const files = (await readdir('docs/status')).filter((name) => name.endsWith('.md') && name !== 'README.md')
    for (const name of files) {
      expect(name, 'ファイル名は ID（英大文字で始まり、英数字と -）').toMatch(/^[A-Z][A-Za-z0-9]*(-[A-Za-z0-9]+)*\.md$/)
      const text = (await readFile(`docs/status/${name}`, 'utf8')).replace(/\r\n/g, '\n')
      expect(text.split('\n')[0], `${name} の1行目`).toMatch(new RegExp(`^# ${name.slice(0, -3)}(\\s|$)`))
      for (const heading of REQUIRED) expect(text, `${name} に「${heading}」`).toContain(`\n${heading}\n`)
    }
  })

  test('STATUS.md・AGENTS.md が新しい記録の置き場所を案内する', async () => {
    expect(await readFile('docs/STATUS.md', 'utf8')).toContain('docs/status/')
    const agents = await readFile('AGENTS.md', 'utf8')
    expect(agents).toContain('## 共有資源のロックと担当の宣言')
    for (const word of ['lock:supabase', 'lock:figma-master', 'in-progress', 'docs/status/', 'node scripts/live-state.mjs']) expect(agents).toContain(word)
  })
})
