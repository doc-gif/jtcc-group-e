import { beforeEach, describe, expect, test, vi } from 'vitest'
import { advanceQueue, autoMerge } from './auto-merge.mjs'

const REPO = 'doc-gif/jtcc-group-e'
const MAIN = 'm'.repeat(40)
const pull = (number, over = {}) => ({ number, draft: false, base: { ref: 'main' }, head: { ref: `claude/pr-${number}`, sha: `${number}`.repeat(40).slice(0, 40), repo: { full_name: REPO } }, user: { login: 'doc-gif' }, mergeable: true, changed_files: 1, ...over })
const ok = (id, pr, event = 'pull_request') => ({ id, event, head_sha: pr.head.sha, head_branch: pr.head.ref, status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml', head_repository: { full_name: REPO }, html_url: `https://github.com/${REPO}/actions/runs/${id}` })
const gates = ['Quality gate', 'UI/UX gate', 'Build and unit tests', 'Complete browser reports'].map((name) => ({ name, conclusion: 'success' }))

let prs, runsBySha, dispatched, behind, comments, github
beforeEach(() => {
  prs = []
  runsBySha = {}
  dispatched = []
  behind = {}
  comments = []
  github = {
    rest: {
      actions: {
        listWorkflowRuns: vi.fn(async ({ head_sha, event }) => ({ data: { workflow_runs: event === 'workflow_dispatch' ? dispatched : runsBySha[head_sha] ?? [] } })),
        getWorkflowRun: vi.fn(async ({ run_id }) => ({ data: Object.values(runsBySha).flat().concat(dispatched).find((run) => run.id === run_id) })),
        listJobsForWorkflowRun: vi.fn(async () => gates),
        createWorkflowDispatch: vi.fn(async () => ({})),
      },
      repos: {
        getBranch: vi.fn(async () => ({ data: { protected: true, commit: { sha: MAIN } } })),
        compareCommits: vi.fn(async ({ head }) => ({ data: { behind_by: behind[head] ?? 0 } })),
        merge: vi.fn(async () => ({ data: { sha: 'n'.repeat(40) } })),
      },
      pulls: {
        list: vi.fn(async () => prs),
        get: vi.fn(async ({ pull_number }) => ({ data: prs.find((pr) => pr.number === pull_number) })),
        listReviews: vi.fn(async () => []),
        listFiles: vi.fn(async () => [{ filename: 'src/App.tsx' }]),
        createReview: vi.fn(async () => ({})),
        merge: vi.fn(async () => ({ data: { merged: true, sha: 'merged' } })),
      },
      issues: {
        listComments: vi.fn(async () => comments),
        createComment: vi.fn(async ({ body }) => { comments.push({ user: { login: 'github-actions[bot]' }, body }); return {} }),
      },
    },
    paginate: (fn, args) => fn(args).then((result) => result.data ?? result),
  }
})
const queue = () => advanceQueue({ github, owner: 'doc-gif', repo: 'jtcc-group-e' })

describe('マージのキュー: 1本ずつ・古い順に、Bot が main を取り込んで CI を回す', () => {
  test('main より遅れた緑の PR のうち番号の小さい方だけ、main を取り込み、その SHA の CI を起動する', async () => {
    const a = pull(12), b = pull(15)
    prs = [b, a]
    runsBySha = { [a.head.sha]: [ok(1, a)], [b.head.sha]: [ok(2, b)] }
    behind = { [a.head.sha]: 2, [b.head.sha]: 1 }
    expect(await queue()).toContain('PR #12')
    expect(github.rest.repos.merge).toHaveBeenCalledTimes(1)
    expect(github.rest.repos.merge).toHaveBeenCalledWith(expect.objectContaining({ base: 'claude/pr-12', head: MAIN }))
    expect(github.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith(expect.objectContaining({ workflow_id: 'ci.yml', ref: 'claude/pr-12', inputs: { queue_base: MAIN } }))
  })

  test('キューの CI が動いている間は、次の PR に手を付けない', async () => {
    const a = pull(12)
    prs = [a]
    runsBySha = { [a.head.sha]: [ok(1, a)] }
    behind = { [a.head.sha]: 1 }
    dispatched = [{ id: 9, event: 'workflow_dispatch', head_branch: 'claude/pr-12', status: 'in_progress' }]
    expect(await queue()).toContain('waiting for CI of claude/pr-12')
    dispatched = [{ id: 9, event: 'workflow_dispatch', head_branch: 'claude/closed', status: 'in_progress' }]
    expect(await queue()).toContain('merged main into PR #12')
  })

  test('Draft・フォーク・Bot の PR・CI が緑でない PR は並べない。空なら何もしない', async () => {
    const draft = pull(1, { draft: true }), fork = pull(2, { head: { ref: 'x', sha: '2'.repeat(40), repo: { full_name: 'other/fork' } } })
    const botPr = pull(3, { user: { login: 'github-actions[bot]' } }), red = pull(4), pending = pull(5)
    prs = [draft, fork, botPr, red, pending]
    runsBySha = { [red.head.sha]: [{ ...ok(1, red), conclusion: 'failure' }], [pending.head.sha]: [{ ...ok(2, pending), status: 'in_progress', conclusion: null }] }
    for (const pr of prs) behind[pr.head.sha] = 1
    expect(await queue()).toBe('queue: nothing ready')
    expect(github.rest.repos.merge).not.toHaveBeenCalled()
    prs = []
    expect(await queue()).toBe('queue: empty')
  })

  test('遅れていない緑の PR は、落ちたイベントの代わりにそのままマージする', async () => {
    const a = pull(12)
    prs = [a]
    runsBySha = { [a.head.sha]: [ok(1, a)] }
    expect(await queue()).toBe(`queue: merged PR #12: merged`)
    expect(github.rest.repos.merge).not.toHaveBeenCalled()
  })

  test('取り込めない（競合・workflow の変更）PR には1回だけ知らせ、次の PR へ進む', async () => {
    const a = pull(12), b = pull(15)
    prs = [a, b]
    runsBySha = { [a.head.sha]: [ok(1, a)], [b.head.sha]: [ok(2, b)] }
    behind = { [a.head.sha]: 1, [b.head.sha]: 1 }
    github.rest.repos.merge.mockImplementation(async ({ base }) => { if (base === 'claude/pr-12') throw Object.assign(new Error('Merge conflict'), { status: 409 }); return { data: { sha: 'n'.repeat(40) } } })
    expect(await queue()).toContain('PR #15')
    expect(await queue()).toContain('PR #15')
    const notes = github.rest.issues.createComment.mock.calls.map(([args]) => args)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ issue_number: 12 })
    expect(notes[0].body).toContain('409 Merge conflict')
    expect(notes[0].body).toContain('git merge origin/main')
  })
})

describe('キューの CI の結果', () => {
  test('キューが起動した CI（workflow_dispatch）で成功した、同じブランチの SHA はマージする', async () => {
    const a = pull(12)
    prs = [a]
    runsBySha = { [a.head.sha]: [ok(7, a, 'workflow_dispatch')] }
    expect(await autoMerge({ github, owner: 'doc-gif', repo: 'jtcc-group-e', runId: 7 })).toContain('merged PR #12')
  })

  test('別のブランチで起動した CI の成功は、同じ SHA でも使わない', async () => {
    const a = pull(12)
    prs = [a]
    runsBySha = { [a.head.sha]: [{ ...ok(7, a, 'workflow_dispatch'), head_branch: 'claude/other' }] }
    expect(await autoMerge({ github, owner: 'doc-gif', repo: 'jtcc-group-e', runId: 7 })).toContain('another branch')
    expect(github.rest.pulls.merge).not.toHaveBeenCalled()
  })

  test('キューの CI の失敗は、PR に1回だけ理由の探し方（UI の digest の作り直し）を知らせる', async () => {
    const a = pull(12)
    prs = [a]
    runsBySha = { [a.head.sha]: [{ ...ok(7, a, 'workflow_dispatch'), conclusion: 'failure' }] }
    for (let i = 0; i < 2; i++) expect(await autoMerge({ github, owner: 'doc-gif', repo: 'jtcc-group-e', runId: 7 })).toContain('skip:')
    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(1)
    expect(github.rest.issues.createComment.mock.calls[0][0].body).toContain('pnpm ux:digest')
    runsBySha = { [a.head.sha]: [{ ...ok(8, a), conclusion: 'failure' }] }
    await autoMerge({ github, owner: 'doc-gif', repo: 'jtcc-group-e', runId: 8 })
    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(1)
  })
})
