// Called from the default branch only. Never import or execute PR code here.
import { classify } from './change-scope.mjs'

const fullJobs = ['Build and unit tests', 'Complete browser reports']
// CI runs that can prove a PR head: the PR's own CI, and the queue's CI after it merged main into the branch.
const ciEvents = new Set(['pull_request', 'workflow_dispatch'])
const activeStatus = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending'])
const bot = 'github-actions[bot]'
const sameRepo = (pr, owner, repo) => pr.head.repo?.full_name === `${owner}/${repo}`
const queueable = (pr, owner, repo) => !pr.draft && pr.base.ref === 'main' && sameRepo(pr, owner, repo) && pr.user?.login !== bot

async function latestCiRun({ github, owner, repo, sha }) {
  const { data } = await github.rest.actions.listWorkflowRuns({ owner, repo, workflow_id: 'ci.yml', head_sha: sha, per_page: 20 })
  return data.workflow_runs.filter((run) => run.head_sha === sha && ciEvents.has(run.event)).sort((a, b) => b.id - a.id)[0] ?? null
}

// One comment per marker, so a PR stuck in the queue is not spammed on every pass.
async function noteOnce({ github, owner, repo, number, marker, body }) {
  const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: number, per_page: 100 })
  if (comments.some((comment) => comment.user?.login === bot && comment.body?.includes(marker))) return
  await github.rest.issues.createComment({ owner, repo, issue_number: number, body: `${marker}\n${body}` })
}

export async function readyRunId({ github, owner, repo, pr }) {
  if (pr.draft || pr.base.ref !== 'main' || !sameRepo(pr, owner, repo)) return null
  const latest = await latestCiRun({ github, owner, repo, sha: pr.head.sha })
  return latest?.status === 'completed' && latest.conclusion === 'success' ? latest.id : null
}

export async function autoMerge({ github, owner, repo, runId }) {
  if (!Number.isSafeInteger(runId) || runId < 1) throw new Error('Invalid CI run ID')
  const coordinates = { owner, repo }
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...coordinates, run_id: runId })
  if (run.path !== '.github/workflows/ci.yml' || !ciEvents.has(run.event) || run.head_repository?.full_name !== `${owner}/${repo}`) return 'skip: untrusted or unsuccessful run'
  if (run.conclusion !== 'success') {
    if (run.event === 'workflow_dispatch' && run.status === 'completed' && run.conclusion === 'failure') await noteQueueFailure({ github, owner, repo, run })
    return 'skip: untrusted or unsuccessful run'
  }
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, { ...coordinates, run_id: runId, filter: 'latest' })
  const passed = (name) => jobs.some((job) => job.name === name && job.conclusion === 'success')
  if (!['Quality gate', 'UI/UX gate'].every(passed)) return 'skip: quality gate missing'
  const docsOnlyRun = !fullJobs.every(passed)
  if (docsOnlyRun && !passed('Docs-only checks')) return 'skip: quality gate missing'
  const prs = await github.paginate(github.rest.pulls.list, { ...coordinates, state: 'open', base: 'main' })
  const candidate = prs.find((pr) => pr.head.sha === run.head_sha && sameRepo(pr, owner, repo))
  if (!candidate) return 'skip: stale SHA or closed PR'
  const { data: pr } = await github.rest.pulls.get({ ...coordinates, pull_number: candidate.number })
  if (pr.draft || pr.head.sha !== run.head_sha || pr.base.ref !== 'main' || !sameRepo(pr, owner, repo)) return 'skip: draft or changed PR'
  if (run.event === 'workflow_dispatch' && run.head_branch !== pr.head.ref) return 'skip: queue run for another branch'
  if (pr.user.login === bot) return 'skip: bot cannot approve its own PR'
  if (docsOnlyRun) {
    // The light CI skipped browser tests. Re-check the PR's files with main's rules before trusting it.
    const files = await github.paginate(github.rest.pulls.listFiles, { ...coordinates, pull_number: pr.number, per_page: 100 })
    const paths = files.flatMap((file) => [file.filename, file.previous_filename].filter(Boolean))
    if (files.length !== pr.changed_files || !classify(paths).docsOnly) return 'skip: docs-only checks ran for a PR that changes code'
  }
  const { data: base } = await github.rest.repos.getBranch({ ...coordinates, branch: 'main' })
  if (!base.protected) throw new Error('main must be protected before automatic merging')
  const { data: comparison } = await github.rest.repos.compareCommits({ ...coordinates, base: base.commit.sha, head: pr.head.sha })
  if (comparison.behind_by !== 0 || pr.mergeable === false) return 'skip: behind main; the merge queue updates the branch and reruns CI'
  const reviews = await github.paginate(github.rest.pulls.listReviews, { ...coordinates, pull_number: pr.number })
  const alreadyApproved = reviews.some((review) => review.user?.login === bot && review.commit_id === pr.head.sha && review.state === 'APPROVED')
  if (!alreadyApproved) await github.rest.pulls.createReview({ ...coordinates, pull_number: pr.number, commit_id: pr.head.sha, event: 'APPROVE', body: `Quality gate passed for ${pr.head.sha}.\n\n${run.html_url}\n\nAutomated test-based approval; branch protection remains enforced.` })
  // Expected SHA + strict branch protection close the race with new commits/main updates.
  const { data: merged } = await github.rest.pulls.merge({ ...coordinates, pull_number: pr.number, sha: pr.head.sha, merge_method: 'squash' })
  if (!merged.merged) throw new Error(`Merge blocked: ${merged.message}`)
  return `merged PR #${pr.number}: ${merged.sha}`
}

