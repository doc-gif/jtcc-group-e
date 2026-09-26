// 本番公開のキュー（docs/DEPLOYMENT.md「公開のキュー」）。公開の依頼は「今の main を公開する」の意味で、
// 版の番号はここで決める（入力がなければ最新のタグの patch + 1）。同じ SHA の二重公開と、古い SHA への巻き戻しを止める。
// 公開は concurrency で1本ずつ動くので、この判定は前の公開が終わった後の最新のタグで行われる。
import { execFileSync } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compareVersions, validateVersion } from './release-lib.mjs'

const isVersion = (name) => { try { validateVersion(name); return true } catch { return false } }
const bumpPatch = (version) => { const [major, minor, patch] = version.slice(1).split('.'); return `v${major}.${minor}.${BigInt(patch) + 1n}` }

/**
 * tags: GitHub の tags API の形（{ name, commit: { sha } }）。isAncestor(sha): そのコミットが公開する SHA の祖先か。
 * 返り値: { publish: true, version } か { publish: false, version, reason }（公開しない理由）。止めるべき依頼は例外。
 */
export function planRelease({ tags, sha, requested, isAncestor }) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) throw new Error('RELEASE_SHA must be a full commit SHA')
  const versions = tags.filter((tag) => isVersion(tag.name)).sort((a, b) => compareVersions(b.name, a.name))
  const latest = versions[0]
  const released = versions.find((tag) => tag.commit?.sha === sha)
  if (requested) {
    validateVersion(requested)
    const existing = versions.find((tag) => tag.name === requested)
    if (existing && existing.commit?.sha !== sha) throw new Error(`${requested} は別の commit（${existing.commit?.sha}）に付いている。版を上書きしない`)
  }
  if (released) return { publish: false, version: released.name, reason: `この SHA は ${released.name} で公開済み（同じ SHA を二重に公開しない）` }
  if (latest && !isAncestor(latest.commit.sha)) throw new Error(`最新の ${latest.name}（${latest.commit.sha}）を含まない SHA。古い SHA へ巻き戻さない（修正の PR をマージして今の main を公開する）`)
  if (!requested) return { publish: true, version: latest ? bumpPatch(latest.name) : 'v0.1.0' }
  if (latest && compareVersions(requested, latest.name) <= 0) throw new Error(`${requested} は最新の ${latest.name} より大きくする`)
  return { publish: true, version: requested }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' })
  const sha = process.env.RELEASE_SHA
  const tags = JSON.parse(run('gh', ['api', '--paginate', '--slurp', `repos/${process.env.GITHUB_REPOSITORY}/tags?per_page=100`])).flat()
  const isAncestor = (commit) => { try { run('git', ['merge-base', '--is-ancestor', commit, sha]); return true } catch { return false } }
  const plan = planRelease({ tags, sha, requested: process.env.REQUESTED_VERSION?.trim() || '', isAncestor })
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `publish=${plan.publish}\nversion=${plan.version}\n`)
  const line = plan.publish ? `Publish ${plan.version} from ${sha}` : `Skip: ${plan.reason}`
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## 本番公開の計画\n\n- ${line}\n`)
  console.log(line)
}
