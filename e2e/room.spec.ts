import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { fullRoom, revealedRound, ROOM_INVITE, ROOM_T0, roomSeed, type RoomSeed } from './room-seeds.ts'

// 共有ルーム（T10・F05）。ビルドは実 Supabase を指す（.env.production、F15）が、E2E は playwright.config.ts の
// lastpiece_room_force_demo=1 で、同じブラウザのタブの間だけで動く端末内デモにして確かめる（実 Supabase へは通信しない）。

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
  return errors
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 })

async function seeded(page: Page, seed: RoomSeed) {
  await page.clock.setFixedTime(seed.clock)
  await page.addInitScript(({ demo, session }) => {
    localStorage.setItem('lastpiece_room_demo_v1', demo)
    for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, value)
  }, seed)
  await page.goto(`./#/room/${ROOM_INVITE}`)
}

test('ホストが作って予約・ピッチ用・今すぐ開始、参加者は名前を選んで準備し、秒読み → 同時開封 → 結果', async ({ page, context }) => {
  const errors = watchErrors(page)
  await page.goto('./#/gacha/melody-anniv')
  await page.getByRole('link', { name: /友達と回す/ }).click()
  await expect(heading(page)).toHaveText('ルームを作る')
  await page.getByLabel('表示する名前').fill('ミオ')
  await page.getByRole('button', { name: 'ルームを作る' }).click()
  await expect(heading(page)).toHaveText('あと2人で始められます')
  await expect(page.getByText('この端末のブラウザの中だけのルームです', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: '開封をはじめる' })).toBeDisabled()
  await page.getByRole('button', { name: '招待リンクを共有' }).click()
  const invite = await page.getByRole('dialog', { name: '招待リンクを共有' }).locator('.invite-url').textContent()
  expect(invite).toMatch(/#\/room\/[0-9a-f-]+$/)
  await page.getByRole('button', { name: '閉じる' }).click()

  // 同じブラウザの別のタブ＝別の参加者（端末内デモ）
  const guest = await context.newPage()
  const guestErrors = watchErrors(guest)
  await guest.goto(invite!)
  await expect(heading(guest)).toHaveText('ルームへの招待')
  await guest.getByRole('button', { name: 'ルームに入る' }).click()
  await guest.getByLabel('表示する名前').fill('ミオ')
  await guest.getByRole('button', { name: 'この名前で入る' }).click()
  await expect(guest.getByText('このルームにはすでに「ミオ」さんがいます。「ミオ2」ならすぐ入れます。')).toBeVisible()
  await guest.getByRole('button', { name: '別の名前にする' }).click()
  await guest.getByLabel('表示する名前').fill('ゆい')
  await guest.getByRole('button', { name: 'この名前で入る' }).click()
  await expect(heading(guest)).toHaveText('みんなの開封ルーム')
  await expect(guest.getByText('ミオさんのルーム · 2人が集まっています')).toBeVisible()
  await guest.getByRole('button', { name: '抽選に参加する' }).click()
  await expect(heading(guest)).toHaveText('準備できたよ')

  // ホストのほかに2人以上で始められる（F13）。3つ目のタブの人は見守り
  await expect(heading(page)).toHaveText('あと1人で始められます', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: '開封をはじめる' })).toBeDisabled()
  const third = await context.newPage()
  await third.goto(invite!)
  await third.getByRole('button', { name: 'ルームに入る' }).click()
  await third.getByRole('button', { name: '名前を決めずに入る' }).click()
  await third.getByRole('button', { name: 'この名前で入る' }).click()
  await expect(heading(third)).toHaveText('みんなの開封ルーム')
  // ホストのタブにも届く（タブ間の知らせ、またはポーリング）
  await expect(heading(page)).toHaveText('開封の準備ができたよ', { timeout: 20_000 })
  await expect(page.getByText('1人 準備完了')).toBeVisible()
  await page.getByRole('button', { name: /開始の時間を予約する/ }).click()
  await expect(heading(page)).toHaveText('開始を予約しよう')
  // 切り替えはサーバーの応答で反映される（制御されたスイッチ）
  await page.getByRole('switch', { name: /ピッチ用/ }).click()
  await expect(page.getByRole('switch', { name: /ピッチ用/ })).toBeChecked()
  await page.getByRole('button', { name: '5分後', exact: true }).click()
  await page.getByRole('button', { name: '5分後に開始を予約' }).click()
  await expect(heading(page)).toHaveText(/^\d\d:\d\d に開始$/)
  await expect(heading(guest)).toHaveText(/^\d\d:\d\d に開始$/, { timeout: 20_000 })
  await expect(guest.getByText('ピッチ用：このルームは毎回1人に目玉確定')).toBeVisible()
  await expect(guest.getByText('あなたは準備完了です')).toBeVisible()

  await page.getByRole('button', { name: '今すぐ開始' }).click()
  await expect(heading(page)).toHaveText('もうすぐ開封！')
  await expect(page.getByRole('timer')).toHaveText(/開封まで00:0\d/)
  await expect(page.getByText('ピッチ用デモ：このラウンドは1人に目玉確定（確率表示の対象外）')).toBeVisible()
  await expect(heading(guest)).toHaveText(/もうすぐ開封！|せーので、ひらこう！/, { timeout: 20_000 })
  await expect(heading(guest)).toHaveText('せーので、ひらこう！', { timeout: 20_000 })
  await guest.getByRole('button', { name: '結果を見る' }).click()
  await expect(heading(guest)).toHaveText('みんなの結果')
  await expect(guest.getByText('YOUR PIECE')).toBeVisible()
  // ピッチ用：参加者は1人なので、その人に目玉が確定する（本物の在庫から）
  await expect(guest.getByRole('heading', { name: '説明用マスコット' })).toBeVisible()
  await expect(guest.getByText('ピッチ用デモ：このラウンドは1人に目玉確定（確率表示の対象外）')).toBeVisible()
  await guest.getByRole('button', { name: 'みんなの結果を見る' }).click()
  await expect(heading(guest)).toHaveText('みんなのピース')
  await expect(guest.getByText('1人 開封済み')).toBeVisible()
  await guest.getByRole('button', { name: 'ルームへ戻る' }).click()
  await expect(heading(guest)).toHaveText(/準備|みんなの開封ルーム/)
  expect(errors).toEqual([])
  expect(guestErrors).toEqual([])
})

