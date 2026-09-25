import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const path of ['./', './versions/v0.0.0/']) {
  test(`公開パス ${path} が壊れず表示される`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('listitem')).toHaveCount(3)
    await expect(page).toHaveTitle('JTCC Group E')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(accessibility.violations).toEqual([])
    expect(errors).toEqual([])
  })
}

test('履歴一覧から保存された版を開き、再読み込みできる', async ({ page }) => {
  await page.goto('./versions/')
  await page.getByRole('link', { name: 'v0.0.0', exact: true }).click()
  await expect(page).toHaveURL(/\/versions\/v0\.0\.0\/$/)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
