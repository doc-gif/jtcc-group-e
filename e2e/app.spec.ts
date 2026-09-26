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
  await page.getByRole('button', { name: /使って1回引く/ }).click()
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
  for (const [name, title] of [['コレクション', /わたしの棚/], ['フレンド', /フレンド/], ['街', /ラストピース/]] as const) {
    await nav.getByRole('link', { name }).click()
    await expect(heading).toHaveText(title)
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
  }
  await page.getByRole('link', { name: /注目のピース/ }).click()
  await expect(heading).toHaveText('ガチャ詳細')
  expect(errors).toEqual([])
})

test('回帰：ガチャ詳細を開いたあとも、街の注目カードは街の見た目のまま', async ({ page }) => {
  await page.goto('./#/gacha/sanrio-capsule')
  await expect(page.getByText('目玉の候補')).toBeVisible()
  await page.getByRole('navigation', { name: 'メイン' }).getByRole('link', { name: '街' }).click()
  const card = page.locator('.feature-card')
  await expect(card).toBeVisible()
  const styles = await card.evaluate((element) => {
    const read = (selector: string) => getComputedStyle(element.querySelector(selector)!)
    return { kicker: read('.feature-kicker').fontSize, name: read('.feature-name').color, radius: getComputedStyle(element).borderTopLeftRadius }
  })
  // 街（App.css）の値：見出し 17px・商品名はワイン・角丸 20px（ガチャ詳細の値で上書きされない）
  expect(styles.kicker).toBe('17px')
  expect(styles.name).toBe('rgb(74, 42, 54)')
  expect(styles.radius).toBe('20px')
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

test('街の読み込み中（T07 Loading）：絵が遅いときだけ出て、準備できたら自動で街へ進む', async ({ page }) => {
  const errors = watchErrors(page)
  let release = () => {}
  const held = new Promise<void>((resolve) => { release = resolve })
  // 注目のピースの絵の読み込みを止めて、遅い通信を再現する
  await page.route('**/assets/goods/**', async (route) => { await held; await route.continue() })
  await page.goto('./#/')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toHaveText('街の準備をしています')
  await expect(heading).toBeFocused()
  await expect(page.getByRole('status')).toContainText('先に街を見て回れます。')
  await expect(page.getByRole('button', { name: '街を見る' })).toBeVisible()
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  release()
  await expect(heading).toHaveText('ラストピース')
  await expect(page.locator('.feature-card img')).toHaveJSProperty('complete', true)
  expect(errors).toEqual([])

  // 準備済みなら、街へもどっても読み込み中は出ない
  await page.getByRole('navigation', { name: 'メイン' }).getByRole('link', { name: 'ガチャ' }).click()
  await page.getByRole('navigation', { name: 'メイン' }).getByRole('link', { name: '街' }).click()
  await expect(heading).toHaveText('ラストピース')
})

test('街の読み込み中：読み込めなかったら伝えて、もう一度読み込める。先に街も見られる', async ({ page }) => {
  let fail = true
  await page.route('**/assets/goods/**', (route) => (fail ? route.abort() : route.continue()))
  await page.goto('./#/')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toHaveText('街の準備ができませんでした')
  await expect(page.getByRole('status')).toContainText('もう一度読み込んでください')
  fail = false
  await page.getByRole('button', { name: 'もう一度読み込む' }).click()
  await expect(heading).toHaveText('ラストピース')

  fail = true
  await page.goto('./versions/v0.0.0/#/')
  await expect(heading).toHaveText('街の準備ができませんでした')
  await page.getByRole('button', { name: '街を見る' }).click()
  await expect(heading).toHaveText('ラストピース')
  await expect(page.getByRole('link', { name: 'ガチャのお店へ' })).toBeVisible()
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
  await expect(page.getByText('目玉の候補')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/残り\s*\d+\s*\/\s*\d+/)
  await page.getByRole('link', { name: /1回引く準備へ/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('回す前に')
  await confirmSpin(page)
  await tapTurns(page, 3)
  await openCapsule(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('今回の結果')
  await expect(page.getByText('1,500使用・残高1,500・1点を獲得')).toBeVisible()
  // 結果の操作はマスターどおり「街へ戻る」だけ。当てたものは下のタブ「コレクション」→「一覧」から
  await page.getByRole('link', { name: '街へ戻る' }).click()
  await page.getByRole('navigation', { name: 'メイン' }).getByRole('link', { name: 'コレクション' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('わたしの棚')
  await expect(page.getByText('1 / 12 枠')).toBeVisible()
  await page.getByRole('link', { name: /当てたもの\s*一覧/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/当てたもの/)
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

test('右のハンドルをタップして回せる（マスター 267:8348）。押せる範囲は44px以上', async ({ page }) => {
  await page.goto('./#/gacha/sanrio-capsule/spin')
  await confirmSpin(page)
  const handle = page.locator('.m-handle-hit')
  await handle.scrollIntoViewIfNeeded()
  const box = (await handle.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
  for (const turn of [1, 2, 3]) {
    await handle.click()
    if (turn < 3) await expect(page.getByText(`回転 ${turn} / 3`)).toBeVisible()
  }
  await expect(page.getByRole('button', { name: /カプセルをタップ/ })).toBeVisible()
})

/** 演出の途中の状態も、WCAG AA・44px・横はみ出しなしを確かめて画像を残す */
async function checkState(page: Page, name: string, testInfo: TestInfo) {
  // 登場の演出（結果カードの拡大など）が終わった最終の大きさで測る。くり返す飾りの演出は待たない
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => Number.isFinite(Number(animation.effect?.getTiming().iterations ?? 1)))
    .map((animation) => animation.finished.catch(() => undefined))))
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
    await checkState(page, 't08-confirm', testInfo)
    await confirmSpin(page)
    const heading = page.getByRole('heading', { level: 1 })
    await expect(page.getByText('回転 0 / 3')).toBeVisible()
    // マスターどおり、回転・開封の途中は戻る・下のタブを出さない
    await expect(page.getByRole('link', { name: '戻る' })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'メイン' })).toHaveCount(0)
    await tapTurns(page, 1)
    await expect(page.getByText('回転 1 / 3')).toBeVisible()
    await checkState(page, 't08-turn-1', testInfo)
    await tapTurns(page, 2)
    await expect(heading).toHaveText('カプセルをひらく')
    for (const step of [1, 2, 3]) {
      await expect(page.getByText(`開封 ${step} / 3`)).toBeVisible()
      await expect(page.getByRole('link', { name: '戻る' })).toHaveCount(0)
      await checkState(page, `t08-open-${step}`, testInfo)
      await page.getByRole('button', { name: /カプセルをタップ/ }).click()
    }
    await expect(heading).toHaveText('今回の結果')
    const result = page.getByRole('article', { name: 'ぬいぐるみマスコット' })
    await expect(result.getByText('500使用・残高2,500・1点を獲得')).toBeVisible()
    await checkState(page, 't08-result', testInfo)
    // 回帰：文字200%で結果が画面より高くなっても、先頭（今回の結果）までスクロールで戻れる
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    const top = await page.evaluate(() => {
      window.scrollTo(0, 0)
      return document.getElementById('page-title')!.getBoundingClientRect().top
    })
    expect(top).toBeGreaterThanOrEqual(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await testInfo.attach(`t08-result-large-text-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    await page.addStyleTag({ content: 'html { font-size: 100% !important; }' })
    await page.getByRole('link', { name: '街へ戻る' }).click()
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

test('棚とフレンド：飾る → お気に入りと取り消し → 見え方の確認 → 友だち（デモ）の棚に「いいな〜」は1回だけ', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./#/shelf')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toHaveText(/わたしの棚/)
  await expect(page.getByText('0 / 9 枠')).toBeVisible()
  // 2点を当て、1回はゆい・さき（デモ）と回した記録を入れる
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('lastpiece_app_v1')!)
    const win = (id: string, prizeId: string, companions: string[]) => ({ id, gachaId: 'sanrio-capsule', prizeId, spent: 500, wonAt: '2026-09-20T00:00:00.000Z', companions, status: 'kept' })
    localStorage.setItem('lastpiece_app_v1', JSON.stringify({ ...state, wins: [win('w2', 'sanrio-capsule-2', ['ゆい', 'さき']), win('w1', 'sanrio-capsule-1', [])], nextWinSeq: 3 }))
  })
  await page.reload()
  await expect(page.getByText('2 / 9 枠')).toBeVisible()
  const board = page.getByRole('list', { name: 'わたしの棚' })
  await expect(board.getByText('持っている')).toHaveCount(2)
  await expect(board.getByText('未入手')).toHaveCount(7)
  // マスターどおり棚の中だけをスクロールし、最後の枠（09 缶バッジ）まで見られる
  const shelf = page.getByRole('region', { name: /わたしの棚/ })
  const lastInside = await shelf.evaluate((el) => {
    el.scrollTop = el.scrollHeight
    const box = el.getBoundingClientRect()
    const last = [...el.querySelectorAll('.slot-note')].at(-1)!
    const rect = last.getBoundingClientRect()
    return { text: last.textContent, inside: rect.top >= box.top && rect.bottom <= box.bottom }
  })
  expect(lastInside).toEqual({ text: '缶バッジ', inside: true })
  await board.getByRole('link', { name: /02 \/ 09/ }).click()
  await expect(heading).toHaveText('わたしの1点')
  await page.getByRole('button', { name: 'お気に入りにする' }).click()
  await expect(page.getByRole('status')).toHaveText(/お気に入りにしました/)
  await expect(heading).toHaveText('お気に入りの1点')
  await page.reload()
  // 枠は中身の種類ごとに決まっているので、お気に入りにしても 02 のまま
  await expect(page.getByText('♡ お気に入り・棚 02 / 09')).toBeVisible()
  await page.getByRole('button', { name: 'お気に入りをやめる' }).click()
  await expect(page.getByText('あなたの持ち物・棚 02 / 09')).toBeVisible()
  await page.getByRole('link', { name: '戻る' }).click()
  await page.getByRole('link', { name: '友だちからの見え方を見る' }).click()
  await expect(heading).toHaveText('友だちからの見え方')
  await expect(page.getByText('共有はまだ実行していません。')).toBeVisible()
  await page.getByRole('link', { name: '友だち一覧へ' }).click()
  await expect(heading).toHaveText(/フレンド/)
  await page.getByRole('link', { name: 'さきさんの棚の状態を見る' }).click()
  await expect(heading).toHaveText('今は見られません')
  await page.getByRole('link', { name: '友だち一覧へ' }).click()
  await page.getByRole('link', { name: 'ゆいさんの棚を見に行く' }).click()
  await expect(page.getByText('友だちの持ち物・あなたの棚ではありません')).toBeVisible()
  await page.getByRole('link', { name: 'ゆいさんの1点を見る' }).click()
  await page.getByRole('button', { name: 'いいな〜を送る' }).click()
  await expect(page.getByRole('status')).toHaveText(/いいな〜を送った・デモ/)
  await page.reload()
  await expect(page.getByRole('button', { name: 'いいな〜を送る' })).toHaveCount(0)
  await expect(page.getByText('同じ反応を続けて送ることはできません')).toBeVisible()
  expect(errors).toEqual([])
})
