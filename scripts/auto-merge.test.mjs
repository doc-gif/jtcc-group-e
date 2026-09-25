import { beforeEach, expect, test, vi } from 'vitest'
import { autoMerge } from './auto-merge.mjs'

let github, run, pr, jobs, base, comparison, reviews
beforeEach(() => {
  run = { path: '.github/workflows/ci.yml', event: 'pull_request', conclusion: 'success', head_repository: { full_name: 'doc-gif/jtcc-group-e' }, head_sha: 'head', html_url: 'https://github.com/doc-gif/jtcc-group-e/actions/runs/1' }
  pr = { number: 1, draft: false, head: { sha: 'head', repo: { full_name: 'doc-gif/jtcc-group-e' } }, base: { ref: 'main' }, user: { login: 'developer' }, mergeable: true }
  jobs = [{ name: 'Quality gate', conclusion: 'success' }, { name: 'UI/UX gate', conclusion: 'success' }]
  base = { protected: true, commit: { sha: 'main' } }
  comparison = { behind_by: 0 }
  reviews = []
  github = {
    rest: {
      actions: { getWorkflowRun: vi.fn(async () => ({ data: run })), listJobsForWorkflowRun: vi.fn(async () => jobs) },
      repos: { getBranch: vi.fn(async () => ({ data: base })), compareCommits: vi.fn(async () => ({ data: comparison })) },
      pulls: {
        list: vi.fn(async () => [pr]), get: vi.fn(async () => ({ data: pr })), listReviews: vi.fn(async () => reviews),
        createReview: vi.fn(async () => ({})), merge: vi.fn(async () => ({ data: { merged: true, sha: 'merged' } })),
      },
    },
    paginate: (fn, args) => fn(args),
  }
})
const execute = () => autoMerge({ github, owner: 'doc-gif', repo: 'jtcc-group-e', runId: 1 })
test('approves the tested SHA then squash merges with an expected SHA', async () => {
  expect(await execute()).toContain('merged PR #1')
  expect(github.rest.pulls.createReview).toHaveBeenCalledWith(expect.objectContaining({ commit_id: 'head', event: 'APPROVE' }))
  expect(github.rest.pulls.merge).toHaveBeenCalledWith(expect.objectContaining({ sha: 'head', merge_method: 'squash' }))
})
test.each(['failure', 'cancelled', 'skipped', null])('does not approve %s runs', async (conclusion) => {
  run.conclusion = conclusion
  expect(await execute()).toContain('skip:')
  expect(github.rest.pulls.createReview).not.toHaveBeenCalled()
})
test('does not approve unrelated workflows, forks, push events or absent gates', async () => {
  run.path = 'other.yml'
  expect(await execute()).toContain('skip:')
  run.path = '.github/workflows/ci.yml'
  run.head_repository.full_name = 'outside/fork'
  expect(await execute()).toContain('skip:')
  run.head_repository.full_name = 'doc-gif/jtcc-group-e'
  run.event = 'push'
  expect(await execute()).toContain('skip:')
  run.event = 'pull_request'
  jobs = []
  expect(await execute()).toContain('quality gate missing')
  expect(github.rest.pulls.createReview).not.toHaveBeenCalled()
})
test('a passing old SHA never approves the new head', async () => {
  run.head_sha = 'old'
  expect(await execute()).toContain('stale SHA')
  expect(github.rest.pulls.merge).not.toHaveBeenCalled()
})
test('draft, behind and conflicted PRs stay open', async () => {
  pr.draft = true
  expect(await execute()).toContain('draft')
  pr.draft = false
  comparison.behind_by = 1
  expect(await execute()).toContain('update branch')
  comparison.behind_by = 0
  pr.mergeable = false
  expect(await execute()).toContain('update branch')
  expect(github.rest.pulls.createReview).not.toHaveBeenCalled()
})
test('missing protection fails closed and self-approval is skipped', async () => {
  base.protected = false
  await expect(execute()).rejects.toThrow('protected')
  pr.user.login = 'github-actions[bot]'
  expect(await execute()).toContain('own PR')
})
test('existing approval is reused and merge failure is not reported as success', async () => {
  reviews = [{ user: { login: 'github-actions[bot]' }, commit_id: 'head', state: 'APPROVED' }]
  github.rest.pulls.merge.mockResolvedValue({ data: { merged: false, message: 'blocked' } })
  await expect(execute()).rejects.toThrow('Merge blocked')
  expect(github.rest.pulls.createReview).not.toHaveBeenCalled()
})
test('invalid run IDs are rejected', async () => {
  await expect(autoMerge({ github, owner: 'a', repo: 'b', runId: NaN })).rejects.toThrow('Invalid')
})