async function noteQueueFailure({ github, owner, repo, run }) {
  const prs = await github.paginate(github.rest.pulls.list, { owner, repo, state: 'open', base: 'main' })
  const pr = prs.find((item) => item.head.sha === run.head_sha && item.head.ref === run.head_branch && sameRepo(item, owner, repo))
  if (!pr) return
  await noteOnce({
    github, owner, repo, number: pr.number, marker: `<!-- merge-queue-ci:${run.head_sha} -->`,
    body: `マージのキューが main を取り込んだ後の CI が失敗しました（${run.html_url}）。キューから外れています。\n\n- UI の変更が main と重なると、UI/UX のレビュー記録（digest）の作り直しが要ります: \`git pull\` → \`pnpm ux:digest\` → \`docs/ux-reviews/\` の記録を今の UI で確かめて更新 → push。\n- それ以外の失敗も、直して push し CI が成功すれば、キューに戻ります（docs/DEVELOPMENT.md「マージのキュー」）。`,
  })
}

/**
 * The merge queue (docs/DEVELOPMENT.md): one PR at a time, oldest first. A Ready PR whose head passed CI but is behind main
 * gets main merged into its branch by the bot, then CI is started on it (pushes by GITHUB_TOKEN do not trigger workflows,
 * so the queue dispatches ci.yml itself). The completed CI calls autoMerge again. Every pass rescans, so a dropped event is
 * picked up by the next pass (CI completion, Ready, or the schedule).
 */
export async function advanceQueue({ github, owner, repo }) {
  const coordinates = { owner, repo }
  const prs = (await github.paginate(github.rest.pulls.list, { ...coordinates, state: 'open', base: 'main', per_page: 100 }))
    .filter((pr) => queueable(pr, owner, repo)).sort((a, b) => a.number - b.number)
  if (!prs.length) return 'queue: empty'
  const heads = new Set(prs.map((pr) => pr.head.ref))
  const { data: dispatched } = await github.rest.actions.listWorkflowRuns({ ...coordinates, workflow_id: 'ci.yml', event: 'workflow_dispatch', per_page: 20 })
  const busy = dispatched.workflow_runs.find((run) => activeStatus.has(run.status) && heads.has(run.head_branch))
  if (busy) return `queue: waiting for CI of ${busy.head_branch} (run ${busy.id})`
  const { data: base } = await github.rest.repos.getBranch({ ...coordinates, branch: 'main' })
  for (const pr of prs) {
    const run = await latestCiRun({ github, owner, repo, sha: pr.head.sha })
    if (run?.status !== 'completed' || run.conclusion !== 'success') continue
    const { data: comparison } = await github.rest.repos.compareCommits({ ...coordinates, base: base.commit.sha, head: pr.head.sha })
    // Up to date and green: an earlier event was dropped, so merge it now.
    if (comparison.behind_by === 0) return `queue: ${await autoMerge({ github, owner, repo, runId: run.id })}`
    let merge
    try {
      ({ data: merge } = await github.rest.repos.merge({ ...coordinates, base: pr.head.ref, head: base.commit.sha, commit_message: `Merge main ${base.commit.sha.slice(0, 7)} into ${pr.head.ref} (merge queue)` }))
    } catch (error) {
      // Conflicts (409) or a main that changed workflow files (GITHUB_TOKEN cannot push those) need the author.
      await noteOnce({
        github, owner, repo, number: pr.number, marker: `<!-- merge-queue-update:${pr.head.sha} -->`,
        body: `マージのキューが main（\`${base.commit.sha.slice(0, 7)}\`）を自動で取り込めませんでした（${error?.status ?? ''} ${String(error?.message ?? error).split('\n')[0]}）。競合、または main の \`.github/workflows\` の変更（Bot は取り込めない）です。作業者が \`git merge origin/main\` で取り込み、push してください。CI が成功すれば Bot がマージします。`,
      })
      continue
    }
    // A failed dispatch fails this job visibly; the branch then waits for the author's next push or a manual CI run.
    await github.rest.actions.createWorkflowDispatch({ ...coordinates, workflow_id: 'ci.yml', ref: pr.head.ref, inputs: { queue_base: base.commit.sha } })
    return `queue: merged main into PR #${pr.number} (${merge?.sha ?? 'up to date'}) and started CI`
  }
  return 'queue: nothing ready'
}
