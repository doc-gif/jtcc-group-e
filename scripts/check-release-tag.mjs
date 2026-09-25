import { execFileSync } from 'node:child_process'
import { validateVersion } from './release-lib.mjs'

const version = validateVersion(process.env.RELEASE_VERSION)
const repo = process.env.GITHUB_REPOSITORY
const tags = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${repo}/tags?per_page=100`], { encoding: 'utf8' })).flat()
const tag = tags.find((entry) => entry.name === version)
if (tag && tag.commit.sha !== process.env.RELEASE_SHA) throw new Error('Existing version tag points at another commit')
