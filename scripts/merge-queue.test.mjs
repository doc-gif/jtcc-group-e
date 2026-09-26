import { beforeEach, describe, expect, test, vi } from 'vitest'
import { advanceQueue, autoMerge } from './auto-merge.mjs'

const REPO = 'doc-gif/jtcc-group-e'
const MAIN = 'm'.repeat(40)
const PUSHED = 'n'.repeat(40)
const BOT = 'github-actions[bot]'
const pull = (number, over = {}) => ({ number, draft: false, base: { ref: 'main' }, head: { ref: `claude/pr-${number}`, sha: `${number}`.repeat(40).slice(0, 40), repo: { full_name: REPO } }, user: { login: 'doc-gif' }, mergeable: true, changed_files: 1, ...over })
const ok = (id, pr, over = {}) => ({ id, event: 'pull_request', actor: { login: 'doc-gif' }, head_sha: pr.head.sha, head_branch: pr.head.ref, status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml', head_repository: { full_name: REPO }, html_url: `https://github.com/${REPO}/actions/runs/${id}`, ...over })
// A pull_request run of the bot's push, held by GitHub for approval (#147).
const held = (id, pr, sha = pr.head.sha, over = {}) => ({ ...ok(id, pr), head_sha: sha, actor: { login: BOT }, conclusion: 'action_required', ...over })
const gates = ['Quality gate', 'UI/UX gate', 'Build and unit tests', 'Complete browser reports'].map((name) => ({ name, conclusion: 'success' }))

let prs, runsBySha, waiting, behind, comments, github
beforeEach(() => {
  prs = []
  runsBySha = {}
  waiting = []
  behind = {}
  comments = []
  github = {
    rest: {
      actions: {
        listWorkflowRuns: vi.fn(async ({ head_sha }) => ({ data: { workflow_runs: runsBySha[head_sha] ?? [] } })),
        listWorkflowRunsForRepo: vi.fn(async ({ head_sha, status, event }) => ({ data: { workflow_runs: waiting.filter((run) => run.head_sha === head_sha && run.conclusion === status && run.event === event) } })),
        approveWorkflowRun: vi.fn(async ({ run_id }) => { waiting = waiting.filter((run) => run.id !== run_id); return {} }),
        getWorkflowRun: vi.fn(async ({ run_id }) => ({ data: Object.values(runsBySha).flat().find((run) => run.id === run_id) })),
        listJobsForWorkflowRun: vi.fn(async () => gates),
        createWorkflowDispatch: vi.fn(async () => ({})),
      },
      repos: {
        getBranch: vi.fn(async () => ({ data: { protected: true, commit: { sha: MAIN } } })),
        compareCommits: vi.fn(async ({ head }) => ({ data: { behind_by: behind[head] ?? 0 } })),
        merge: vi.fn(async () => ({ data: { sha: PUSHED } })),
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
        createComment: vi.fn(async ({ body }) => { comments.push({ user: { login: BOT }, body }); return {} }),
      },
    },
    paginate: (fn, args) => fn(args).then((result) => result.data ?? result),
  }
})
const wait = vi.fn(async () => {})
const queue = () => advanceQueue({ github, owner: 'doc-gif', repo: 'jtcc-group-e', wait })
const approvedIds = () => github.rest.actions.approveWorkflowRun.mock.calls.map(([args]) => args.run_id)

describe('マージのキュー: 1本ずつ・古い順に、Bot が main を取り込み、その push の承認待ちの CI を承認する', () => {
  test('main より遅れた緑の PR のうち番号の小さい方だけ main を取り込み、その SHA の承認待ちの run を承認する（workflow_dispatch はしない）', async () => {
    const a = pull(12), b = pull(15)
    prs = [b, a]
    runsBySha = { [a.head.sha]: [ok(1, a)], [b.head.sha]: [ok(2, b)] }
    behind = { [a.head.sha]: 2, [b.head.sha]: 1 }
    // GitHub creates the push's runs a little later: none on the first look, then CI・Preview build・PR links an Issue.
    wait.mockImplementationOnce(async () => {}).mockImplementationOnce(async () => {
      const pushed = { ...a, head: { ...a.head, sha: PUSHED } }
      waiting = [held(31, pushed), held(32, pushed, PUSHED, { path: '.github/workflows/preview-build.yml' }), held(33, pushed, PUSHED, { path: '.github/workflows/pr-issue-link.yml' })]
    })
    expect(await queue()).toBe(`queue: merged main into PR #12 (${PUSHED}) and approved its CI`)
    expect(github.rest.repos.merge).toHaveBeenCalledTimes(1)
    expect(github.rest.repos.merge).toHaveBeenCalledWith(expect.objectContaining({ base: 'claude/pr-12', head: MAIN }))
    expect(approvedIds()).toEqual([31, 32, 33])
    expect(github.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
  })

  test('push の run がその回に現れなければ、次の見回りで承認する', async () => {
    const a = pull(12)
    prs = [a]
    runsBySha = { [a.head.sha]: [ok(1, a)] }
    behind = { [a.head.sha]: 1 }
    expect(await queue()).toContain('approved on the next pass')
    expect(approvedIds()).toEqual([])
    // The next pass sees the pushed head, whose runs now wait for approval.
    const pushed = { ...a, head: { ...a.head, sha: PUSHED } }
    prs = [pushed]
    waiting = [held(41, pushed)]
    expect(await queue()).toBe('queue: approved 1 waiting run(s) of PR #12')
    expect(approvedIds()).toEqual([41])
    expect(github.rest.repos.merge).toHaveBeenCalledTimes(1)
  })

  test('同じリポジトリの Ready の PR の、今の head への Bot の push の run 以外は承認しない', async () => {
    const draft = pull(1, { draft: true })
    const fork = pull(2, { head: { ref: 'x', sha: '2'.repeat(40), repo: { full_name: 'other/fork' } } })
    const human = pull(3), stale = pull(4), otherBranch = pull(5), forkRun = pull(6), pushEvent = pull(7)
    prs = [draft, fork, human, stale, otherBranch, forkRun, pushEvent]
    waiting = [
      held(1, draft), held(2, fork),
      held(3, human, human.head.sha, { actor: { login: 'first-timer' } }),
      held(4, stale, 'f'.repeat(40)),
      held(5, otherBranch, otherBranch.head.sha, { head_branch: 'claude/other' }),
      held(6, forkRun, forkRun.head.sha, { head_repository: { full_name: 'other/fork' } }),
      held(7, pushEvent, pushEvent.head.sha, { event: 'push' }),
    ]
    github.rest.actions.listWorkflowRunsForRepo.mockImplementation(async ({ head_sha }) => ({ data: { workflow_runs: waiting.filter((run) => run.head_sha === head_sha) } }))
    expect(await queue()).toBe('queue: nothing ready')
    expect(github.rest.actions.approveWorkflowRun).not.toHaveBeenCalled()
  })

  test('承認できない（権限など）ときは PR に1回だけ手での承認のしかたを知らせ、ほかの PR は進める', async () => {
    const a = pull(12), b = pull(15)
    prs = [a, b]
    runsBySha = { [a.head.sha]: [held(50, a)], [b.head.sha]: [ok(2, b)] }
    behind = { [b.head.sha]: 0 }
    waiting = [held(50, a)]
    github.rest.actions.approveWorkflowRun.mockRejectedValue(Object.assign(new Error('Resource not accessible by integration'), { status: 403 }))
    expect(await queue()).toBe('queue: merged PR #15: merged')
    await queue()
    const notes = github.rest.issues.createComment.mock.calls.map(([args]) => args)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ issue_number: 12 })
    expect(notes[0].body).toContain('403 Resource not accessible')
    expect(notes[0].body).toContain('gh api -X POST repos/doc-gif/jtcc-group-e/actions/runs/<run_id>/approve')
  })

  test('キューの CI（Bot の push の run）が動いている間は、次の PR に手を付けない', async () => {
    const a = pull(12), b = pull(15)
    prs = [a, b]
    runsBySha = { [a.head.sha]: [ok(9, a, { actor: { login: BOT }, status: 'in_progress', conclusion: null })], [b.head.sha]: [ok(2, b)] }
    behind = { [b.head.sha]: 1 }
    expect(await queue()).toBe('queue: waiting for CI of PR #12 (run 9)')
    expect(github.rest.repos.merge).not.toHaveBeenCalled()
    // An author's own push running CI does not hold the queue.
    runsBySha[a.head.sha] = [ok(9, a, { status: 'in_progress', conclusion: null })]
    expect(await queue()).toContain('merged main into PR #15')
  })

  test('Draft・フォーク・Bot の PR・CI が緑でない PR は並べない。空なら何もしない', async () => {
    const draft = pull(1, { draft: true }), fork = pull(2, { head: { ref: 'x', sha: '2'.repeat(40), repo: { full_name: 'other/fork' } } })
    const botPr = pull(3, { user: { login: BOT } }), red = pull(4), pending = pull(5)
    prs = [draft, fork, botPr, red, pending]
    runsBySha = { [red.head.sha]: [ok(1, red, { conclusion: 'failure' })], [pending.head.sha]: [ok(2, pending, { status: 'in_progress', conclusion: null })] }
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
    expect(github.rest.pulls.merge).toHaveBeenCalledTimes(1)
  })

  test('取り込めない（競合・workflow の変更）PR には1回だけ知らせ、次の PR へ進む', async () => {
    const a = pull(12), b = pull(15)
    prs = [a, b]
    runsBySha = { [a.head.sha]: [ok(1, a)], [b.head.sha]: [ok(2, b)] }
    behind = { [a.head.sha]: 1, [b.head.sha]: 1 }
    github.rest.repos.merge.mockImplementation(async ({ base }) => { if (base === 'claude/pr-12') throw Object.assign(new Error('Merge conflict'), { status: 409 }); return { data: { sha: PUSHED } } })
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
  test('Bot の push の pull_request の CI が成功した、同じブランチの SHA はマージする', async () => {
    const a = pull(12)
    prs = [a]
    runsBySha = { [a.head.sha]: [ok(7, a, { actor: { login: BOT } })] }
    expect(await autoMerge({ github, owner: 'doc-gif', repo: 'jtcc-group-e', runId: 7 })).toContain('merged PR #12')
  })

  test('workflow_dispatch の CI の成功ではマージしない（保護ルールは pull_request の suite を見る）', async () => {
    const a = pull(12)
    prs = [a]
    runsBySha = { [a.head.sha]: [ok(7, a, { event: 'workflow_dispatch', actor: { login: BOT } })] }
    expect(await autoMerge({ github, owner: 'doc-gif', repo: 'jtcc-group-e', runId: 7 })).toContain('skip:')
    expect(github.rest.pulls.merge).not.toHaveBeenCalled()
  })

  test('別のブランチの CI の成功は、同じ SHA でも使わない', async () => {
    const a = pull(12)
    prs = [a]
    runsBySha = { [a.head.sha]: [ok(7, a, { head_branch: 'claude/other' })] }
    expect(await autoMerge({ github, owner: 'doc-gif', repo: 'jtcc-group-e', runId: 7 })).toContain('another branch')
    expect(github.rest.pulls.merge).not.toHaveBeenCalled()
  })

  test('キューの CI の失敗は、PR に1回だけ理由の探し方（UI の digest の作り直し）を知らせる。作業者の push の失敗は知らせない', async () => {
    const a = pull(12)
    prs = [a]
    runsBySha = { [a.head.sha]: [ok(7, a, { actor: { login: BOT }, conclusion: 'failure' })] }
    for (let i = 0; i < 2; i++) expect(await autoMerge({ github, owner: 'doc-gif', repo: 'jtcc-group-e', runId: 7 })).toContain('skip:')
    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(1)
    expect(github.rest.issues.createComment.mock.calls[0][0].body).toContain('pnpm ux:digest')
    runsBySha = { [a.head.sha]: [ok(8, a, { conclusion: 'failure' })] }
    await autoMerge({ github, owner: 'doc-gif', repo: 'jtcc-group-e', runId: 8 })
    expect(github.rest.issues.createComment).toHaveBeenCalledTimes(1)
  })
})
