import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { resolve, join, extname, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { composeSite } from './release-lib.mjs'

const temp = await mkdtemp(join(tmpdir(), 'jtcc-pages-test-'))
const root = join(temp, 'site')
await composeSite({ siteDir: root, distDir: resolve('dist'), version: 'v0.0.0', sha: 'a'.repeat(40), repository: 'doc-gif/jtcc-group-e' })
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' }
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (!pathname.startsWith('/jtcc-group-e/')) { response.writeHead(404).end(); return }
    let path = resolve(root, pathname.slice('/jtcc-group-e/'.length))
    if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end(); return }
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html')
    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' })
    response.end(await readFile(path))
  } catch { response.writeHead(404).end('Not found') }
})
server.listen(4173, '127.0.0.1')
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await rm(temp, { recursive: true, force: true }); process.exit(0) }))
