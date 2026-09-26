import { expect, test } from '@playwright/test'
import { SEED_STORAGE_KEY, uxScenarios } from './ux-scenarios.ts'

/**
 * 主操作色 #be6482（color/action/primary）は白との比が 3.94:1。WCAG の大きい文字（18.66px 以上の太字、または 24px 以上）
 * だけに使い、それより小さいピンクの文字はワイン #a94a68 にする（担当者の判断 2026-09-26、docs/DESIGN.md）。
 */
const primary = 'rgb(190, 100, 130)'

for (const scenario of uxScenarios) {
  test(`${scenario.name}: 主操作色の文字は大きい文字だけ`, async ({ page }) => {
    if (scenario.pauseTimers) { await page.clock.install({ time: 0 }); await page.clock.pauseAt(1000) }
    if (scenario.seed) await page.addInitScript(([key, value]) => { localStorage.setItem(key, value) }, [SEED_STORAGE_KEY, scenario.seed])
    await page.goto(scenario.path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const small = await page.evaluate((color) => [...document.querySelectorAll('body *')].flatMap((element) => {
      const style = getComputedStyle(element)
      const ownText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== '')
      if (!ownText || style.color !== color || !(element as HTMLElement).checkVisibility()) return []
      const size = parseFloat(style.fontSize)
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
      return large ? [] : [`${element.className || element.tagName}: ${element.textContent!.trim().slice(0, 20)} ${size}px/${style.fontWeight}`]
    }), primary)
    expect(small).toEqual([])
  })
}

test('ボタンと選択中のタブはマスターの色と文字の大きさ', async ({ page }) => {
  await page.goto('./#/')
  const main = page.getByRole('link', { name: 'ガチャのお店へ' })
  await expect(main).toHaveCSS('background-color', primary)
  await expect(main).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(main).toHaveCSS('font-size', '19px')
  await expect(main).toHaveCSS('font-weight', '700')
  const current = page.getByRole('navigation', { name: 'メイン' }).getByRole('link', { name: '街' })
  await expect(current).toHaveAttribute('aria-current', 'page')
  await expect(current).toHaveCSS('background-color', 'rgb(227, 241, 231)')
  await expect(current).toHaveCSS('color', 'rgb(169, 74, 104)')
})

test('文字200%でもコイン札の数字が札からはみ出さない', async ({ page }) => {
  await page.goto('./#/')
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  const pill = page.locator('.town-header .coin-pill')
  await expect(pill).toContainText('3,000')
  expect(await pill.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  const width = page.viewportSize()!.width
  for (const box of [await pill.boundingBox(), await page.locator('.town-header .icon-link').boundingBox()]) expect(box!.x + box!.width).toBeLessThanOrEqual(width)
})
