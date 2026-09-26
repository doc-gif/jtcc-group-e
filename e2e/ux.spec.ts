import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { SEED_STORAGE_KEY, uxScenarios } from './ux-scenarios.ts'

/**
 * 時計を止めた画面では、axe が使うタイマーだけを 1ms ずつ進めて検査する（導入は 3 秒まで進まない）。
 * axe は結果の集計に一時的なページを開いて閉じるため、その間の runFor の失敗は無視する。
 */
async function axeViolations(page: Page, paused: boolean) {
  let done = false
  const result = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze().finally(() => { done = true })
  while (paused && !done) await page.clock.runFor(1).catch(() => undefined)
  return (await result).violations
}

for (const scenario of uxScenarios) {
  test(`${scenario.name}: HIG を Web に適用した UI/UX 基準`, async ({ page }, testInfo) => {
    if (scenario.pauseTimers) { await page.clock.install({ time: 0 }); await page.clock.pauseAt(1000) }
    // 止めた読み込みは最後まで返さない（検査のあいだ読み込み中のまま）
    if (scenario.goods) await page.route('**/assets/goods/**', (route) => (scenario.goods === 'fail' ? route.abort() : new Promise<void>(() => {})))
    if (scenario.seed) await page.addInitScript(([key, value]) => { localStorage.setItem(key, value) }, [SEED_STORAGE_KEY, scenario.seed])
    await page.goto(scenario.path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await axeViolations(page, Boolean(scenario.pauseTimers))).toEqual([])
    const controls = page.locator('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"]')
    for (const control of await controls.all()) {
      if (!(await control.isVisible())) continue
      const box = await control.boundingBox()
      expect(box?.width, 'HIG-02: touch target width').toBeGreaterThanOrEqual(44)
      expect(box?.height, 'HIG-02: touch target height').toBeGreaterThanOrEqual(44)
    }
    const viewport = page.viewportSize()!
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
    await testInfo.attach(`${scenario.name}-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    const originalFont = await page.locator(scenario.scalableText).evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    const largeFont = await page.locator(scenario.scalableText).evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
    expect(largeFont, 'HIG-03: meaningful text really scales').toBeGreaterThanOrEqual(originalFont * 1.9)
    expect(await page.evaluate(() => document.documentElement.scrollWidth), 'HIG-03: no horizontal scroll at 200% text').toBeLessThanOrEqual(viewport.width)
    await testInfo.attach(`${scenario.name}-large-text-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    const moving = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running' && Number(animation.effect?.getTiming().duration) > 100).length)
    expect(moving, 'HIG-05: no continuous motion in reduced-motion mode').toBe(0)
    expect(await page.locator('audio[autoplay], video[autoplay]:not([muted])').count()).toBe(0)
    if (scenario.name === 'version-history') {
      const latestLink = page.getByRole('link', { name: '最新版を開く' })
      if (testInfo.project.use.isMobile) {
        // Mobile Safari does not enable full keyboard navigation by default.
        await latestLink.tap()
      } else {
        await page.keyboard.press('Tab')
        await expect(latestLink).toBeFocused()
        await page.keyboard.press('Enter')
      }
      await expect(page).toHaveTitle('ラストピース')
    }
  })
}
