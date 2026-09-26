import { expect, test, type Page } from '@playwright/test'
import { openScenario, SEED_STORAGE_KEY, uxScenarios } from './ux-scenarios.ts'

// 計測基盤（#42・#67）。GA4 と Clarity は本番の公開 URL でだけ動く。E2E は 127.0.0.1 の自動操作ブラウザなので、
// gtag.js も Clarity も読み込まず、googletagmanager.com / google-analytics.com / clarity.ms へ 1 件も通信しないことを、全端末構成で確かめる。

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
  return errors
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 })
const heading1 = heading

test('計測: 自動操作・127.0.0.1 では GA4・Clarity へ通信せず、画面の移動で JS エラーもない', async ({ page, context, request }) => {
  const errors = watchErrors(page)
  const analytics: string[] = []
  context.on('request', (req) => { if (/googletagmanager\.com|google-analytics\.com|clarity\.ms/.test(req.url())) analytics.push(req.url()) })

  await page.goto('./?utm_source=lp#/gacha')
  await expect(heading(page)).toBeVisible()
  // テストしている成果物（本番の公開にもそのまま使う）に計測が入っている
  const scripts = await page.locator('script[type="module"][src]').evaluateAll((nodes) => nodes.map((node) => (node as HTMLScriptElement).src))
  const bodies = await Promise.all(scripts.map(async (src) => (await request.get(src)).text()))
  expect(bodies.some((body) => body.includes('G-3DDS1NJZXS') && body.includes('yo6yjo7ath'))).toBe(true)

  for (const hash of ['#/collection', '#/room/new', '#/me', '#/']) {
    await page.evaluate((next) => { window.location.hash = next }, hash)
    await expect(heading(page)).toBeVisible()
  }
  expect(await page.evaluate(() => ({ gtag: 'gtag' in window, dataLayer: 'dataLayer' in window, clarity: 'clarity' in window }))).toEqual({ gtag: false, dataLayer: false, clarity: false })
  await expect(page.locator('script[src*="googletagmanager.com"], script[src*="clarity.ms"]')).toHaveCount(0)
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

// Clarity の録画にニックネームを映さない（#67）。ルームのすべての状態見本で、画面に出るニックネームが data-clarity-mask の中にあること。
// ニックネームは状態見本のデータと、名前を決めずに入ったときの見出し（「〇〇」で入ります）から集める。
// ルームの画面は Clarity を止めてから開くので録画されないが、止め方をすり抜けた場合に備えて二重に隠す。
// 隠す印は画面の幅に関係しない HTML の属性なので、状態見本を 5 つの端末構成に分けて 1 回ずつ確かめる（CI は skip を認めないため、
// 構成ごとに分担する。全体 CI の時間をほとんど増やさない）。
const PROJECTS = ['small-mobile', 'android', 'iphone', 'landscape', 'desktop']
const roomScenarios = uxScenarios.filter((item) => item.room)

test('計測: ルームの状態見本のニックネームは録画で隠す（端末構成ごとに分担）', async ({ context }, testInfo) => {
  const index = PROJECTS.indexOf(testInfo.project.name)
  const mine = roomScenarios.filter((_, i) => index < 0 || i % PROJECTS.length === index)
  expect(mine.length).toBeGreaterThan(0)
  const exposed: string[] = []
  for (const scenario of mine) {
    const page = await context.newPage()
    await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('lastpiece_room_force_demo', '1') })
    if (scenario.seed) await page.addInitScript(([key, value]) => { localStorage.setItem(key, value) }, [SEED_STORAGE_KEY, scenario.seed])
    await openScenario(page, scenario, (heading) => expect(heading1(page)).toHaveText(heading))
    const names = new Set([...scenario.room!.demo.matchAll(/"nickname":"([^"]+)"/g)].map((match) => match[1]))
    for (const text of await page.locator('.room-card-title').allTextContents()) {
      const auto = text.match(/^「(.+)」で入ります$/)?.[1]
      if (auto) names.add(auto)
    }
    expect(names.size, `${scenario.name}: ニックネームを集められた`).toBeGreaterThan(0)
    exposed.push(...(await page.evaluate((list) => [...document.querySelectorAll('body *')].flatMap((element) => {
      const own = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? '').join('')
      const hit = list.find((name) => own.includes(name))
      return hit && !element.closest('[data-clarity-mask]') && (element as HTMLElement).checkVisibility() ? [`${element.tagName}.${element.className}: ${own.trim().slice(0, 30)}`] : []
    }), [...names])).map((item) => `${scenario.name} ${item}`))
    await page.close()
  }
  expect(exposed).toEqual([])
})
