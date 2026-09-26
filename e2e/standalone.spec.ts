import { expect, test } from '@playwright/test'

// F16: ホーム画面から全画面（standalone）で開けることと、画面全体のジェスチャー（ピンチ・引っぱって再読み込み・長押し）の抑制。
// 実際のピンチ・端スワイプはヘッドレスのブラウザで再現できない（抑制なしでも合成したピンチで拡大しない）ため、
// ここでは計算された CSS と iOS のジェスチャーイベントの抑制を確かめ、実機の確認は docs/MULTI_DEVICE.md の手順で行う。
// 「ホーム画面に追加」の案内（#57、マスター 448:14192・448:14267）は、タブで開いたときだけ街ホームに出し、閉じたら出さない。

type Manifest = { display: string, start_url: string, scope: string, theme_color: string, background_color: string, icons: { src: string, sizes: string, type: string, purpose?: string }[] }

for (const path of ['./', './versions/v0.0.0/', '/jtcc-group-e-preview/pr-5/runs/101/app/']) {
  test(`${path} の manifest は standalone で、start_url・scope・アイコンがその版の場所を指す`, async ({ page, request }) => {
    await page.goto(path)
    const pageUrl = new URL(page.url())
    const base = new URL('./', pageUrl).href
    const href = await page.locator('link[rel="manifest"]').evaluate((el) => (el as HTMLLinkElement).href)
    expect(href).toBe(new URL('manifest.json', base).href)
    const response = await request.get(href)
    expect(response.ok()).toBe(true)
    const manifest = await response.json() as Manifest
    expect(manifest.display).toBe('standalone')
    expect(new URL(manifest.start_url, href).href).toBe(base)
    expect(new URL(manifest.scope, href).href).toBe(base)
    // マスターの色（F14 の街の地のクリーム sanrio/cream）。index.html の theme-color と同じ
    expect(manifest.theme_color).toBe('#FFF6E0')
    expect(manifest.background_color).toBe('#FFF6E0')
    expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe(manifest.theme_color)
    expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose ?? 'any'}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable'])
    for (const icon of manifest.icons) {
      const image = await request.get(new URL(icon.src, href).href)
      expect(image.ok(), icon.src).toBe(true)
      expect(image.headers()['content-type']).toBe('image/png')
    }
    const touchIcon = await page.locator('link[rel="apple-touch-icon"]').evaluate((el) => (el as HTMLLinkElement).href)
    expect(touchIcon.startsWith(base)).toBe(true)
    expect((await request.get(touchIcon)).ok()).toBe(true)
  })
}

test('index.html は全画面のメタを持ち、拡大を奪う viewport の指定を使わない', async ({ page }) => {
  await page.goto('./')
  const meta = (name: string) => page.locator(`meta[name="${name}"]`).getAttribute('content')
  expect(await meta('apple-mobile-web-app-capable')).toBe('yes')
  expect(await meta('mobile-web-app-capable')).toBe('yes')
  expect(await meta('apple-mobile-web-app-status-bar-style')).toBe('default')
  const viewport = (await meta('viewport')) ?? ''
  expect(viewport).toContain('viewport-fit=cover')
  expect(viewport).not.toMatch(/maximum-scale|user-scalable/)
})

test('画面全体はピンチ・引っぱって再読み込み・長押しのメニューを出さず、入力欄の文字は選べる', async ({ page }) => {
  await page.goto('./#/me')
  const style = (selector: string, property: string) => page.locator(selector).first().evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property)
  expect(await style('html', 'touch-action')).toBe('pan-x pan-y')
  // Playwright の WebKit（Windows・Linux）は overscroll-behavior を持たない。iOS Safari 16 以降と Chromium は持つ
  if (await page.evaluate(() => CSS.supports('overscroll-behavior', 'none'))) {
    expect(await style('html', 'overscroll-behavior-y')).toBe('none')
    expect(await style('html', 'overscroll-behavior-x')).toBe('none')
    expect(await style('body', 'overscroll-behavior-y')).toBe('none')
  }
  expect(await style('button', 'user-select')).toBe('none')
  expect(await style('input', 'user-select')).not.toBe('none')
  expect(await page.evaluate(() => {
    const event = new Event('gesturestart', { cancelable: true })
    document.dispatchEvent(event)
    return event.defaultPrevented
  })).toBe(true)
  // Android は -webkit-touch-callout が効かないので、ボタンの長押しメニュー（contextmenu）を止める。入力欄は出せる
  const menuPrevented = (selector: string) => page.locator(selector).first().evaluate((el) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    el.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(await menuPrevented('button')).toBe(true)
  expect(await menuPrevented('input')).toBe(false)
  // 文字の拡大（OS の文字サイズ = rem）は効いたまま
  const input = page.getByLabel(/ルームで友達に見える名前/)
  const normal = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  await page.addStyleTag({ content: 'html {font-size:200%}' })
  expect(await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(normal * 1.9)
})

test('街の地図は中でスクロールしても、画面の外側を引っぱらない', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'スキップ' }).click()
  const viewport = page.locator('.town-viewport')
  await expect(viewport).toBeVisible()
  if (await page.evaluate(() => CSS.supports('overscroll-behavior', 'contain'))) expect(await viewport.evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe('contain')
  expect(await viewport.evaluate((el) => getComputedStyle(el).touchAction)).toBe('auto')
})

test('「ホーム画面に追加」の案内はタブで開いた街ホームにだけ出し、閉じたら再読み込みしても出さない', async ({ page }) => {
  await page.goto('./#/')
  const guide = page.getByRole('region', { name: 'ホーム画面に追加すると、全画面で遊べます' })
  await expect(guide).toBeVisible()
  await expect(guide).toContainText('iPhone：共有ボタン →「ホーム画面に追加」')
  // ルームには出さない（ホーム画面のアプリは保存データがブラウザと別のため）
  await page.goto('./#/room/new')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(guide).toHaveCount(0)
  await page.goto('./#/')
  await guide.getByRole('button', { name: '閉じる' }).click()
  await expect(guide).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ラストピース')
  await expect(guide).toHaveCount(0)
})

test('ホーム画面から開いた（standalone）ときは案内を出さない', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window)
    window.matchMedia = (query: string) => (query === '(display-mode: standalone)' ? { ...original(query), matches: true, media: query } : original(query))
  })
  await page.goto('./#/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ラストピース')
  await expect(page.getByRole('link', { name: 'ガチャのお店へ' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'ホーム画面に追加すると、全画面で遊べます' })).toHaveCount(0)
})
