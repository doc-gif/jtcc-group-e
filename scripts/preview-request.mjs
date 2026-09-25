// Executed from main only. Artifacts are data, never executable deployment code.
export async function resolvePreview({ github, owner, repo, runId }) {
  if (!Number.isSafeInteger(runId) || runId < 1) throw new Error('Invalid run ID')
  const coordinates = { owner, repo }
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...coordinates, run_id: runId })
  const fast = run.path === '.github/workflows/preview-build.yml'
  if ((!fast && run.path !== '.github/workflows/ci.yml') || run.event !== 'pull_request' || run.status !== 'completed'
    || run.conclusion !== 'success' || run.head_repository?.full_name !== `${owner}/${repo}`
    || !/^[a-f0-9]{40}$/.test(run.head_sha)) return null
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, { ...coordinates, run_id: runId, filter: 'latest' })
  const required = fast ? ['Preview build'] : ['Quality gate', 'UI/UX gate']
  if (!required.every((name) => jobs.some((job) => job.name === name && job.conclusion === 'success'))) return null
  // Include merged PRs: the merge bot can finish before this workflow starts.
  const candidates = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, { ...coordinates, commit_sha: run.head_sha })
  const candidate = candidates.find((pr) => pr.head.sha === run.head_sha && pr.base.ref === 'main' && pr.head.repo?.full_name === `${owner}/${repo}`)
  if (!candidate) return null
  const { data: pr } = await github.rest.pulls.get({ ...coordinates, pull_number: candidate.number })
  if (pr.head.sha !== run.head_sha || pr.base.ref !== 'main' || pr.head.repo?.full_name !== `${owner}/${repo}`
    || (pr.state !== 'open' && !pr.merged_at)) return null
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, { ...coordinates, run_id: runId })
  const builds = artifacts.filter((a) => a.name === 'web-dist' && !a.expired)
  if (builds.length !== 1 || builds[0].size_in_bytes > 50 * 1024 * 1024) throw new Error('Missing, ambiguous, expired or oversized build artifact')
  return { pr: pr.number, sha: run.head_sha, runId, artifactId: builds[0].id, repository: `${owner}/${repo}`, ...(fast ? { stage: 'early' } : {}) }
}

export function previewUrls(request) {
  return {
    fixed: `https://doc-gif.github.io/jtcc-group-e-preview/pr-${request.pr}/runs/${request.runId}/`,
    latest: `https://doc-gif.github.io/jtcc-group-e-preview/pr-${request.pr}/`,
  }
}

export async function commentPreview({ github, owner, repo, request }) {
  const current = await resolvePreview({ github, owner, repo, runId: request.runId })
  if (!current || current.artifactId !== request.artifactId) return 'skip: PR changed'
  const { fixed, latest } = previewUrls(request)
  const marker = '<!-- jtcc-preview -->'
  const body = `${marker}\n## 修正結果を確認できます\n\n[この変更をスマートフォンで開く](${fixed})\n\n本番とは別の確認用サイトです。型・lint・単体テスト・ビルドを確認済みです。全画面の操作・UI/UX の検証は別の CI で行い、成功するまでマージしません。気になる画面・操作を伝えてください。\n\n- 対象: \`${request.sha}\`\n- [この PR の最新の確認用画面](${latest})\n- [検証・ビルド](https://github.com/${owner}/${repo}/actions/runs/${request.runId})\n- マージ後も閲覧できます。保持は原則30日・PRごと最新3ビルドです。\n\n![スマートフォンで開くQRコード](${fixed}qr.png)\n\n<!-- preview-run:${request.runId} -->`
  const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: request.pr })
  const existing = comments.find((c) => c.user?.login === 'github-actions[bot]' && c.body?.startsWith(marker))
  const previousRun = Number(/<!-- preview-run:(\d+) -->/.exec(existing?.body ?? '')?.[1] ?? 0)
  if (previousRun > request.runId) return 'skip: newer preview already announced'
  if (existing) await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body })
  else await github.rest.issues.createComment({ owner, repo, issue_number: request.pr, body })
  return fixed
}
