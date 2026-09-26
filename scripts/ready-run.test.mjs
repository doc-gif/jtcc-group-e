import { expect, test, vi } from 'vitest'
import { readyRunId } from './auto-merge.mjs'

test('Ready reuses only the latest completed successful CI for the same SHA', async () => {
  const pr = { draft: false, base: { ref: 'main' }, head: { sha: 'a'.repeat(40), repo: { full_name: 'doc-gif/jtcc-group-e' } } }
  const runs = [{ id: 2, event: 'pull_request', head_sha: pr.head.sha, status: 'completed', conclusion: 'success' }]
  const github = { rest: { actions: { listWorkflowRuns: vi.fn(async () => ({ data: { workflow_runs: runs } })) } } }
  const args = { github, owner: 'doc-gif', repo: 'jtcc-group-e', pr }
  expect(await readyRunId(args)).toBe(2)
  runs.push({ id: 3, event: 'workflow_dispatch', head_sha: pr.head.sha, status: 'in_progress', conclusion: null })
  expect(await readyRunId(args)).toBeNull()
  runs[1].status = 'completed'; runs[1].conclusion = 'failure'
  expect(await readyRunId(args)).toBeNull()
  runs.splice(0); expect(await readyRunId(args)).toBeNull()
  pr.draft = true; expect(await readyRunId(args)).toBeNull()
  pr.draft = false; pr.head.repo.full_name = 'fork/repo'; expect(await readyRunId(args)).toBeNull()
})
