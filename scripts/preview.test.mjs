import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { composePreview, inspectBuild, keepPreviews, validatePreviewRequest } from './preview-site.mjs'
import { commentPreview, previewUrls, resolvePreview } from './preview-request.mjs'

const request = { pr: 5, runId: 101, artifactId: 9, sha: 'a'.repeat(40), repository: 'doc-gif/jtcc-group-e' }
const now = '2026-09-25T00:00:00Z'
const temps = []
afterEach(async () => { for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true }) })
async function fixture() {
  const temp = await mkdtemp(join(tmpdir(), 'jtcc-preview-test-')); temps.push(temp)
  const siteDir = join(temp, 'site'), distDir = join(temp, 'dist')
  await mkdir(siteDir); await mkdir(distDir)
  await writeFile(join(siteDir, '.preview-site.json'), JSON.stringify({ repository: 'doc-gif/jtcc-group-e-preview' }))
  await writeFile(join(distDir, 'index.html'), '<h1>test app</h1>')
  return { siteDir, distDir, request, now }
}
function api() {
  const pr = { number: 5, state: 'open', draft: true, base: { ref: 'main' }, head: { sha: request.sha, repo: { full_name: request.repository } } }
  const run = { path: '.github/workflows/ci.yml', event: 'pull_request', status: 'completed', conclusion: 'success', head_sha: request.sha, head_repository: { full_name: request.repository } }
  const jobs = ['Quality gate', 'UI/UX gate'].map((name) => ({ name, conclusion: 'success' }))
  const artifacts = [{ name: 'web-dist', id: 9, size_in_bytes: 100, expired: false }], comments = []
  const github = { rest: {
    actions: { getWorkflowRun: vi.fn(async () => ({ data: run })), listJobsForWorkflowRun: async () => jobs, listWorkflowRunArtifacts: async () => artifacts },
    repos: { listPullRequestsAssociatedWithCommit: async () => [pr] },
    pulls: { get: vi.fn(async () => ({ data: pr })) },
    issues: { listComments: async () => comments, createComment: vi.fn(), updateComment: vi.fn() },
  }, paginate: async (fn) => fn() }
  return { github, owner: 'doc-gif', repo: 'jtcc-group-e', runId: 101, run, pr, jobs, artifacts, comments, request }
}

describe('preview publication eligibility', () => {
  it('allows the fast build without treating it as a full merge gate', async () => {
    const f = api(); f.run.path = '.github/workflows/preview-build.yml'; f.jobs.splice(0, 2, { name: 'Preview build', conclusion: 'success' })
    expect(await resolvePreview(f)).toEqual({ ...request, stage: 'early' })
    f.jobs[0].conclusion = 'failure'
    expect(await resolvePreview(f)).toBeNull()
  })
  it('accepts a successful Draft and a PR already merged by the bot', async () => {
    const f = api(); expect(await resolvePreview(f)).toEqual(request)
    f.pr.state = 'closed'; f.pr.merged_at = now
    expect(await resolvePreview(f)).toEqual(request)
  })
  it.each([
    (f) => { f.run.path = 'untrusted.yml' }, (f) => { f.run.event = 'push' },
    (f) => { f.run.status = 'in_progress' }, (f) => { f.run.conclusion = 'failure' },
    (f) => { f.run.head_repository.full_name = 'fork/repo' }, (f) => { f.run.head_sha = 'invalid' },
    (f) => { f.jobs[1].conclusion = 'skipped' }, (f) => { f.pr.head.sha = 'b'.repeat(40) },
    (f) => { f.pr.base.ref = 'other' }, (f) => { f.pr.head.repo.full_name = 'fork/repo' },
    (f) => { f.pr.state = 'closed' },
  ])('rejects an untrusted or obsolete request %#', async (mutate) => {
    const f = api(); mutate(f); expect(await resolvePreview(f)).toBeNull()
  })
  it('rechecks the current PR after association lookup', async () => {
    const f = api(); f.github.rest.pulls.get.mockResolvedValue({ data: { ...f.pr, head: { ...f.pr.head, sha: 'b'.repeat(40) } } })
    expect(await resolvePreview(f)).toBeNull()
  })
  it.each(['missing', 'expired', 'ambiguous', 'oversized'])('rejects %s artifacts', async (kind) => {
    const f = api()
    if (kind === 'missing') f.artifacts.length = 0
    if (kind === 'expired') f.artifacts[0].expired = true
    if (kind === 'ambiguous') f.artifacts.push({ ...f.artifacts[0] })
    if (kind === 'oversized') f.artifacts[0].size_in_bytes = 51 * 1024 * 1024
    await expect(resolvePreview(f)).rejects.toThrow('artifact')
  })
  it('rejects invalid run IDs', async () => { await expect(resolvePreview({ ...api(), runId: -1 })).rejects.toThrow('run ID') })
  it('posts a verified fixed URL and edits only its own comment', async () => {
    const f = api(); f.comments.push({ id: 1, user: { login: 'human' }, body: '<!-- jtcc-preview -->' })
    expect(await commentPreview(f)).toBe(previewUrls(request).fixed)
    expect(f.github.rest.issues.createComment).toHaveBeenCalledOnce()
    f.comments.push({ id: 2, user: { login: 'github-actions[bot]' }, body: '<!-- jtcc-preview -->' })
    await commentPreview(f)
    expect(f.github.rest.issues.updateComment).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 2 }))
    f.comments[1].body += '<!-- preview-run:102 -->'
    expect(await commentPreview(f)).toContain('newer')
  })
  it('does not announce stale builds', async () => {
    const f = api(); f.pr.state = 'closed'
    expect(await commentPreview(f)).toContain('changed')
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled()
  })
})

