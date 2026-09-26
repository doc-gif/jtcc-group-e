// 変わる事実を、その場で調べて出す（AGENTS.md「情報の鮮度」）。
//   node scripts/live-state.mjs
// main の SHA・本番の版・Release・公開の実行・開いている PR・PR のない最近のブランチ・main にない migration は、
// 文書に書き写すとすぐ古くなる。文書には確認方法だけを書き、動く前にこれで実態を確かめる。
// GitHub は公開リポジトリなので認証なしで読める（GH_TOKEN / GITHUB_TOKEN があれば使う。回数の上限が上がる）。
// Supabase の DB 側（適用済みの migration）は認証が要るので、ここでは main 側の一覧だけを出す。DB 側は Supabase MCP の list_migrations で照合する。
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

export const REPO = 'doc-gif/jtcc-group-e'
export const SITE = 'https://doc-gif.github.io/jtcc-group-e/'
/** 生成物・保護用のブランチ。作業ブランチとして数えない。 */
const IGNORED_BRANCHES = new Set(['main', 'pages-history', 'HEAD'])
/** GitHub Actions の実行の状態のうち、まだ終わっていないもの。 */
const ACTIVE_RUN = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending'])

/** `git for-each-ref --format='%(refname:short)\t%(objectname)\t%(committerdate:iso-strict)\t%(subject)' refs/remotes/origin` の出力を読む。 */
export function parseRefs(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [ref, sha, date, ...subject] = line.split('\t')
    return { branch: ref.replace(/^origin\//, ''), sha, date: new Date(date), subject: subject.join('\t') }
  }).filter((ref) => !IGNORED_BRANCHES.has(ref.branch) && ref.branch !== 'origin')
}

/**
 * 最近（既定 48 時間）更新されたのに、開いている PR がない作業ブランチ。途中の作業・PR の出し忘れを見つける。
 * 閉じた（マージ済みを含む）PR の head と同じ SHA のブランチは、終わった作業なので数えない。
 */
export function recentBranchesWithoutPr(refs, openPulls, closedPulls, now, hours = 48) {
  const withPr = new Set(openPulls.map((pull) => pull.head?.ref))
  const finished = new Set(closedPulls.map((pull) => pull.head?.sha))
  return refs
    .filter((ref) => !withPr.has(ref.branch) && !finished.has(ref.sha) && now - ref.date <= hours * 3600_000)
    .sort((a, b) => b.date - a.date)
}

/** 本番公開のワークフローのうち、待機中・実行中のもの。新しく依頼する前にこれを追う（同じ SHA の二重公開を防ぐ）。 */
export function activeRuns(runs) {
  return runs.filter((run) => ACTIVE_RUN.has(run.status))
}

/** `supabase/migrations/<version>_<name>.sql` の version。形が違えば null。 */
export function migrationVersion(path) {
  return /(?:^|\/)(\d{14})_[a-z0-9_]+\.sql$/.exec(path)?.[1] ?? null
}

/** ブランチにだけあり main にない migration（DB に適用済みならリポジトリより DB が先に進んでいる）。 */
export function migrationsOutsideMain(mainFiles, branchFiles) {
  const onMain = new Set(mainFiles.map(migrationVersion).filter(Boolean))
  const found = []
  for (const [branch, files] of Object.entries(branchFiles)) {
    for (const file of files) {
      const version = migrationVersion(file)
      if (version && !onMain.has(version)) found.push({ branch, file, version })
    }
  }
  return found.sort((a, b) => a.version.localeCompare(b.version) || a.branch.localeCompare(b.branch))
}

/** 取れなかった項目（ブランチ単位の未確認を含む）があるか。あれば失敗で終える（「未確認」を見落とさない）。 */
export function hasUnchecked(state) {
  return Object.values(state).some((value) => value instanceof Error) || (state.strayMigrations?.unchecked?.length ?? 0) > 0
}

const short = (sha) => (sha ?? '').slice(0, 7)
// 時刻が欠けた・壊れた値でも報告全体を落とさない
const utc = (date) => {
  const time = new Date(date ?? NaN)
  return Number.isNaN(time.getTime()) ? '時刻不明' : time.toISOString().replace(/:\d\d\.\d{3}Z$/, '').replace('T', ' ')
}

