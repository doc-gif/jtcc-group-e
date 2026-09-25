import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
  return errors
}

async function tapTurns(page: Page, count: number) {
  const turn = page.getByRole('button', { name: /1タップで1回転/ })
  for (let i = 0; i < count; i += 1) await turn.click()
}

/** カプセルは揺れる演出があるため、必要なタップ数（ラベルの「あとN回」）だけ押す */
async function openCapsule(page: Page) {
  const capsule = page.getByRole('button', { name: /カプセルをあける/ })
  await expect(capsule).toBeVisible()
  const label = (await capsule.getAttribute('aria-label')) ?? ''
  const need = Number(/あと(\d+)回/.exec(label)?.[1] ?? '1')
  for (let i = 0; i < need; i += 1) await capsule.click({ force: true })
  await expect(capsule).toBeHidden()
}

for (const path of ['./', './versions/v0.0.0/']) {
  test(`公開パス ${path} が壊れず表示される`, async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/ラストピース/)
    await expect(page.getByRole('article')).toHaveCount(3)
    await expect(page).toHaveTitle('ラストピース')
    await expect(page.getByText('提案モック・公式サービスではありません', { exact: false })).toBeVisible()
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

test('ひとりで回す：詳細 → 3回転 → 開封 → 当てたもの → コインに交換（一律20%）', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./')
  await page.getByRole('link', { name: /マイメロディ 周年限定ガチャの中身/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ガチャ詳細')
  await expect(page.getByText('✦ 目玉')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/残り\s*\d+\s*\/\s*\d+/)
  await page.getByRole('link', { name: /ひとりで回す/ }).click()
  await tapTurns(page, 3)
  await openCapsule(page)
  await expect(page.getByText('使ったコイン')).toBeVisible()
  await page.getByRole('link', { name: '当てたものを見る' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/当てたもの/)
  await expect(page.getByRole('link', { name: /コイン残高 1,500/ })).toBeVisible()
  await page.getByRole('checkbox').first().check()
  await page.getByRole('button', { name: 'コインに交換', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'コインに交換しますか？' })
  await expect(sheet.getByText('出金はできません')).toBeVisible()
  await expect(sheet.getByText(/× 20%/)).toBeVisible()
  await sheet.getByRole('button', { name: 'コインに交換する' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'コインに交換しました' })).toBeVisible()
  await page.reload()
  await expect(page.getByText('コインに交換済み', { exact: false })).toBeVisible()
  expect(errors).toEqual([])
})

test('ハンドルを指でなぞって回せる', async ({ page }) => {
  await page.goto('./#/gacha/sanrio-capsule/spin')
  const machine = page.getByRole('img', { name: /ガチャガチャ/ })
  await machine.scrollIntoViewIfNeeded()
  const box = (await machine.boundingBox())!
  const cx = box.x + (130 / 260) * box.width
  const cy = box.y + (284 / 370) * box.height
  const r = (30 / 260) * box.width
  await page.mouse.move(cx + r, cy)
  await page.mouse.down()
  for (let step = 1; step <= 3 * 24 + 2; step += 1) {
    const angle = (step / 24) * Math.PI * 2
    await page.mouse.move(cx + r * Math.cos(angle), cy + r * Math.sin(angle))
  }
  await page.mouse.up()
  await expect(page.getByRole('button', { name: /カプセルをあける/ })).toBeVisible()
})

test('友達と回す（デモ）：ルーム → 待ち合わせ → 目玉確定 → みんなの結果', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./#/me')
  await page.getByRole('button', { name: /次の1回を目玉確定にする/ }).click()
  await page.goto('./#/gacha/melody-anniv')
  await page.getByRole('link', { name: /友達と回す/ }).click()
  const sheet = page.getByRole('dialog', { name: '友達と いっしょに回そう' })
  await expect(sheet.getByText('ゆい（デモ）')).toBeVisible()
  const start = sheet.getByRole('button', { name: /みんなで回す/ })
  await expect(start).toBeEnabled({ timeout: 6000 })
  await start.click()
  await expect(page.getByText(/ROOM・3人でいっしょに/)).toBeVisible()
  await tapTurns(page, 2)
  await expect(page.getByText('目玉 確定')).toBeVisible()
  await tapTurns(page, 1)
  await openCapsule(page)
  await expect(page.getByText('おめでとうございます！').first()).toBeVisible()
  await page.getByRole('button', { name: 'みんなの結果を見る' }).click()
  const board = page.getByRole('dialog', { name: /みんなの結果/ })
  await expect(board.getByText(/みんなで（3人）/)).toBeVisible({ timeout: 6000 })
  expect(errors).toEqual([])
})

test('招待リンクを開いた人は名前を入れて参加できる', async ({ page }) => {
  await page.goto('./#/room/chiikawa-birthday')
  await page.getByRole('button', { name: 'ルームに入る' }).click()
  await expect(page.getByText('ニックネームを入れてください')).toBeVisible()
  await page.getByLabel(/ニックネーム/).fill('みお')
  await page.getByRole('button', { name: 'ルームに入る' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('みんなを待っています')
  await expect(page.getByText('みお（あなた）')).toBeVisible()
})
