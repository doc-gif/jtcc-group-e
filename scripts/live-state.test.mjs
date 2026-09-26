import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { activeRuns, formatReport, migrationsOutsideMain, migrationVersion, parseRefs, recentBranchesWithoutPr } from './live-state.mjs'

const NOW = new Date('2026-09-26T06:30:00Z')
const hoursAgo = (hours) => new Date(NOW - hours * 3600_000)

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

  test('報告: 確認した時刻を先頭に出し、実行中の公開・main にない migration・本番との差を知らせる', () => {
    const report = formatReport({
      checkedAt: NOW,
      main: { sha: 'bb688bb0000', date: hoursAgo(0.1), subject: 'feat: analytics' },
      production: { deployment: { version: 'v0.3.1', sha: 'f5ba9b50000', createdAt: '2026-09-26T05:51:56Z' }, latestRelease: 'v0.3.1' },
      releaseRuns: [{ id: 36223645689, status: 'queued', head_sha: 'bb688bb0000', created_at: '2026-09-26T06:24:00Z' }],
      pulls: [{ number: 48, draft: false, head: { ref: 'claude/handoff', sha: 'c67d7200' }, title: 'docs: handoff', updated_at: '2026-09-26T06:20:00Z' }],
      orphanBranches: [{ branch: 'claude/f15-pitch-photos', sha: '636add70', subject: 'wip', date: hoursAgo(1) }],
      strayMigrations: [{ branch: 'claude/f15-pitch-photos', file: 'supabase/migrations/20260926052120_x.sql', version: '20260926052120' }],
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
      releaseRuns: [], pulls: [], orphanBranches: [], strayMigrations: [],
      mainMigrations: new Error('git ls-tree failed'),
    })
    expect(report).toContain('- main と本番は同じ SHA')
    expect(report).toContain('公開中の版と最新の Release が違う')
    expect(report.match(/- なし/g)).toHaveLength(4)
    expect(report).not.toContain('main の最新の migration')
    const failed = formatReport({
      checkedAt: NOW, main: new Error('offline'), production: new Error('404 deployment.json'), releaseRuns: new Error('403 rate limit'),
      pulls: [], orphanBranches: [], strayMigrations: [], mainMigrations: [],
    })
    expect(failed).toContain('## main\n- 未確認: offline')
    expect(failed).toContain('## 本番\n- 未確認: 404 deployment.json')
    expect(failed).toContain('- 未確認: 403 rate limit')
    expect(failed).toContain('main の最新の migration: なし')
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

  test.each(DOCS)('%s に、変わる事実（main の SHA・本番の版・今回のブランチ）を書き写していない', async (path) => {
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
