// Called from the default branch only. Never import or execute PR code here.
import { classify } from './change-scope.mjs'

const fullJobs = ['Build and unit tests', 'Complete browser reports']
export async function readyRunId({ github, owner, repo, pr }) {
  if (pr.draft || pr.base.ref !== 'main' || pr.head.repo?.full_name !== `${owner}/${repo}`) return null
  const { data } = await github.rest.actions.listWorkflowRuns({ owner, repo, workflow_id: 'ci.yml', event: 'pull_request', head_sha: pr.head.sha, per_page: 20 })
  const latest = data.workflow_runs.filter((run) => run.head_sha === pr.head.sha).sort((a, b) => b.id - a.id)[0]
  return latest?.status === 'completed' && latest.conclusion === 'success' ? latest.id : null
}

export async function autoMerge({ github, owner, repo, runId }) {
  if (!Number.isSafeInteger(runId) || runId < 1) throw new Error('Invalid CI run ID')
  const coordinates = { owner, repo }
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...coordinates, run_id: runId })
  if (run.path !== '.github/workflows/ci.yml' || run.event !== 'pull_request' || run.conclusion !== 'success' || run.head_repository?.full_name !== `${owner}/${repo}`) return 'skip: untrusted or unsuccessful run'
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, { ...coordinates, run_id: runId, filter: 'latest' })
  const passed = (name) => jobs.some((job) => job.name === name && job.conclusion === 'success')
  if (!['Quality gate', 'UI/UX gate'].every(passed)) return 'skip: quality gate missing'
  const docsOnlyRun = !fullJobs.every(passed)
  if (docsOnlyRun && !passed('Docs-only checks')) return 'skip: quality gate missing'
  const prs = await github.paginate(github.rest.pulls.list, { ...coordinates, state: 'open', base: 'main' })
  const candidate = prs.find((pr) => pr.head.sha === run.head_sha && pr.head.repo?.full_name === `${owner}/${repo}`)
  if (!candidate) return 'skip: stale SHA or closed PR'
  const { data: pr } = await github.rest.pulls.get({ ...coordinates, pull_number: candidate.number })
  if (pr.draft || pr.head.sha !== run.head_sha || pr.base.ref !== 'main' || pr.head.repo?.full_name !== `${owner}/${repo}`) return 'skip: draft or changed PR'
  if (pr.user.login === 'github-actions[bot]') return 'skip: bot cannot approve its own PR'
  if (docsOnlyRun) {
    // The light CI skipped browser tests. Re-check the PR's files with main's rules before trusting it.
    const files = await github.paginate(github.rest.pulls.listFiles, { ...coordinates, pull_number: pr.number, per_page: 100 })
    const paths = files.flatMap((file) => [file.filename, file.previous_filename].filter(Boolean))
    if (files.length !== pr.changed_files || !classify(paths).docsOnly) return 'skip: docs-only checks ran for a PR that changes code'
  }
  const { data: base } = await github.rest.repos.getBranch({ ...coordinates, branch: 'main' })
  if (!base.protected) throw new Error('main must be protected before automatic merging')
  const { data: comparison } = await github.rest.repos.compareCommits({ ...coordinates, base: base.commit.sha, head: pr.head.sha })
  if (comparison.behind_by !== 0 || pr.mergeable === false) return 'skip: update branch and rerun CI'
  const reviews = await github.paginate(github.rest.pulls.listReviews, { ...coordinates, pull_number: pr.number })
  const alreadyApproved = reviews.some((review) => review.user?.login === 'github-actions[bot]' && review.commit_id === pr.head.sha && review.state === 'APPROVED')
  if (!alreadyApproved) await github.rest.pulls.createReview({ ...coordinates, pull_number: pr.number, commit_id: pr.head.sha, event: 'APPROVE', body: `Quality gate passed for ${pr.head.sha}.\n\n${run.html_url}\n\nAutomated test-based approval; branch protection remains enforced.` })
  // Expected SHA + strict branch protection close the race with new commits/main updates.
  const { data: merged } = await github.rest.pulls.merge({ ...coordinates, pull_number: pr.number, sha: pr.head.sha, merge_method: 'squash' })
  if (!merged.merged) throw new Error(`Merge blocked: ${merged.message}`)
  return `merged PR #${pr.number}: ${merged.sha}`
}
