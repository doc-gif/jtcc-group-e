import { expect, test } from 'vitest'
import { storageKeyForPath } from './storage'

test('production and historical paths preserve existing storage', () => {
  for (const path of ['', '/', '/jtcc-group-e/', '/jtcc-group-e/versions/v0.1.0/']) {
    expect(storageKeyForPath(path)).toBe('lastpiece_app_v1')
  }
})

test('preview PRs and runs use separate storage keys', () => {
  const a = storageKeyForPath('/jtcc-group-e-preview/pr-5/runs/123/app/')
  expect(a).toBe('lastpiece_preview_pr_5_run_123_v1')
  expect(storageKeyForPath('/jtcc-group-e-preview/pr-6/runs/123/app/')).not.toBe(a)
  expect(storageKeyForPath('/jtcc-group-e-preview/pr-5/runs/124/app/')).not.toBe(a)
  expect(storageKeyForPath('/jtcc-group-e-preview/pr-5/runs/123/application/')).toBe('lastpiece_app_v1')
})