describe('preview site storage', () => {
  it('preserves fixed builds and other PRs, supports retries, skips older runs', async () => {
    const f = await fixture()
    const first = await composePreview(f)
    expect(first.entry.bytes).toBeGreaterThan(0)
    expect(await composePreview(f)).toEqual(first)
    await composePreview({ ...f, request: { ...request, pr: 6 } })
    await composePreview({ ...f, request: { ...request, runId: 102 } })
    expect(await readFile(join(f.siteDir, 'pr-5/runs/101/app/index.html'), 'utf8')).toContain('test app')
    expect(await readFile(join(f.siteDir, 'pr-6/runs/101/index.html'), 'utf8')).toContain('本番ではありません')
    expect(await readFile(join(f.siteDir, 'pr-5/index.html'), 'utf8')).toContain('runs/102/')
    expect(await composePreview(f)).toEqual({ skipped: true })
  })
  it('rejects changing the contents of an existing fixed URL', async () => {
    const f = await fixture(); await composePreview(f)
    await writeFile(join(f.distDir, 'index.html'), 'changed')
    await expect(composePreview(f)).rejects.toThrow('immutable')
  })
  it('expires old runs and retains at most three per PR', async () => {
    const f = await fixture(); await composePreview(f)
    for (const runId of [102, 103, 104]) await composePreview({ ...f, request: { ...request, runId } })
    await expect(readFile(join(f.siteDir, 'pr-5/runs/101/index.html'))).rejects.toThrow()
    await composePreview({ ...f, now: '2026-11-01T00:00:00Z', request: { ...request, pr: 6, runId: 105 } })
    expect(await readFile(join(f.siteDir, 'pr-5/index.html'), 'utf8')).toContain('保管期間は終了')
    expect(keepPreviews([{ ...request, createdAt: now }], Date.parse('2026-11-01'))).toEqual([])
  })
  it('refuses production targets, malformed metadata and path traversal', async () => {
    const f = await fixture()
    for (const bad of [{ pr: '../x' }, { runId: 0 }, { artifactId: -1 }, { sha: 'no' }, { repository: 'other' }]) {
      expect(() => validatePreviewRequest({ ...request, ...bad })).toThrow()
    }
    await writeFile(join(f.siteDir, '.preview-site.json'), '{"repository":"doc-gif/jtcc-group-e"}')
    await expect(composePreview(f)).rejects.toThrow('outside preview')
  })
  it('rejects hidden files and missing index before publishing', async () => {
    const f = await fixture(); await writeFile(join(f.distDir, '.git'), 'bad')
    await expect(inspectBuild(f.distDir)).rejects.toThrow('Unsafe')
    await rm(join(f.distDir, '.git')); await rm(join(f.distDir, 'index.html'))
    await expect(inspectBuild(f.distDir)).rejects.toThrow()
  })
  it('hashes nested assets deterministically', async () => {
    const f = await fixture(); await mkdir(join(f.distDir, 'assets')); await writeFile(join(f.distDir, 'assets/app.js'), 'app')
    expect(await inspectBuild(f.distDir)).toEqual(await inspectBuild(f.distDir))
  })
})
