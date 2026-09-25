import { composeSite } from './release-lib.mjs'

const [siteDir, distDir] = process.argv.slice(2)
if (!siteDir || !distDir) throw new Error('Usage: node scripts/compose-site.mjs SITE_DIR DIST_DIR')
const release = await composeSite({ siteDir, distDir, version: process.env.RELEASE_VERSION, sha: process.env.RELEASE_SHA, repository: process.env.GITHUB_REPOSITORY })
console.log(JSON.stringify(release))
