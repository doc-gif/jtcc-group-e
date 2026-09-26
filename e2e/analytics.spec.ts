import { expect, test, type Page } from '@playwright/test'

// 計測基盤（#42）。GA4 は本番の公開 URL でだけ送る。E2E は 127.0.0.1 の自動操作ブラウザなので、
// gtag.js を読み込まず googletagmanager.com / google-analytics.com へ 1 件も通信しないことを、全端末構成で確かめる。

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
  return errors
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 })

test('計測: 自動操作・127.0.0.1 では GA4 へ通信せず、画面の移動で JS エラーもない', async ({ page, context, request }) => {
  const errors = watchErrors(page)
  const analytics: string[] = []
  context.on('request', (req) => { if (/googletagmanager\.com|google-analytics\.com/.test(req.url())) analytics.push(req.url()) })

  await page.goto('./?utm_source=lp#/gacha')
  await expect(heading(page)).toBeVisible()
  // テストしている成果物（本番の公開にもそのまま使う）に計測が入っている
  const scripts = await page.locator('script[type="module"][src]').evaluateAll((nodes) => nodes.map((node) => (node as HTMLScriptElement).src))
  const bodies = await Promise.all(scripts.map(async (src) => (await request.get(src)).text()))
  expect(bodies.some((body) => body.includes('G-3DDS1NJZXS'))).toBe(true)

  for (const hash of ['#/collection', '#/room/new', '#/me', '#/']) {
    await page.evaluate((next) => { window.location.hash = next }, hash)
    await expect(heading(page)).toBeVisible()
  }
  expect(await page.evaluate(() => ({ gtag: 'gtag' in window, dataLayer: 'dataLayer' in window }))).toEqual({ gtag: false, dataLayer: false })
  await expect(page.locator('script[src*="googletagmanager.com"]')).toHaveCount(0)
  expect(analytics).toEqual([])
  expect(errors).toEqual([])
})

test('計測: ?internal=1 で内部フラグを保存し、?internal=0 で消す（LP と同じ lp_internal）', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./?internal=1#/')
  await expect(heading(page)).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('lp_internal'))).toBe('1')
  await page.goto('./?internal=0#/')
  await expect(heading(page)).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('lp_internal'))).toBeNull()
  expect(errors).toEqual([])
})
