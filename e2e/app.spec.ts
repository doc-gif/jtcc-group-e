import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'

test('プレビューは表示できて本番・別ビルドの保存データと混ざらない', async ({ page }, testInfo) => {
  const errors = watchErrors(page)
  await page.goto('./#/me')
  await page.getByLabel(/ルームで友達に見える名前/).fill('本番の名前')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lastpiece_app_v1')!).nickname)).toBe('本番の名前')
  await page.goto('/jtcc-group-e-preview/pr-5/runs/101/')
  await expect(page.getByText('確認用・本番ではありません', { exact: true })).toBeVisible()
  await expect(page.frameLocator('iframe').getByRole('heading', { level: 1 })).toHaveText(/ラストピース|あなたの街へ/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  await testInfo.attach('preview', { body: await page.screenshot(), contentType: 'image/png' })
  const link = page.getByRole('link', { name: '別画面で開く' })
  const normal = await link.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  await page.addStyleTag({ content: 'html {font-size:200%}' })
  expect(await link.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(normal * 1.9)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await testInfo.attach('preview-large', { body: await page.screenshot(), contentType: 'image/png' })
  await page.goto('/jtcc-group-e-preview/pr-5/runs/101/app/#/me')
  await expect(page.getByLabel(/ルームで友達に見える名前/)).not.toHaveValue('本番の名前')
  await page.getByLabel(/ルームで友達に見える名前/).fill('確認中の名前')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lastpiece_preview_pr_5_run_101_v1')!).nickname)).toBe('確認中の名前')
  await page.reload()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lastpiece_preview_pr_5_run_101_v1')!).nickname)).toBe('確認中の名前')
  await page.goto('/jtcc-group-e-preview/pr-5/runs/102/app/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/ラストピース|あなたの街へ/)
  const names = await page.evaluate(() => ['lastpiece_app_v1', 'lastpiece_preview_pr_5_run_101_v1', 'lastpiece_preview_pr_5_run_102_v1'].map((key) => JSON.parse(localStorage.getItem(key)!).nickname))
  expect(names[0]).toBe('本番の名前')
  expect(names[1]).toBe('確認中の名前')
  expect(names[2]).not.toBe('本番の名前')
  expect(names[2]).not.toBe('確認中の名前')
  expect(errors).toEqual([])
})

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

/** 回す前の確認で確定する（ここで初めてコインを使う） */
async function confirmSpin(page: Page) {
  await page.getByRole('button', { name: /コイン使って1回引く/ }).click()
}

/** カプセルは揺れる演出があるため、必要なタップ数（ラベルの「あとN回」）だけ押す */
async function openCapsule(page: Page) {
  const capsule = page.getByRole('button', { name: /カプセルをタップ/ })
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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/あなたの街へ/)
    await page.getByRole('button', { name: 'スキップ' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/ラストピース/)
    await expect(page).toHaveTitle('ラストピース')
    await expect(page.getByText('提案モック・公式サービスではありません', { exact: false }).first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(accessibility.violations).toEqual([])
    await page.getByRole('navigation', { name: 'メイン' }).getByRole('link', { name: 'ガチャ' }).click()
    await expect(page.getByRole('article')).toHaveCount(3)
    expect(errors).toEqual([])
  })
}

test('街：導入は3秒で街に着き、地図をドラッグして場所へ行ける。下のタブで行き来できる', async ({ page }, testInfo) => {
  const errors = watchErrors(page)
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.goto('./')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toHaveText('好きが集まる、あなたの街へ。')
  // 導入の地図は飾り。場所の名前を読み上げや焦点の対象にしない
  const openingTree = await page.locator('body').ariaSnapshot()
  expect(openingTree).not.toContain('当てたもの')
  expect(openingTree).not.toContain('フレンド')
  await page.clock.runFor(1200)
  await expect(heading).toHaveText('いっしょに、わくわくを開けよう。')
  await page.clock.runFor(1800)
  await expect(heading).toHaveText('ラストピース')
  await expect(page).toHaveURL(/#\/$/)
  await page.reload()
  await expect(heading).toHaveText('ラストピース')

  const map = page.getByRole('region', { name: /街の地図/ })
  const shop = map.getByRole('link', { name: 'ガチャのお店' })
  await expect(shop).toBeInViewport()
  await expect(map.getByRole('link', { name: 'コレクション' })).toBeInViewport()
  await expect(map.getByRole('link', { name: 'フレンド' })).toBeInViewport()
  // 横向きなど低い画面でも、最初から3つの場所が下のタブに隠れていない
  for (const name of ['ガチャのお店', 'コレクション', 'フレンド']) {
    const hit = await map.getByRole('link', { name }).evaluate((el) => {
      const r = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
    })
    expect(hit, `${name} が見えて押せる`).toBe(true)
  }
  const before = await map.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }))
  const box = (await map.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.85)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height * 0.85 - 50, { steps: 6 })
  await page.mouse.up()
  const after = await map.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }))
  expect(after.x).toBeGreaterThan(before.x + 40)
  expect(after.y).toBeGreaterThan(before.y + 30)
  if (!testInfo.project.use.isMobile) {
    await map.focus()
    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => map.evaluate((el) => el.scrollLeft)).toBeLessThan(after.x)
  }
  await shop.click()
  await expect(heading).toHaveText(/ガチャのお店/)

  const nav = page.getByRole('navigation', { name: 'メイン' })
  for (const [name, title] of [['コレクション', /当てたもの/], ['フレンド', /いっしょに回す/], ['街', /ラストピース/]] as const) {
    await nav.getByRole('link', { name }).click()
    await expect(heading).toHaveText(title)
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
  }
  await page.getByRole('link', { name: /注目のピース/ }).click()
  await expect(heading).toHaveText('ガチャ詳細')
  expect(errors).toEqual([])
})

