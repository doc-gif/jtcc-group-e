import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { activeRuns, collect, formatReport, hasUnchecked, heldLocks, migrationsOutsideMain, migrationVersion, parseRefs, recentBranchesWithoutPr } from './live-state.mjs'

const NOW = new Date('2026-09-26T06:30:00Z')
// 1タスク1ファイルの完了の記録（AGENTS.md「共有資源のロックと担当の宣言」）も書き写しの検査をする
const STATUS_RECORDS = (await readdir('docs/status')).filter((name) => name.endsWith('.md')).map((name) => `docs/status/${name}`)
const hoursAgo = (hours) => new Date(NOW - hours * 3600_000)
const EMPTY = { checkedAt: NOW, main: new Error('offline'), production: new Error('offline'), releaseRuns: [], pulls: [], orphanBranches: [], strayMigrations: { items: [], unchecked: [] }, mainMigrations: [] }

describe('live-state: 変わる事実をその場で調べる', () => {
  test('リモートのブランチを読み、main・pages-history・origin 自体は作業ブランチに数えない', () => {
    const refs = parseRefs([
      'origin\tabc\t2026-09-26T06:00:00Z\t',
      'origin/main\taaaaaaa\t2026-09-26T06:00:00Z\tfeat: x',
      'origin/pages-history\tbbbbbbb\t2026-09-26T06:00:00Z\trelease',
      'origin/claude/f15-pitch-photos\t636add7\t2026-09-26T05:26:07+00:00\twip: F15 photos\twith tab',
      '',
    ].join('\n'))
    expect(refs).toEqual([{ branch: 'claude/f15-pitch-photos', sha: '636add7', date: new Date('2026-09-26T05:26:07Z'), subject: 'wip: F15 photos\twith tab' }])
  })

  test('PR のない最近のブランチ: 開いている PR・マージ済みの PR と同じ SHA・古いブランチを除き、新しい順', () => {
    const refs = [
      { branch: 'open-pr', sha: '1', date: hoursAgo(1) },
      { branch: 'merged', sha: '2', date: hoursAgo(1) },
      { branch: 'pushed-after-merge', sha: '3b', date: hoursAgo(1) },
      { branch: 'wip-old', sha: '4', date: hoursAgo(49) },
      { branch: 'wip-older', sha: '5', date: hoursAgo(30) },
      { branch: 'wip-new', sha: '6', date: hoursAgo(2) },
    ]
    const open = [{ head: { ref: 'open-pr', sha: '1' } }]
    const closed = [{ head: { ref: 'merged', sha: '2' } }, { head: { ref: 'pushed-after-merge', sha: '3a' } }]
    expect(recentBranchesWithoutPr(refs, open, closed, NOW).map((ref) => ref.branch)).toEqual(['pushed-after-merge', 'wip-new', 'wip-older'])
    expect(recentBranchesWithoutPr(refs, open, closed, NOW, 72).map((ref) => ref.branch)).toContain('wip-old')
  })

  test('本番公開は、終わっていない実行だけを拾う', () => {
    const runs = ['queued', 'in_progress', 'waiting', 'requested', 'pending', 'completed'].map((status, id) => ({ id, status }))
    expect(activeRuns(runs).map((run) => run.status)).toEqual(['queued', 'in_progress', 'waiting', 'requested', 'pending'])
    expect(activeRuns([])).toEqual([])
  })

  test('migration の version を読み、main にない migration をブランチごとに出す', () => {
    expect(migrationVersion('supabase/migrations/20260926052120_lp_pitch_goods_photos.sql')).toBe('20260926052120')
    expect(migrationVersion('20260926033821_lp_min_guests.sql')).toBe('20260926033821')
    expect(migrationVersion('supabase/drafts/optional_broadcast.sql')).toBeNull()
    expect(migrationVersion('supabase/migrations/2026_bad.sql')).toBeNull()
    const main = ['20260926033821_lp_min_guests.sql']
    const branches = {
      'claude/f15-pitch-photos': ['supabase/migrations/20260926052120_lp_pitch_goods_photos.sql', 'supabase/migrations/README.md'],
      'claude/other': ['supabase/migrations/20260926033821_lp_min_guests.sql'],
      'claude/a': ['supabase/migrations/20260926052120_lp_pitch_goods_photos.sql'],
    }
    expect(migrationsOutsideMain(main, branches)).toEqual([
      { branch: 'claude/a', file: 'supabase/migrations/20260926052120_lp_pitch_goods_photos.sql', version: '20260926052120' },
      { branch: 'claude/f15-pitch-photos', file: 'supabase/migrations/20260926052120_lp_pitch_goods_photos.sql', version: '20260926052120' },
    ])
  })

  test('共有資源のロック: 開いている PR・Issue のラベルから持ち主を出し、重なったら番号の小さい方が持つ', () => {
    const items = [
      { number: 61, title: 'feat: B', labels: [{ name: 'lock:supabase' }], pull_request: {} },
      { number: 57, title: 'feat: A', labels: [{ name: 'lock:supabase' }, { name: 'lock:figma-master' }], pull_request: {} },
      { number: 3, title: 'Figma マスターの整理', labels: ['lock:figma-master'] },
      { number: 9, title: 'other', labels: [{ name: 'lock:unknown' }, { name: 'bug' }] },
      { number: 10, title: 'no labels' },
    ]
    const locks = heldLocks(items)
    expect(Object.keys(locks)).toEqual(['lock:supabase', 'lock:figma-master'])
    expect(locks['lock:supabase'].map((item) => item.number)).toEqual([57, 61])
    expect(locks['lock:figma-master'].map((item) => item.number)).toEqual([3, 57])
    const report = formatReport({ ...EMPTY, locks })
    expect(report).toContain('- `lock:supabase`: #57（PR） feat: A → 持ち主の完了（マージ・クローズ）まで触らない')
    expect(report).toContain('- 注意: `lock:supabase` が #61 にも付いている → 番号の小さい #57 が持つ。ほかはラベルを外して待つ')
    expect(report).toContain('- `lock:figma-master`: #3（Issue） Figma マスターの整理')
    expect(formatReport({ ...EMPTY, locks: heldLocks([]) })).toContain('- `lock:supabase`: 空き\n- `lock:figma-master`: 空き')
    expect(formatReport({ ...EMPTY, locks: new Error('403 rate limit') })).toContain('## 共有資源のロック（持ち主の PR・Issue）\n- 未確認: 403 rate limit')
    expect(hasUnchecked({ locks: new Error('403') })).toBe(true)
  })

  test('報告: 確認した時刻を先頭に出し、実行中の公開・main にない migration・本番との差を知らせる', () => {
    const report = formatReport({
      checkedAt: NOW,
      main: { sha: 'bb688bb0000', date: hoursAgo(0.1), subject: 'feat: analytics' },
      production: { deployment: { version: 'v0.3.1', sha: 'f5ba9b50000', createdAt: '2026-09-26T05:51:56Z' }, latestRelease: 'v0.3.1' },
      releaseRuns: [{ id: 36223645689, status: 'queued', head_sha: 'bb688bb0000', created_at: '2026-09-26T06:24:00Z' }],
      pulls: [{ number: 48, draft: false, head: { ref: 'claude/handoff', sha: 'c67d7200' }, title: 'docs: handoff', updated_at: '2026-09-26T06:20:00Z' }],
      orphanBranches: [{ branch: 'claude/f15-pitch-photos', sha: '636add70', subject: 'wip', date: hoursAgo(1) }],
      strayMigrations: { items: [{ branch: 'claude/f15-pitch-photos', file: 'supabase/migrations/20260926052120_x.sql', version: '20260926052120' }], unchecked: [] },
      mainMigrations: ['20260926033821_lp_min_guests.sql'],
    })
    expect(report.split('\n')[0]).toBe('# 今の状態（2026-09-26 06:30 UTC に確認）')
    expect(report).toContain('- `bb688bb` feat: analytics')
    expect(report).toContain('- 公開中: v0.3.1（`f5ba9b5`')
    expect(report).toContain('main には本番より新しいコミットがある')
    expect(report).toContain('run 36223645689（queued、`bb688bb`')
    expect(report).toContain('新しく依頼せず、この実行を追う')
    expect(report).toContain('- #48 `claude/handoff` `c67d720` docs: handoff')
    expect(report).toContain('`claude/f15-pitch-photos` `636add7` wip')
    expect(report).toContain('20260926052120: `supabase/migrations/20260926052120_x.sql`（ブランチ `claude/f15-pitch-photos` にだけある）')
    expect(report).toContain('main の最新の migration: 20260926033821_lp_min_guests.sql')
  })

  test('報告: 何もないときは「なし」、取れなかった項目は推測で埋めず「未確認」、公開の途中は注意を出す', () => {
    const report = formatReport({
      checkedAt: NOW,
      main: { sha: 'f5ba9b50000', date: hoursAgo(1), subject: 'feat: F15' },
      production: { deployment: { version: 'v0.3.1', sha: 'f5ba9b50000', createdAt: '2026-09-26T05:51:56Z' }, latestRelease: 'v0.3.2' },
      releaseRuns: [], pulls: [], orphanBranches: [], strayMigrations: { items: [], unchecked: [] },
      mainMigrations: new Error('git ls-tree failed'),
    })
    expect(report).toContain('- main と本番は同じ SHA')
    expect(report).toContain('公開中の版と最新の Release が違う')
    expect(report.match(/- なし/g)).toHaveLength(4)
    expect(report).not.toContain('main の最新の migration')
    const failed = formatReport({
      checkedAt: NOW, main: new Error('offline'), production: new Error('404 deployment.json'), releaseRuns: new Error('403 rate limit'),
      pulls: [], orphanBranches: [], strayMigrations: { items: [], unchecked: [{ branch: 'orphan', reason: 'no merge base' }] }, mainMigrations: [],
    })
    expect(failed).toContain('## main\n- 未確認: offline')
    expect(failed).toContain('## 本番\n- 未確認: 404 deployment.json')
    expect(failed).toContain('- 未確認: 403 rate limit')
    expect(failed).toContain('main の最新の migration: なし')
    expect(failed).toContain('## main にない migration\n- 未確認: ブランチ `orphan`（no merge base）\n')
    // main が取れないときは本番と比べない（PR #49 の Copilot の指摘: 未定義の SHA と比べて「新しいコミットがある」と誤報しない）
    const mainUnknown = formatReport({
      checkedAt: NOW, main: new Error('git log failed'),
      production: { deployment: { version: 'v0.3.1', sha: 'f5ba9b50000', createdAt: '2026-09-26T05:51:56Z' }, latestRelease: 'v0.3.1' },
      releaseRuns: [], pulls: [], orphanBranches: [], strayMigrations: { items: [], unchecked: [] }, mainMigrations: [],
    })
    expect(mainUnknown).toContain('- main が未確認のため、main と本番の差は未確認')
    expect(mainUnknown).not.toMatch(/main には本番より新しいコミットがある|main と本番は同じ SHA/)
  })

  const deployment = { version: 'v0.3.1', sha: 'f5ba9b5aaaa', createdAt: '2026-09-26T05:51:56Z' }
  const api = (overrides = {}) => async (url) => {
    for (const [part, value] of Object.entries(overrides)) {
      if (!url.includes(part)) continue
      if (value instanceof Error) throw value
      return value
    }
    if (url.endsWith('deployment.json')) return deployment
    if (url.includes('/releases/latest')) return { tag_name: 'v0.3.1' }
    if (url.includes('/actions/workflows/')) return { workflow_runs: [{ id: 1, status: 'completed' }, { id: 2, status: 'queued', head_sha: 'bb688bb', created_at: '2026-09-26T06:24:00Z' }] }
    if (url.includes('/issues?state=open')) return [{ number: 55, title: 'feat: F16 migration', labels: [{ name: 'lock:supabase' }], pull_request: {} }, { number: 12, title: 'bug', labels: [{ name: 'bug' }] }]
    if (url.includes('state=open')) return [{ number: 48, title: 'docs: handoff', head: { ref: 'claude/handoff', sha: 'c67d720' } }]
    if (url.includes('state=closed')) return [{ head: { ref: 'claude/done', sha: 'd0' } }]
    throw new Error(`unexpected ${url}`)
  }
  const REFS = [
    ['origin/main', 'bb688bbffff', '2026-09-26T06:23:00Z', 'feat: analytics'],
    ['origin/claude/handoff', 'c67d720', '2026-09-26T06:20:00Z', 'docs: handoff'],
    ['origin/claude/done', 'd0', '2026-09-26T05:00:00Z', 'feat: done'],
    ['origin/claude/f15-pitch-photos', '636add7', '2026-09-26T05:26:07Z', 'wip: photos'],
    ['origin/claude/orphan', '0rphan', '2026-09-26T04:00:00Z', 'no merge base'],
  ].map((fields) => fields.join('\t')).join('\n')
  const fakeGit = ({ fetchFails = false } = {}) => {
    const calls = []
    const git = async (args) => {
      calls.push(args.join(' '))
      if (args[0] === 'fetch') {
        if (fetchFails) throw new Error('Could not resolve host: github.com')
        return ''
      }
      if (args[0] === 'for-each-ref') return REFS
      if (args[0] === 'log') return ['bb688bbffff', '2026-09-26T06:23:00Z', 'feat: analytics'].join('\t') + '\n'
      if (args[0] === 'ls-tree') return 'supabase/migrations/20260926033821_lp_min_guests.sql\n'
      if (args[0] === 'diff') {
        if (args.includes('origin/main...origin/claude/orphan')) throw new Error('fatal: no merge base\nmore detail')
        return args.includes('origin/main...origin/claude/f15-pitch-photos') ? 'supabase/migrations/20260926052120_lp_pitch_goods_photos.sql\n' : ''
      }
      throw new Error(`unexpected git ${args.join(' ')}`)
    }
    return { git, calls }
  }

  test('collect: 実態を集め、ブランチ1本の差分が取れなくてもほかは調べて、そのブランチだけ未確認にする', async () => {
    const { git } = fakeGit()
    const state = await collect({ git, fetchJson: api(), now: NOW })
    expect(state.main).toEqual({ sha: 'bb688bbffff', date: new Date('2026-09-26T06:23:00Z'), subject: 'feat: analytics' })
    expect(state.production).toEqual({ deployment, latestRelease: 'v0.3.1' })
    expect(state.releaseRuns.map((run) => run.id)).toEqual([2])
    expect(state.orphanBranches.map((ref) => ref.branch)).toEqual(['claude/f15-pitch-photos', 'claude/orphan'])
    expect(state.locks['lock:supabase'].map((item) => item.number)).toEqual([55])
    expect(state.locks['lock:figma-master']).toEqual([])
    expect(state.strayMigrations).toEqual({
      items: [{ branch: 'claude/f15-pitch-photos', file: 'supabase/migrations/20260926052120_lp_pitch_goods_photos.sql', version: '20260926052120' }],
      unchecked: [{ branch: 'claude/orphan', reason: 'fatal: no merge base' }],
    })
    expect(hasUnchecked(state)).toBe(true)
    const report = formatReport(state)
    expect(report).toContain('- main には本番より新しいコミットがある')
    // API の項目が欠けても（ここでは PR の updated_at）報告全体を落とさない
    expect(report).toContain('- #48 `claude/handoff` `c67d720` docs: handoff（更新 時刻不明）')
  })

  test('collect: git fetch に失敗したら、手元の古い記録を出さず git から読む項目をすべて未確認にする（PR #49 の Copilot の指摘）', async () => {
    const { git, calls } = fakeGit({ fetchFails: true })
    const state = await collect({ git, fetchJson: api(), now: NOW })
    expect(calls).toEqual(['fetch --quiet --prune origin'])
    for (const key of ['main', 'orphanBranches', 'strayMigrations', 'mainMigrations']) {
      expect(state[key], key).toBeInstanceOf(Error)
      expect(state[key].message, key).toContain('git fetch に失敗')
    }
    expect(state.production).toEqual({ deployment, latestRelease: 'v0.3.1' })
    expect(hasUnchecked(state)).toBe(true)
    const report = formatReport(state)
    expect(report).toContain('## main\n- 未確認: git fetch に失敗')
    expect(report).toContain('- main が未確認のため、main と本番の差は未確認')
  })

  test('collect: GitHub の API が失敗・想定外の形でも落ちず、その項目だけ未確認', async () => {
    const { git } = fakeGit()
    const state = await collect({ git, fetchJson: api({ '/actions/workflows/': {}, 'state=closed': new Error('403 rate limit') }), now: NOW })
    expect(state.releaseRuns).toBeInstanceOf(Error)
    expect(state.orphanBranches).toEqual(new Error('403 rate limit'))
    expect(state.main.sha).toBe('bb688bbffff')
    expect(hasUnchecked({ main: state.main, strayMigrations: { items: [], unchecked: [] } })).toBe(false)
  })
})

