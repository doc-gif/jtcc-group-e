import { appendFile, readFile } from 'node:fs/promises'
import { composePreview } from './preview-site.mjs'
const [siteDir, distDir, requestFile] = process.argv.slice(2)
if (!siteDir || !distDir || !requestFile) throw new Error('Usage: compose-preview site dist request.json')
const request = JSON.parse(await readFile(requestFile, 'utf8'))
const result = await composePreview({ siteDir, distDir, request })
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `skipped=${result.skipped}\n`)
console.log(JSON.stringify(result))
