import { afterEach, beforeEach, expect, test } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compareVersions, composeSite, digestDirectory, renderHistory, validateVersion } from './release-lib.mjs'

let root, options
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'jtcc-release-unit-'))
  const distDir = join(root, 'dist')
  await mkdir(join(distDir, 'assets'), { recursive: true })
  await writeFile(join(distDir, 'index.html'), '<h1>First version</h1>')
  await writeFile(join(distDir, 'assets', 'app.js'), 'console.log(1)')
  options = { siteDir: join(root, 'site'), distDir, version: 'v1.0.0', sha: 'a'.repeat(40), repository: 'doc-gif/jtcc-group-e', createdAt: '2026-09-25T00:00:00.000Z' }
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

test.each(['../oops', 'v01.0.0', '1.0.0', 'v1.0.0;ls', 'v1.0.0/bad', 'v1.0.0-beta', undefined])('invalid version %s is rejected', (version) => {
  expect(() => validateVersion(version)).toThrow()
})
test('versions are compared numerically', () => {
  expect(compareVersions('v1.10.0', 'v1.2.0')).toBe(1)
  expect(compareVersions('v1.0.0', 'v2.0.0')).toBe(-1)
  expect(compareVersions('v1.0.0', 'v1.0.0')).toBe(0)
})
test('a new release preserves old bytes and replaces latest', async () => {
  const first = await composeSite(options)
  await writeFile(join(options.distDir, 'index.html'), '<h1>Second version</h1>')
  await composeSite({ ...options, version: 'v1.1.0', sha: 'b'.repeat(40) })
  expect(await readFile(join(options.siteDir, 'index.html'), 'utf8')).toContain('Second version')
  expect(await readFile(join(options.siteDir, 'versions/v1.0.0/index.html'), 'utf8')).toContain('First version')
  expect((await digestDirectory(join(options.siteDir, 'versions/v1.0.0'))).digest).toBe(first.digest)
  const manifest = JSON.parse(await readFile(join(options.siteDir, 'versions/manifest.json'), 'utf8'))
  expect(manifest.map((entry) => entry.version)).toEqual(['v1.1.0', 'v1.0.0'])
  expect(await readFile(join(options.siteDir, 'versions/index.html'), 'utf8')).toContain('./v1.1.0/')
})
test('retry is idempotent for the same build and commit', async () => {
  await composeSite(options)
  const before = await digestDirectory(options.siteDir)
  await composeSite({ ...options, createdAt: 'later' })
  expect(await digestDirectory(options.siteDir)).toEqual(before)
})
test('same version cannot be rebound to another commit or build', async () => {
  await composeSite(options)
  await expect(composeSite({ ...options, sha: 'b'.repeat(40) })).rejects.toThrow('immutable')
  await writeFile(join(options.distDir, 'index.html'), 'different')
  await expect(composeSite(options)).rejects.toThrow('immutable')
})
test('old versions cannot silently roll latest back', async () => {
  await composeSite(options)
  await expect(composeSite({ ...options, version: 'v0.9.0' })).rejects.toThrow('backwards')
})
test('modified history is detected before publishing another release', async () => {
  await composeSite(options)
  await writeFile(join(options.siteDir, 'versions/v1.0.0/index.html'), 'tampered')
  await expect(composeSite({ ...options, version: 'v1.1.0' })).rejects.toThrow('modified')
})
test('reserved paths, invalid identities and overlapping directories fail', async () => {
  await expect(composeSite({ ...options, sha: 'bad' })).rejects.toThrow('SHA')
  await expect(composeSite({ ...options, repository: '<bad>' })).rejects.toThrow('repository')
  await expect(composeSite({ ...options, siteDir: options.distDir })).rejects.toThrow('separate')
  await mkdir(join(options.distDir, 'versions'))
  await expect(composeSite(options)).rejects.toThrow('reserved')
})
test('refuses repository root, corrupt manifest and oversized output', async () => {
  await mkdir(join(options.siteDir, '.git'), { recursive: true })
  await expect(composeSite(options)).rejects.toThrow('repository root')
  await rm(join(options.siteDir, '.git'), { recursive: true })
  await expect(composeSite({ ...options, maxBytes: 1 })).rejects.toThrow('budget')
  await writeFile(join(options.siteDir, 'versions/manifest.json'), '{}')
  await expect(composeSite(options)).rejects.toThrow('manifest')
})
test('history output escapes markup', () => {
  expect(renderHistory([{ version: '<x>', sha: 'abcdefg', repository: 'a/b', createdAt: '"&\'' }])).toContain('&lt;x&gt;')
})