describe('情報の鮮度: 変わる事実を文書に書き写さない（AGENTS.md）', () => {
  // 書き写すとすぐ古くなる事実。文書には確認方法（node scripts/live-state.mjs）を書く。
  const LIVE_FACTS = [
    { pattern: /現在の\s*`?main`?/, what: '「現在の main」' },
    { pattern: /^\s*[-*]\s*`?main`?\s*[:：]\s*`?[0-9a-f]{7,40}/m, what: 'main の SHA の書き写し' },
    { pattern: /基点の\s*`?main`?\s*は/, what: '基点の main の SHA' },
    { pattern: /今回の進捗ブランチ/, what: '今回の進捗ブランチ' },
    { pattern: /^\s*[-*]?\s*(?:\*\*)?本番(?:\*\*)?\s*[:：]\s*(?:\*\*)?v\d+\.\d+\.\d+/m, what: '本番の版の書き写し' },
  ]
  const DOCS = ['docs/HANDOFF.md', 'docs/STATUS.md']

  test.each([...DOCS, ...STATUS_RECORDS])('%s に、変わる事実（main の SHA・本番の版・今回のブランチ）を書き写していない', async (path) => {
    const text = await readFile(path, 'utf8')
    for (const { pattern, what } of LIVE_FACTS) expect(pattern.test(text), `${path} に${what}がある。node scripts/live-state.mjs で確かめる形にする`).toBe(false)
  })

  test('検査のパターンが、古くなった実例を見つけられる（検査が空振りしない）', () => {
    const stale = [
      '## 現在の main と本番',
      '- main: `f71d9ae`（#39 まで）',
      '- 本番: **v0.3.0**（commit `09237ac`）',
      '最終更新: 2026-09-26 JST。今回の進捗ブランチは `x`、基点の `main` は [`fb93ffa`](…) です。',
    ].join('\n')
    for (const { pattern, what } of LIVE_FACTS) expect(pattern.test(stale), what).toBe(true)
    const fine = ['本番の版は `node scripts/live-state.mjs` で確かめる。', '- F15 は #41 でマージ（2026-09-26 05:39 UTC）。', '担当者のキー（id `0e61b081-…`）は触らない。'].join('\n')
    for (const { pattern, what } of LIVE_FACTS) expect(pattern.test(fine), what).toBe(false)
  })

  test('AGENTS.md に鮮度の規則と確認コマンドがあり、STATUS.md・HANDOFF.md から確認コマンドを案内する', async () => {
    const agents = await readFile('AGENTS.md', 'utf8')
    expect(agents).toContain('## 情報の鮮度')
    expect(agents).toContain('node scripts/live-state.mjs')
    for (const path of DOCS) expect(await readFile(path, 'utf8'), path).toContain('node scripts/live-state.mjs')
  })
})
