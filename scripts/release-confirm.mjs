// 公開後の確認を workflow の最後で自動で行う（docs/DEPLOYMENT.md）。Pages の配信に反映されるまで待ち、
// 最新 URL の deployment.json・固定 URL・タグの SHA が、今回の版と SHA に一致することを確かめてから報告する。
import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function urls(siteUrl, version) {
  const base = `${siteUrl.replace(/\/$/, '')}/`
  return { latest: base, fixed: `${base}versions/${version}/`, deployment: `${base}deployment.json`, release: `https://github.com/doc-gif/jtcc-group-e/releases/tag/${version}` }
}

/** 公開の確認。fetchJson・fetchStatus・sleep は差し替えられる（テストでは偽物）。一致しないまま時間切れなら例外。 */
export async function confirmRelease({ siteUrl, version, sha, tagSha, fetchJson, fetchStatus, sleep, attempts = 40, intervalMs = 15_000 }) {
  const target = urls(siteUrl, version)
  if (tagSha !== sha) throw new Error(`タグ ${version} の commit（${tagSha}）が公開した SHA（${sha}）と違う`)
  let last = 'no response'
  for (let i = 0; i < attempts; i++) {
    try {
      // CDN のキャッシュを避けるため、確認のたびに別のクエリを付ける
      const deployment = await fetchJson(`${target.deployment}?check=${Date.now()}-${i}`)
      if (deployment?.version === version && deployment?.sha === sha) {
        const status = await fetchStatus(target.fixed)
        if (status === 200) return { ...target, deployment }
        last = `固定 URL が ${status}`
      } else last = `最新 URL は ${deployment?.version ?? '不明'}（${deployment?.sha ?? '不明'}）`
    } catch (error) { last = error instanceof Error ? error.message : String(error) }
    if (i < attempts - 1) await sleep(intervalMs)
  }
  throw new Error(`公開が確認できない（${attempts} 回）: ${last}`)
}

export function summary(result, version, sha) {
  return [
    `## 本番公開の確認: ${version}`,
    '',
    `- 最新 URL: ${result.latest}（deployment.json が ${version}・\`${sha}\` を返すことを確認）`,
    `- 固定 URL: ${result.fixed}（200 を確認）`,
    `- Release: ${result.release}（タグの commit が \`${sha}\` と一致）`,
    '- QR: この実行の成果物 `release-qr`（固定 URL。`pnpm qr` と同じ生成。生成方法の読み戻しの一致は scripts/qr.test.mjs で検査）',
    '',
  ].join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { RELEASE_VERSION: version, RELEASE_SHA: sha, SITE_URL: siteUrl, TAG_SHA: tagSha } = process.env
  const result = await confirmRelease({
    siteUrl, version, sha, tagSha,
    fetchJson: async (url) => { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error(`${response.status} ${url}`); return response.json() },
    fetchStatus: async (url) => (await fetch(url, { cache: 'no-store' })).status,
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
  })
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary(result, version, sha))
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `fixed=${result.fixed}\n`)
  console.log(JSON.stringify(result))
}