/** 調べた結果を、そのまま貼れる短い報告にする。取れなかった項目は「未確認」と書く（推測で埋めない）。 */
export function formatReport(state) {
  const lines = [`# 今の状態（${utc(state.checkedAt)} UTC に確認）`, '']
  const section = (title, value, render) => {
    lines.push(`## ${title}`)
    if (value instanceof Error) lines.push(`- 未確認: ${value.message}`)
    else lines.push(...render(value))
    lines.push('')
  }
  section('main', state.main, (main) => [`- \`${short(main.sha)}\` ${main.subject}（${utc(main.date)}）`])
  section('本番', state.production, (production) => [
    `- 公開中: ${production.deployment.version}（\`${short(production.deployment.sha)}\`、${utc(production.deployment.createdAt)}）`,
    `- 最新の Release: ${production.latestRelease}`,
    production.deployment.version !== production.latestRelease ? '- 注意: 公開中の版と最新の Release が違う（公開の途中か失敗）' : null,
    // main が取れなかったときは比べない（未定義の SHA と比べて「新しいコミットがある」と誤って出さない）
    !state.main || state.main instanceof Error ? '- main が未確認のため、main と本番の差は未確認'
      : production.deployment.sha !== state.main.sha ? '- main には本番より新しいコミットがある（公開は明示指示のときだけ）' : '- main と本番は同じ SHA',
  ].filter(Boolean))
  section('本番公開の実行（待機中・実行中）', state.releaseRuns, (runs) => runs.length
    ? runs.map((run) => `- 実行中あり: run ${run.id}（${run.status}、\`${short(run.head_sha)}\`、${utc(run.created_at)}）→ 新しく依頼せず、この実行を追う`)
    : ['- なし'])
  section('開いている PR', state.pulls, (pulls) => pulls.length
    ? pulls.map((pull) => `- #${pull.number}${pull.draft ? '（Draft）' : ''} \`${pull.head.ref}\` \`${short(pull.head.sha)}\` ${pull.title}（更新 ${utc(pull.updated_at)}）`)
    : ['- なし'])
  section('PR のない最近のブランチ（48時間以内）', state.orphanBranches, (refs) => refs.length
    ? refs.map((ref) => `- \`${ref.branch}\` \`${short(ref.sha)}\` ${ref.subject}（${utc(ref.date)}）`)
    : ['- なし'])
  section('main にない migration', state.strayMigrations, ({ items, unchecked }) => [
    ...(items.length
      ? [...items.map((item) => `- ${item.version}: \`${item.file}\`（ブランチ \`${item.branch}\` にだけある）`),
        '- DB に適用済みなら、ファイル名・中身を変えずに main へ入れる（Supabase MCP の list_migrations で照合）']
      : unchecked.length ? [] : ['- なし']),
    ...unchecked.map((item) => `- 未確認: ブランチ \`${item.branch}\`（${item.reason}）`),
  ])
  if (state.mainMigrations && !(state.mainMigrations instanceof Error)) {
    lines.push(`main の最新の migration: ${state.mainMigrations.at(-1) ?? 'なし'}（DB 側は Supabase MCP の list_migrations と照合）`, '')
  }
  return lines.join('\n')
}

/**
 * 実態を集める。git と fetchJson は差し替えられる（テストでは偽物を渡す）。
 * `git fetch` に失敗したら、手元のリモート追跡ブランチは古い可能性があるので、git から読む項目はすべて未確認にする
 * （古い記録を「今の状態」として出さない）。
 */
export async function collect({ git, fetchJson, now }) {
  const attempt = async (run) => { try { return await run() } catch (error) { return error instanceof Error ? error : new Error(String(error)) } }
  const fetched = await attempt(() => git(['fetch', '--quiet', '--prune', 'origin']))
  const stale = fetched instanceof Error ? new Error(`git fetch に失敗（手元の記録は古い可能性があるので使わない）: ${fetched.message}`) : null
  const fromGit = (run) => stale ? Promise.resolve(stale) : attempt(run)
  const refs = await fromGit(async () => parseRefs(await git(['for-each-ref', '--format=%(refname:short)%09%(objectname)%09%(committerdate:iso-strict)%09%(subject)', 'refs/remotes/origin'])))
  const main = await fromGit(async () => {
    const [sha, date, ...subject] = (await git(['log', '-1', '--format=%H%x09%cI%x09%s', 'origin/main'])).trim().split('\t')
    return { sha, date: new Date(date), subject: subject.join('\t') }
  })
  const production = await attempt(async () => ({
    deployment: await fetchJson(`${SITE}deployment.json`),
    latestRelease: (await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)).tag_name,
  }))
  const releaseRuns = await attempt(async () => activeRuns((await fetchJson(`https://api.github.com/repos/${REPO}/actions/workflows/release-pages.yml/runs?per_page=10`)).workflow_runs))
  const pulls = await attempt(() => fetchJson(`https://api.github.com/repos/${REPO}/pulls?state=open&per_page=100`))
  const closed = await attempt(() => fetchJson(`https://api.github.com/repos/${REPO}/pulls?state=closed&per_page=100&sort=updated&direction=desc`))
  const orphanBranches = [refs, pulls, closed].find((value) => value instanceof Error) ?? recentBranchesWithoutPr(refs, pulls, closed, now)
  const mainMigrations = await fromGit(async () => (await git(['ls-tree', '--name-only', 'origin/main', 'supabase/migrations/'])).split('\n').filter(Boolean).map((file) => file.split('/').pop()).sort())
  const strayMigrations = await attempt(async () => {
    if (refs instanceof Error) throw refs
    if (mainMigrations instanceof Error) throw mainMigrations
    const branchFiles = {}
    const unchecked = []
    for (const ref of refs.filter((item) => now - item.date <= 14 * 24 * 3600_000)) {
      // 1本の差分が取れなくても（main と共通の祖先がない等）、ほかのブランチは調べ、取れなかったブランチを未確認と出す
      try {
        branchFiles[ref.branch] = (await git(['diff', '--name-only', '--diff-filter=A', `origin/main...origin/${ref.branch}`, '--', 'supabase/migrations/'])).split('\n').filter(Boolean)
      } catch (error) {
        unchecked.push({ branch: ref.branch, reason: error instanceof Error ? error.message.split('\n')[0] : String(error) })
      }
    }
    return { items: migrationsOutsideMain(mainMigrations, branchFiles), unchecked }
  })
  return { checkedAt: now, main, production, releaseRuns, pulls, orphanBranches, strayMigrations, mainMigrations }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const run = promisify(execFile)
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  const state = await collect({
    now: new Date(),
    git: async (args) => (await run('git', args, { maxBuffer: 8 * 1024 * 1024 })).stdout,
    fetchJson: async (url) => {
      const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'jtcc-live-state' }
      if (token && url.startsWith('https://api.github.com/')) headers.Authorization = `Bearer ${token}`
      const response = await fetch(url, { headers, cache: 'no-store' })
      if (!response.ok) throw new Error(`${response.status} ${url}`)
      return response.json()
    },
  })
  console.log(formatReport(state))
  // 取れなかった項目があれば失敗で終える（「未確認」を見落とさない）
  if (hasUnchecked(state)) process.exitCode = 1
}
