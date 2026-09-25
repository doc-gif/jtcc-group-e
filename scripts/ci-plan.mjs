import { readFile, appendFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function testCount(report) {
  const walk = (suite) => (suite.specs ?? []).reduce((n, spec) => n + (spec.tests ?? []).length, 0) + (suite.suites ?? []).reduce((n, child) => n + walk(child), 0)
  return walk(report)
}

function testKeys(report) {
  const keys = []
  const walk = (suite) => {
    // Merged JSON retains projectName but can omit the internal projectId.
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) keys.push(`${spec.id}:${test.projectName ?? test.projectId}`)
    for (const child of suite.suites ?? []) walk(child)
  }
  walk(report)
  return keys.sort()
}

export function planTests(report, settings) {
  for (const key of ['targetTestsPerShard', 'maxShards', 'maxParallel', 'workersPerShard', 'warnBrowserSeconds']) {
    if (!Number.isSafeInteger(settings[key]) || settings[key] < 1) throw new Error(`Invalid CI setting: ${key}`)
  }
  if (settings.maxShards > 8 || settings.maxParallel > 8 || settings.workersPerShard > 4) throw new Error('CI resource limits exceeded')
  const expectedTests = testCount(report)
  if (!expectedTests || report.errors?.length) throw new Error('Test discovery failed or found no tests')
  const shards = Math.min(settings.maxShards, Math.ceil(expectedTests / settings.targetTestsPerShard))
  return { matrix: { shard: Array.from({ length: shards }, (_, i) => i + 1) }, shards, expectedTests, workers: settings.workersPerShard, maxParallel: Math.min(settings.maxParallel, shards), warnBrowserSeconds: settings.warnBrowserSeconds }
}

export function checkReport(report, discovered) {
  const expectedTests = testCount(discovered)
  const count = testCount(report)
  if (count !== expectedTests) throw new Error(`Incomplete browser report: expected ${expectedTests}, got ${count}`)
  const actualKeys = testKeys(report), expectedKeys = testKeys(discovered)
  if (new Set(actualKeys).size !== count || JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) throw new Error('Browser test identities do not match discovery')
  if (report.errors?.length || report.stats?.unexpected || report.stats?.flaky || report.stats?.skipped) throw new Error('Failed, flaky, skipped or incomplete browser tests')
  if (report.stats?.expected !== expectedTests) throw new Error('Not all discovered browser tests passed')
  return count
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, path, value] = process.argv.slice(2)
  const report = JSON.parse(await readFile(path, 'utf8'))
  if (mode === 'plan') {
    const settings = JSON.parse(await readFile('.github/ci-settings.json', 'utf8'))
    const plan = planTests(report, settings)
    await writeFile('ci-plan.json', JSON.stringify(plan, null, 2) + '\n')
    if (process.env.GITHUB_OUTPUT) for (const [key, item] of Object.entries(plan)) await appendFile(process.env.GITHUB_OUTPUT, `${key}=${typeof item === 'object' ? JSON.stringify(item) : item}\n`)
    console.log(JSON.stringify(plan))
  } else if (mode === 'verify') {
    const discovered = JSON.parse(await readFile(value, 'utf8'))
    console.log(`Verified ${checkReport(report, discovered)} browser tests across all shards`)
  } else throw new Error('Usage: node scripts/ci-plan.mjs plan|verify report.json [discovered-tests.json]')
}
