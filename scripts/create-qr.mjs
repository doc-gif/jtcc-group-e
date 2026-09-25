import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { qrPng } from './qr.mjs'

const [url, output] = process.argv.slice(2)
if (!url || !output?.endsWith('.png')) throw new Error('Usage: pnpm qr <verified-https-url> <output.png>')
await writeFile(output, await qrPng(url))
console.log(JSON.stringify({ url: new URL(url).href, path: resolve(output) }))