test('名前を決めずに入る → 自動の名前 → ロビーで名前を変える。見守り → ルームを出る', async ({ page }) => {
  const errors = watchErrors(page)
  await seeded(page, roomSeed({ joined: false }))
  await page.getByRole('button', { name: 'ルームに入る' }).click()
  await page.getByRole('button', { name: '名前を決めずに入る' }).click()
  await expect(page.getByText('名前は自動で付けました')).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(/^「ゲスト .+\d+」で入ります$/)
  await page.getByRole('button', { name: 'この名前で入る' }).click()
  await expect(heading(page)).toHaveText('みんなの開封ルーム')
  await expect(page.getByText('ほか3人も一緒に待っています')).toBeVisible()
  await page.getByRole('button', { name: '名前を変える' }).click()
  await page.getByLabel('表示する名前').fill('もも')
  await page.getByRole('button', { name: 'この名前にする' }).click()
  await expect(heading(page)).toHaveText('みんなの開封ルーム')
  await expect(page.getByText('あなたの名前：もも')).toBeVisible()
  await page.getByRole('button', { name: '見守るだけ' }).click()
  await expect(heading(page)).toHaveText('見守り中です')
  await page.getByRole('button', { name: 'ルームを出る' }).click()
  await expect(heading(page)).toHaveText('ラストピース')
  expect(errors).toEqual([])
})

test('通信が切れると「接続を確認しています」。戻ると最新のロビーへ（二重に送らない）', async ({ page, context }) => {
  const errors = watchErrors(page)
  await seeded(page, roomSeed())
  await expect(heading(page)).toHaveText('みんなの開封ルーム')
  await context.setOffline(true)
  await page.getByRole('button', { name: '抽選に参加する' }).click()
  await expect(heading(page)).toHaveText('接続を確認しています')
  await expect(page.getByText('500デモコインは二重に使いません')).toBeVisible()
  // 通信が戻ると（online）自動で取り直す。オフラインの間の「抽選に参加する」は送られていない
  await context.setOffline(false)
  await expect(heading(page)).toHaveText('みんなの開封ルーム')
  await expect(page.getByText('1人 準備完了')).toBeVisible()
  await expect(page.getByRole('button', { name: '抽選に参加する' })).toBeEnabled()
  expect(errors).toEqual([])
})