test('街：動きを減らす設定では導入を1枚にし、自動では進めない', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.goto('./')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toHaveText('ようこそ、ラストピースへ。')
  // 地図の寄り（town-arrive）や文の動きを再生しない
  expect(await page.evaluate(() => document.getAnimations().map((animation) => (animation as CSSAnimation).animationName).filter((name) => name === 'town-arrive' || name === 'opening-fade'))).toEqual([])
  await page.clock.runFor(5000)
  await expect(heading).toHaveText('ようこそ、ラストピースへ。')
  await page.getByRole('button', { name: '街へ', exact: true }).click()
  await expect(heading).toHaveText('ラストピース')
})

test('履歴一覧から保存された版を開き、再読み込みできる', async ({ page }) => {
  await page.goto('./versions/')
  await page.getByRole('link', { name: 'v0.0.0', exact: true }).click()
  await expect(page).toHaveURL(/\/versions\/v0\.0\.0\/$/)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('ひとりで回す：詳細 → 3回転 → 開封 → 当てたもの → コインに交換（一律20%）', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./#/gacha')
  await page.getByRole('link', { name: /マイメロディ 周年限定ガチャの中身/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ガチャ詳細')
  await expect(page.getByText('✦ 目玉')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/残り\s*\d+\s*\/\s*\d+/)
  await page.getByRole('link', { name: /1回引く準備へ/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('回す前に')
  await confirmSpin(page)
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
  await confirmSpin(page)
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
  await expect(page.getByRole('button', { name: /カプセルをタップ/ })).toBeVisible()
})

/** 演出の途中の状態も、WCAG AA・44px・横はみ出しなしを確かめて画像を残す */
async function checkState(page: Page, name: string, testInfo: TestInfo) {
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations, name).toEqual([])
  // 演出で要素が入れ替わっても測れるよう、表示中の操作の大きさを1回でまとめて測る
  const small = await page.evaluate(() => [...document.querySelectorAll('button, a[href]')]
    .map((element) => ({ text: element.textContent?.trim() ?? '', rect: element.getBoundingClientRect(), shown: element.checkVisibility() }))
    .filter(({ rect, shown }) => shown && rect.width > 0 && (rect.width < 44 || rect.height < 44))
    .map(({ text }) => text))
  expect(small, `${name}: 44px`).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), name).toBe(true)
  await testInfo.attach(`${name}-${testInfo.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`ガチャの流れ（T08・動き ${reducedMotion}）：確率 → 確認 → 3回転 → 3段階の開封 → 結果`, async ({ page }, testInfo) => {
    const errors = watchErrors(page)
    // 5つの状態で axe と画像を取るため、通常の3倍の時間を許す
    test.slow()
    await page.emulateMedia({ reducedMotion })
    await page.goto('./#/me')
    await page.getByRole('button', { name: /次の1回を目玉確定にする/ }).click()
    await page.goto('./#/gacha/sanrio-capsule')
    await page.getByRole('link', { name: '中身9種と確率を見る' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('中身と確率')
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(10)
    await page.getByRole('link', { name: '500コインで1回引く準備へ' }).click()
    await expect(page.getByText(/所持 3,000/)).toContainText('確定後 2,500')
    await confirmSpin(page)
    await expect(page.getByText('回転 0 / 3')).toBeVisible()
    await tapTurns(page, 1)
    await expect(page.getByText('回転 1 / 3')).toBeVisible()
    await checkState(page, 't08-turn-1', testInfo)
    await tapTurns(page, 2)
    const open = page.getByRole('dialog', { name: 'カプセルをひらく' })
    for (const step of [1, 2, 3]) {
      await expect(open.getByText(`開封 ${step} / 3`)).toBeVisible()
      await checkState(page, `t08-open-${step}`, testInfo)
      await open.getByRole('button', { name: /カプセルをタップ/ }).click()
    }
    const result = page.getByRole('dialog', { name: 'ぬいぐるみマスコット' })
    await expect(result.getByText('今回の結果')).toBeVisible()
    await expect(result.getByText('500コイン使用・残高 2,500・1点を獲得')).toBeVisible()
    await checkState(page, 't08-result', testInfo)
    // 回帰：文字200%で結果が画面より高くなっても、先頭（今回の結果）までスクロールで戻れる
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    const top = await page.evaluate(() => {
      const scene = document.querySelector('.open-scene')!
      scene.scrollTop = 0
      return document.querySelector('.result-kicker')!.getBoundingClientRect().top - scene.getBoundingClientRect().top
    })
    expect(top).toBeGreaterThanOrEqual(0)
    await testInfo.attach(`t08-result-large-text-${testInfo.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })
    await page.addStyleTag({ content: 'html { font-size: 100% !important; }' })
    await result.getByRole('link', { name: '街へ戻る' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ラストピース')
    expect(errors).toEqual([])
  })
}

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
  await confirmSpin(page)
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
