import { expect, test } from 'vitest'
import { checkReport, planTests } from './ci-plan.mjs'

const settings = { targetTestsPerShard: 20, maxShards: 8, maxParallel: 6, workersPerShard: 1, warnBrowserSeconds: 180 }
const report = (count) => ({ suites: [{ suites: [{ specs: Array.from({ length: count }, (_, id) => ({ id: String(id), tests: [{ projectId: 'mobile' }] })) }] }], errors: [], stats: { expected: count, unexpected: 0, flaky: 0, skipped: 0 } })

test('automatically grows bounded shards without dropping test cases', () => {
  expect(planTests(report(105), settings)).toMatchObject({ shards: 6, expectedTests: 105, maxParallel: 6, matrix: { shard: [1, 2, 3, 4, 5, 6] } })
  expect(planTests(report(1), settings).shards).toBe(1)
  expect(planTests(report(140), settings).shards).toBe(7)
  expect(planTests(report(1000), settings)).toMatchObject({ shards: 8, expectedTests: 1000 })
})
test('invalid discovery and resource limits fail closed', () => {
  expect(() => planTests(report(0), settings)).toThrow()
  expect(() => planTests({ ...report(5), errors: ['broken import'] }, settings)).toThrow()
  for (const patch of [{ maxShards: 9 }, { maxParallel: 9 }, { workersPerShard: 5 }, { targetTestsPerShard: 0 }]) expect(() => planTests(report(5), { ...settings, ...patch })).toThrow()
})
test('missing shards, skips, retries masking flakiness and failures cannot pass', () => {
  expect(checkReport(report(105), report(105))).toBe(105)
  expect(() => checkReport(report(100), report(105))).toThrow('Incomplete')
  for (const key of ['unexpected', 'flaky', 'skipped']) {
    const result = report(105); result.stats[key] = 1
    expect(() => checkReport(result, report(105))).toThrow()
  }
  expect(() => checkReport({ ...report(105), errors: ['broken'] }, report(105))).toThrow()
  const incomplete = report(105); incomplete.stats.expected = 104
  expect(() => checkReport(incomplete, report(105))).toThrow()
  const substituted = report(105); substituted.suites[0].suites[0].specs[0].id = 'another-test'
  expect(() => checkReport(substituted, report(105))).toThrow('identities')
  const duplicate = report(105); duplicate.suites[0].suites[0].specs[0].id = '1'
  expect(() => checkReport(duplicate, report(105))).toThrow('identities')
  const merged = report(105)
  for (const spec of merged.suites[0].suites[0].specs) { spec.tests[0].projectName = spec.tests[0].projectId; delete spec.tests[0].projectId }
  expect(checkReport(merged, report(105))).toBe(105)
})
