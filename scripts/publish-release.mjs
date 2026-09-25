import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { validateVersion } from './release-lib.mjs'

const version = validateVersion(process.env.RELEASE_VERSION)
const repo = process.env.GITHUB_REPOSITORY
const sha = process.env.RELEASE_SHA
const siteUrl = process.env.SITE_URL.replace(/\/$/, '')
const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' })
const releases = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repo}/releases?per_page=100`])).flat()
const existing = releases.find((entry) => entry.tag_name === version)
const manifest = JSON.parse(await readFile('archive/site/deployment.json', 'utf8'))
await writeFile('release-notes.md', `## ${version}\n\n- Open this version: ${siteUrl}/versions/${version}/\n- Version history: ${siteUrl}/versions/\n- Source commit: ${sha}\n- Build SHA-256 (directory manifest): ${manifest.digest}\n\nThe attached ZIP contains the original static build. Historical UI does not freeze external APIs or production data.\n`)
if (!existing) {
  gh(['release', 'create', version, 'web-app.zip', '--repo', repo, '--target', sha, '--title', version, '--notes-file', 'release-notes.md'])
} else if (!existing.assets.some((asset) => asset.name === 'web-app.zip')) {
  gh(['release', 'upload', version, 'web-app.zip', '--repo', repo])
}
console.log(`${siteUrl}/versions/${version}/`)