test('見ていないうちに公開された結果は「おかえりなさい」で回収し、履歴で見られる', async ({ page }) => {
  await seeded(page, roomSeed({ round: revealedRound() }, ROOM_T0 + 60_000))
  await expect(heading(page)).toHaveText('おかえりなさい')
  await expect(page.getByText('未確認の結果 1件')).toBeVisible()
  await page.getByRole('button', { name: '結果を確認する' }).click()
  await expect(heading(page)).toHaveText('みんなの結果')
  await expect(page.getByRole('heading', { name: '説明用ポーチ' })).toBeVisible()
  await page.getByRole('button', { name: '自分の履歴を見る' }).click()
  await expect(page.getByText('1回目：説明用ポーチ')).toBeVisible()
})

test('ホスト不在：交代はできず、ロビーで待つか見守りにする。ホストは同じ端末で戻れる', async ({ page, context }) => {
  await seeded(page, roomSeed({ members: [{ id: 'host', nickname: 'ミオ', seenAt: ROOM_T0 - 60_000 }, { id: 'me', nickname: 'もも', ready: true }] }))
  await expect(heading(page)).toHaveText('ホストが離れています')
  await expect(page.getByText('予約した時刻になれば、ホストがいなくても始まります。', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: /引き継|交代/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'ロビーで待つ' }).click()
  await expect(heading(page)).toHaveText('準備できたよ')

  const host = await context.newPage()
  await seeded(host, roomSeed({ self: 'host', host: 'host', members: [{ id: 'host', nickname: 'ミオ' }, { id: 'yui', nickname: 'ゆい', ready: true }, { id: 'saki', nickname: 'さき' }] }))
  await expect(heading(host)).toHaveText('ホストとして戻りました')
  await host.getByRole('button', { name: '開封をはじめる' }).click()
  await expect(heading(host)).toHaveText('もうすぐ開封！')
})

test('満員なら入れず（数は出さない）、期限の過ぎたルームは終了を伝える', async ({ page, context }) => {
  await seeded(page, fullRoom())
  await page.getByRole('button', { name: 'ルームに入る' }).click()
  await page.getByLabel('表示する名前').fill('もも')
  await page.getByRole('button', { name: 'この名前で入る' }).click()
  await expect(heading(page)).toHaveText('ただいま満員です')
  await expect(page.locator('main')).not.toContainText('100')
  await page.getByRole('link', { name: '招待元へ戻る' }).click()
  await expect(heading(page)).toHaveText('ラストピース')

  const late = await context.newPage()
  await seeded(late, roomSeed({}, ROOM_T0 + 2 * 60 * 60_000 + 1_000))
  await expect(heading(late)).toHaveText('ルームは終了しました')
  await expect(late.getByText('有効期限が過ぎました', { exact: true })).toBeVisible()
  await expect(late.getByRole('link', { name: '新しいルームを作る' })).toBeVisible()
})

test('F15: ビルドは実 Supabase を指すが、E2E は端末内デモにして *.supabase.co へ通信しない', async ({ page, context, request }) => {
  const env = readFileSync('.env.production', 'utf8')
  const url = env.match(/^VITE_SUPABASE_URL=(https:\/\/[a-z0-9]+\.supabase\.co)$/m)?.[1]
  expect(url, '.env.production の URL').toBeTruthy()
  expect(env).toMatch(/^VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_[A-Za-z0-9_-]+$/m)
  const remote: string[] = []
  context.on('request', (req) => { if (req.url().includes('.supabase.co')) remote.push(req.url()) })
  await page.goto('./#/room/new')
  await expect(heading(page)).toHaveText('ルームを作る')
  await expect(page.getByText('この端末のブラウザの中だけのルームです', { exact: false })).toBeVisible()
  // テストしている成果物（CI の web-dist は本番の公開にもそのまま使う）に、実 Supabase の URL が入っている
  const scripts = await page.locator('script[type="module"][src]').evaluateAll((nodes) => nodes.map((node) => (node as HTMLScriptElement).src))
  const bodies = await Promise.all(scripts.map(async (src) => (await request.get(src)).text()))
  expect(bodies.some((body) => body.includes(url!))).toBe(true)
  await page.getByLabel('表示する名前').fill('ミオ')
  await page.getByRole('button', { name: 'ルームを作る' }).click()
  await expect(heading(page)).toHaveText('あと2人で始められます')
  expect(remote).toEqual([])
})

test('ホスト用リンクが無効なら、ホストにはなれない', async ({ page }) => {
  await page.goto('./#/host/old-key')
  await expect(heading(page)).toHaveText('ホスト用リンクが無効です')
  await page.getByRole('link', { name: '街へ戻る' }).click()
  await expect(heading(page)).toHaveText('ラストピース')
})
