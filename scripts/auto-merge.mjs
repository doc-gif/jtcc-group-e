// Called from the default branch only. Never import or execute PR code here.
export async function autoMerge({ github, owner, repo, runId }) {
  if (!Number.isSafeInteger(runId) || runId < 1) throw new Error('Invalid CI run ID')
  const coordinates = { owner, repo }
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...coordinates, run_id: runId })
  if (run.path !== '.github/workflows/ci.yml' || run.event !== 'pull_request' || run.conclusion !== 'success' || run.head_repository?.full_name !== `${owner}/${repo}`) return 'skip: untrusted or unsuccessful run'
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, { ...coordinates, run_id: runId, filter: 'latest' })
  if (!['Quality gate', 'UI/UX gate'].every((name) => jobs.some((job) => job.name === name && job.conclusion === 'success'))) return 'skip: quality gate missing'
  const prs = await github.paginate(github.rest.pulls.list, { ...coordinates, state: 'open', base: 'main' })
  const candidate = prs.find((pr) => pr.head.sha === run.head_sha && pr.head.repo?.full_name === `${owner}/${repo}`)
  if (!candidate) return 'skip: stale SHA or closed PR'
  const { data: pr } = await github.rest.pulls.get({ ...coordinates, pull_number: candidate.number })
  if (pr.draft || pr.head.sha !== run.head_sha || pr.base.ref !== 'main' || pr.head.repo?.full_name !== `${owner}/${repo}`) return 'skip: draft or changed PR'
  if (pr.user.login === 'github-actions[bot]') return 'skip: bot cannot approve its own PR'
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
