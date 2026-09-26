// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { createAssetGate } from '../app/assets'
import { PITCH_PHOTOS } from '../app/pitchPhotos'
import { createRoomSession, readRecords, ROOM_RECORDS_KEY, writeRecord, type KeyValue, type RoomSession } from '../app/sharedRoom'
import { MockRoomServer } from '../realtime/mock'
import type { PhotoSource } from '../realtime/photos'
import { SHARED_OPEN_TIMEOUT_MS, SHARED_START_DELAY_MS } from '../realtime/protocol'
import { ROOM_POLL_MS } from '../realtime/roomController'

class MemoryStorage implements KeyValue {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

const START = Date.parse('2026-09-26T12:00:00Z')
const readyAssets = createAssetGate([])
let server: MockRoomServer
let ids = 0

const HOST_KEY = 'k'.repeat(40)

function memoryKeys(initial: string | null = null) {
  let key = initial
  return { get: () => key, set: (next: string | null) => { key = next } }
}

/** user の端末。keys を渡すと、その端末に保存したホスト用キーとして使う。 */
function sessionFor(user: string, records: KeyValue = new MemoryStorage(), keys = memoryKeys()): RoomSession {
  const transport = Object.assign(server.asUser(user), { addHostKey: (key: string) => server.addHostKey(key) })
  return createRoomSession(transport, true, records, { requestId: () => `request-${++ids}`, onWake: () => () => {}, hostKeys: keys })
}

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const heading = () => screen.getByRole('heading', { level: 1 })
const button = (name: string | RegExp) => screen.getByRole('button', { name })

async function click(name: string | RegExp) {
  await act(async () => { fireEvent.click(button(name)) })
  await flush()
}

function open(hash: string, session: RoomSession) {
  window.location.hash = hash
  return render(<App storage={new MemoryStorage()} assets={readyAssets} roomSession={session} />)
}

/** ホスト（別の端末の人）がルームを作る。画面は使わず controller で操作する。 */
async function hostRoom(name = 'ミオ') {
  const host = sessionFor('host')
  host.controller.attach()
  await host.controller.createAsHost(HOST_KEY, name)
  return { host, invite: host.controller.getState().snapshot!.invite }
}

/** 別の人（画面は使わない）がルームに入る。開始にはホストのほかに2人以上が要る（F13）。 */
async function addGuests(invite: string, names: string[]) {
  for (const name of names) await server.asUser(`guest-${name}`).join(invite, name)
}

async function joinAs(name: string) {
  await click('ルームに入る')
  fireEvent.change(screen.getByLabelText('表示する名前'), { target: { value: name } })
  await click('この名前で入る')
}

beforeEach(() => {
  vi.useFakeTimers({ now: START })
  ids = 0
  let invites = 0
  server = new MockRoomServer(() => Date.now(), () => `invite-${++invites}`, () => 0)
  server.addHostKey(HOST_KEY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.location.hash = ''
})

describe('ホスト：作る・予約・開始', () => {
  test('ルームを作ると進行役の画面になり、招待リンクを共有できる（デモの注記つき）', async () => {
    const session = sessionFor('host')
    open('#/room/new', session)
    expect(heading()).toHaveTextContent('ルームを作る')
    await click('ルームを作る')
    expect(screen.getByRole('alert')).toHaveTextContent('名前を入れてください')
    fireEvent.change(screen.getByLabelText('表示する名前'), { target: { value: 'ミオ' } })
    await click('ルームを作る')
    expect(window.location.hash).toBe('#/room/invite-1')
    await act(async () => { window.dispatchEvent(new HashChangeEvent('hashchange')) })
    await flush()
    // ホストのほかに2人以上そろうまで開始できない（F13、312:6410）
    expect(heading()).toHaveTextContent('あと2人で始められます')
    expect(screen.getByText('集まっている人')).toBeVisible()
    expect(screen.getByText('1人')).toBeVisible()
    // 上限（内部の 100 人）は出さない
    expect(document.body.textContent).not.toMatch(/100|定員|最大/)
    expect(screen.getByText(/この端末のブラウザの中だけのルーム/)).toBeVisible()
    expect(readRecords(session.records)['invite-1']).toMatchObject({ roomId: 'request-1' })
    expect(button('開封をはじめる')).toBeDisabled()
    await addGuests('invite-1', ['ゆい'])
    await advance(ROOM_POLL_MS)
    expect(heading()).toHaveTextContent('あと1人で始められます')
    await addGuests('invite-1', ['さき'])
    await advance(ROOM_POLL_MS)
    // 人数がそろっても、準備完了の人がいないうちは開始できない
    expect(heading()).toHaveTextContent('開封の準備ができたよ')
    expect(button('開封をはじめる')).toBeDisabled()
    expect(screen.getByText(/準備完了の人がいないため/)).toBeVisible()
    await click('招待リンクを共有')
    const sheet = screen.getByRole('dialog', { name: '招待リンクを共有' })
    expect(within(sheet).getByText(/#\/room\/invite-1$/)).toBeVisible()
    expect(within(sheet).getByRole('link', { name: 'LINEで送る' })).toHaveAttribute('href', expect.stringContaining('line.me'))
    expect(within(sheet).getByText(/別のスマホとはつながりません/)).toBeVisible()
    await act(async () => { fireEvent.click(within(sheet).getByRole('button', { name: 'リンクをコピー' })) })
    expect(within(sheet).getByText(/コピーできませんでした|コピーしました/)).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('予約（ピッチ用つき）→ 秒読み → 今すぐ開始 → 同時開封 → 結果とピッチ用の表示 → みんなの結果', async () => {
    const session = sessionFor('host')
    await session.controller.createAsHost(HOST_KEY, 'ミオ')
    open('#/room/invite-1', session)
    await flush()
    // 参加者（別の人）が準備する
    const guest = sessionFor('guest')
    await guest.controller.join('invite-1', 'ゆい')
    await guest.controller.setReady(true)
    await addGuests('invite-1', ['さき'])
    await advance(ROOM_POLL_MS)
    expect(screen.getByText('1人 準備完了')).toBeVisible()
    fireEvent.click(screen.getByRole('switch', { name: 'わたしも抽選に参加する' }))
    await flush()
    expect(screen.getByText('2人 準備完了')).toBeVisible()

    await click(/開始の時間を予約する/)
    expect(heading()).toHaveTextContent('開始を予約しよう')
    expect(button('3分後')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button('1分後'))
    expect(button('1分後に開始を予約')).toBeEnabled()
    fireEvent.click(screen.getByRole('switch', { name: /ピッチ用/ }))
    await flush()
    expect(session.controller.getState().pitchMode).toBe(true)
    await click('1分後に開始を予約')
    expect(heading()).toHaveTextContent(/に開始$/)
    expect(screen.getByRole('heading', { name: 'あと 1:00 で開始' })).toBeVisible()
    expect(screen.getByText('ピッチ用：このルームは毎回1人に目玉確定')).toBeVisible()
    await advance(15_000)
    expect(screen.getByRole('heading', { name: 'あと 0:45 で開始' })).toBeVisible()

    await click('今すぐ開始')
    expect(heading()).toHaveTextContent('もうすぐ開封！')
    expect(screen.getByRole('timer')).toHaveTextContent('00:08')
    expect(screen.getByText('ピッチ用デモ：このラウンドは1人に目玉確定（確率表示の対象外）')).toBeVisible()
    expect(button('開封を待っています')).toBeDisabled()
    // 公開前は結果を出さない
    expect(document.body.textContent).not.toMatch(/説明用(マスコット|ポーチ|缶バッジ)/)
    await advance(3_000)
    expect(screen.getByRole('timer')).toHaveTextContent('00:05')
    await advance(SHARED_START_DELAY_MS + SHARED_OPEN_TIMEOUT_MS) // #88: 開ける操作がない画面では 10 秒で全員の結果
    expect(heading()).toHaveTextContent('せーので、ひらこう！')
    await click('結果を見る')
    expect(heading()).toHaveTextContent('みんなの結果')
    expect(screen.getByText('YOUR PIECE')).toBeVisible()
    expect(screen.getByText('ピッチ用デモ：このラウンドは1人に目玉確定（確率表示の対象外）')).toBeVisible()
    await click('みんなの結果を見る')
    expect(heading()).toHaveTextContent('みんなのピース')
    expect(screen.getByText('2人 開封済み')).toBeVisible()
    expect(within(screen.getByRole('list', { name: '' })).getAllByRole('listitem')).toHaveLength(2)
    await click('ルームへ戻る')
    expect(heading()).toHaveTextContent('開封の準備ができたよ')
    expect(button(/次の抽選まで/)).toBeDisabled()
  })

  test('予約の時刻に人数が足りなければ待ち、2人目が入ると始まる（F13）', async () => {
    const session = sessionFor('host')
    await session.controller.createAsHost(HOST_KEY, 'ミオ')
    open('#/room/invite-1', session)
    await flush()
    const guest = sessionFor('guest')
    guest.controller.attach()
    await guest.controller.join('invite-1', 'ゆい')
    await guest.controller.setReady(true)
    await advance(ROOM_POLL_MS)
    await click(/開始の時間を予約する/)
    fireEvent.click(button('1分後'))
    await click('1分後に開始を予約')
    await advance(61_000)
    expect(heading()).toHaveTextContent(/^\d\d:\d\d になりました$/)
    expect(screen.getByRole('heading', { name: 'あと1人で始まります' })).toBeVisible()
    expect(screen.getByText('ホストのほかに2人以上そろうと、すぐ始まります')).toBeVisible()
    expect(button('今すぐ開始')).toBeDisabled()
    expect(button('予約を取り消す')).toBeEnabled()
    // 2人目の参加でサーバーが開始し、ホストの画面にも届く
    await addGuests('invite-1', ['さき'])
    await advance(1_000)
    expect(heading()).toHaveTextContent('もうすぐ開封！')
  })

  test('予約の時刻に準備完了の人がいないと「開始できませんでした」。予約し直せる', async () => {
    const session = sessionFor('host')
    await session.controller.createAsHost(HOST_KEY, 'ミオ')
    open('#/room/invite-1', session)
    await flush()
    await addGuests('invite-1', ['ゆい', 'さき'])
    await advance(ROOM_POLL_MS)
    await click(/開始の時間を予約する/)
    fireEvent.click(button('1分後'))
    await click('1分後に開始を予約')
    await click('予約を取り消す')
    expect(heading()).toHaveTextContent('開封の準備ができたよ')
    await click(/開始の時間を予約する/)
    fireEvent.click(button('1分後'))
    await click('1分後に開始を予約')
    await advance(61_000)
    expect(heading()).toHaveTextContent('開始できませんでした')
    expect(screen.getByText(/準備完了の人がいなかったので始めませんでした。コインは減っていません。/)).toBeVisible()
    expect(button('3分後に開始を予約')).toBeEnabled()
    await click('3分後に開始を予約')
    expect(heading()).toHaveTextContent(/に開始$/)
  })
})

describe('参加者：招待・名前・準備・見守り', () => {
  test('名前が使われていたら候補で入れる。準備 → 取り消し → 見守り → ルームを出る', async () => {
    const { invite } = await hostRoom('もも')
    const guest = sessionFor('guest')
    open(`#/room/${invite}`, guest)
    expect(heading()).toHaveTextContent('ルームへの招待')
    expect(screen.getByText('招待が届いたよ')).toBeVisible()
    await joinAs('もも')
    expect(screen.getByText('その名前は使われています')).toBeVisible()
    expect(screen.getByText('このルームにはすでに「もも」さんがいます。「もも2」ならすぐ入れます。')).toBeVisible()
    await click('「もも2」で入る')
    expect(heading()).toHaveTextContent('みんなの開封ルーム')
    expect(screen.getByText('もも2')).toBeVisible()
    expect(screen.getByText('ももさんのルーム · 2人が集まっています')).toBeVisible()
    // 人数待ち（F13、312:6486）は参加者にも出す
    expect(screen.getByText('ホストのほかに2人以上で始められます')).toBeVisible()
    expect(screen.getByText('あと1人で始められます')).toBeVisible()

    await click('抽選に参加する')
    expect(heading()).toHaveTextContent('準備できたよ')
    expect(screen.getByText('1人 準備完了')).toBeVisible()
    await click('準備を取り消す')
    expect(heading()).toHaveTextContent('みんなの開封ルーム')
    await click('見守るだけ')
    expect(heading()).toHaveTextContent('見守り中です')
    expect(readRecords(guest.records)[invite]).toMatchObject({ watching: true })
    await click('ルームを出る')
    expect(window.location.hash).toBe('#/')
    expect(readRecords(guest.records)[invite]).toBeUndefined()
  })

  test('名前を決めずに入ると自動の名前を見せ、ロビーから名前を変えられる（重なりは候補を出す）', async () => {
    const { invite } = await hostRoom('もも')
    const guest = sessionFor('guest')
    open(`#/room/${invite}`, guest)
    await click('ルームに入る')
    expect(screen.getByText('どんな名前で入る？')).toBeVisible()
    await click('名前を決めずに入る')
    expect(screen.getByText('名前は自動で付けました')).toBeVisible()
    const auto = guest.controller.getState().self!.nickname
    expect(auto).toMatch(/^ゲスト .+\d+$/)
    expect(screen.getByRole('heading', { name: `「${auto}」で入ります` })).toBeVisible()
    await click('この名前で入る')
    expect(heading()).toHaveTextContent('みんなの開封ルーム')
    await click('名前を変える')
    expect(heading()).toHaveTextContent('名前を変える')
    fireEvent.change(screen.getByLabelText('表示する名前'), { target: { value: 'もも' } })
    await click('この名前にする')
    expect(screen.getByText('その名前は使われています')).toBeVisible()
    await click('別の名前にする')
    fireEvent.change(screen.getByLabelText('表示する名前'), { target: { value: 'あいうえおかきくけこさしす' } })
    await click('この名前にする')
    expect(screen.getByRole('alert')).toHaveTextContent('名前は12文字までです')
    fireEvent.change(screen.getByLabelText('表示する名前'), { target: { value: 'さくら' } })
    await click('この名前にする')
    expect(heading()).toHaveTextContent('みんなの開封ルーム')
    expect(guest.controller.getState().self!.nickname).toBe('さくら')
  })

  test('予約済みのルームでは開始時刻と残りを出し、準備完了にできる。ピッチ用なら全員に出す', async () => {
    const { host, invite } = await hostRoom()
    await host.controller.setPitchMode(true)
    await host.controller.schedule(3)
    const guest = sessionFor('guest')
    open(`#/room/${invite}`, guest)
    await joinAs('ゆい')
    expect(heading()).toHaveTextContent(/^\d\d:\d\d に開始$/)
    expect(screen.getByText('ホストがいなくても時刻になると始まります')).toBeVisible()
    expect(screen.getByText('ピッチ用：このルームは毎回1人に目玉確定')).toBeVisible()
    await click('準備完了にする')
    expect(screen.getByText('あなたは準備完了です')).toBeVisible()
    expect(button('準備を取り消す')).toBeEnabled()
  })

  test('満員なら入れない（上限の数は出さない）。招待が無効なら終了の画面', async () => {
    const { invite } = await hostRoom()
    for (let i = 0; i < 99; i += 1) await server.asUser(`member-${i}`).join(invite, `人${i}`)
    const guest = sessionFor('guest')
    const view = open(`#/room/${invite}`, guest)
    await joinAs('ゆい')
    expect(heading()).toHaveTextContent('ただいま満員です')
    expect(screen.getByText('これ以上は入れません')).toBeVisible()
    expect(document.body.textContent).not.toMatch(/100/)
    await click('参加済みなら再接続する')
    expect(heading()).toHaveTextContent('ただいま満員です')
    view.unmount()

    open('#/room/unknown-invite', sessionFor('other'))
    await joinAs('ゆい')
    expect(heading()).toHaveTextContent('ルームは終了しました')
    expect(screen.getByText('デモのルームが見つかりません')).toBeVisible()
    expect(screen.getByRole('link', { name: '新しいルームを作る' })).toHaveAttribute('href', '#/room/new')
  })
})

describe('復帰・ホスト不在・期限', () => {
  test('ホストが45秒以上離れると「ホストが離れています」。参加者は交代できず、ロビーで待てる', async () => {
    const { host, invite } = await hostRoom()
    const guest = sessionFor('guest')
    open(`#/room/${invite}`, guest)
    await joinAs('ゆい')
    host.controller.detach()
    await advance(46_000)
    expect(heading()).toHaveTextContent('ホストが離れています')
    expect(screen.queryByRole('button', { name: /引き継ぐ|交代/ })).toBeNull()
    await click('見守るだけにする')
    expect(heading()).toHaveTextContent('見守り中です')
  })

  test('再読み込み後は記録のルームへ戻る。見ていないうちに公開された結果は「おかえりなさい」で回収する', async () => {
    const { host, invite } = await hostRoom()
    const records = new MemoryStorage()
    const first = sessionFor('guest', records)
    let view = open(`#/room/${invite}`, first)
    await joinAs('ゆい')
    await click('抽選に参加する')
    view.unmount()
    first.controller.detach()
    await addGuests(invite, ['さき'])
    await host.controller.start()
    await advance(SHARED_START_DELAY_MS + SHARED_OPEN_TIMEOUT_MS + 1_000)

    const again = sessionFor('guest', records)
    view = open(`#/room/${invite}`, again)
    await flush()
    expect(heading()).toHaveTextContent('おかえりなさい')
    expect(screen.getByText('未確認の結果 1件')).toBeVisible()
    await click('結果を確認する')
    expect(heading()).toHaveTextContent('みんなの結果')
    await click('自分の履歴を見る')
    expect(heading()).toHaveTextContent('自分の履歴')
    expect(screen.getByText(/^1回目：説明用/)).toBeVisible()
    await click('ルームへ戻る')
    expect(heading()).toHaveTextContent('みんなの結果')
    view.unmount()

    // 確認済みの結果は、次に開いたときは知らせない
    await advance(20_000)
    const third = sessionFor('guest', records)
    open(`#/room/${invite}`, third)
    await flush()
    expect(heading()).not.toHaveTextContent('おかえりなさい')
  })

  test('ホストが同じ端末で開き直すと「ホストとして戻りました」', async () => {
    const records = new MemoryStorage()
    const first = sessionFor('host', records)
    await first.controller.createAsHost(HOST_KEY, 'ミオ')
    writeRecord(records, 'invite-1', { roomId: 'request-1' })
    const again = sessionFor('host', records)
    open('#/room/invite-1', again)
    await flush()
    expect(heading()).toHaveTextContent('ホストとして戻りました')
    await click('参加者を確認する')
    expect(heading()).toHaveTextContent('あと2人で始められます')
  })

  test('通信が切れると「接続を確認しています」。戻ると最新のロビーへ', async () => {
    const { invite } = await hostRoom()
    let offline = false
    const base = server.asUser('guest')
    const transport = { ...base, snapshot: (room: string) => offline ? Promise.reject(new Error('fetch failed')) : base.snapshot(room) }
    const guest = createRoomSession(transport, false, new MemoryStorage(), { onWake: () => () => {}, hostKeys: memoryKeys() })
    open(`#/room/${invite}`, guest)
    await joinAs('ゆい')
    expect(screen.queryByText(/この端末のブラウザの中だけ/)).toBeNull()
    offline = true
    await advance(ROOM_POLL_MS)
    expect(heading()).toHaveTextContent('接続を確認しています')
    expect(screen.getByText('--人')).toBeVisible()
    offline = false
    await click('再接続する')
    expect(heading()).toHaveTextContent('みんなの開封ルーム')
  })

  test('ルームの期限（2時間）が過ぎると終了の画面。記録から外す', async () => {
    const { invite } = await hostRoom()
    const guest = sessionFor('guest')
    open(`#/room/${invite}`, guest)
    await joinAs('ゆい')
    await advance(2 * 60 * 60_000)
    expect(heading()).toHaveTextContent('ルームは終了しました')
    expect(screen.getByText('有効期限が過ぎました')).toBeVisible()
    expect(guest.records.getItem(ROOM_RECORDS_KEY)).toBe('{}')
  })

  test('ホスト用リンク：キーを保存してアドレスバーから消し、ホストとして戻る。ルームがなければ作る。違うキーは無効', async () => {
    const records = new MemoryStorage()
    const keys = memoryKeys()
    // ルームがまだない：ホスト用リンクから作る
    let view = open(`#/host/${HOST_KEY}`, sessionFor('host', records, keys))
    await flush()
    expect(window.location.hash).toBe('#/host')
    expect(heading()).toHaveTextContent('ルームを作る')
    expect(screen.queryByText(/この端末をホストにして作ります/)).toBeNull()
    fireEvent.change(screen.getByLabelText('表示する名前'), { target: { value: 'ミオ' } })
    await click('ルームを作る')
    expect(keys.get()).toBe(HOST_KEY)
    expect(window.location.hash).toBe('#/room/invite-1')
    view.unmount()

    // 別の端末（別の人）でホスト用リンクを開くと、ホストとして戻る
    const other = sessionFor('host-phone', new MemoryStorage(), memoryKeys())
    view = open(`#/host/${HOST_KEY}`, other)
    await flush()
    expect(window.location.hash).toBe('#/room/invite-1')
    await act(async () => { window.dispatchEvent(new HashChangeEvent('hashchange')) })
    await flush()
    expect(heading()).toHaveTextContent('ホストとして戻りました')
    expect(screen.getByText('ホスト用リンクはあなただけが持っています')).toBeVisible()
    await click('参加者を確認する')
    expect(heading()).toHaveTextContent('あと2人で始められます')
    await click('招待リンクを共有')
    expect(screen.getByRole('heading', { name: 'ホスト用リンク（あなただけ）' })).toBeVisible()
    view.unmount()

    // 違うキー・形の違うキー
    view = open(`#/host/${'x'.repeat(40)}`, sessionFor('stranger', new MemoryStorage(), memoryKeys()))
    await flush()
    expect(heading()).toHaveTextContent('ホスト用リンクが無効です')
    expect(screen.getByText('ルームは作られていません')).toBeVisible()
    view.unmount()
    view = open('#/host/some-key', sessionFor('stranger', new MemoryStorage(), memoryKeys()))
    await flush()
    expect(heading()).toHaveTextContent('ホスト用リンクが無効です')
    view.unmount()
    // 回帰：有効なリンクを開いた後でも、形の違うリンクは前のキーを使わずに無効と案内する
    open('#/host/A B', sessionFor('stranger', new MemoryStorage(), memoryKeys()))
    await flush()
    expect(heading()).toHaveTextContent('ホスト用リンクが無効です')
    expect(screen.getByRole('link', { name: '街へ戻る' })).toHaveAttribute('href', '#/')
  })

  test('ホスト用キーがない端末（Supabase 接続時）は、ルームを作れないことを案内する', () => {
    const real = createRoomSession(server.asUser('someone'), false, new MemoryStorage(), { hostKeys: memoryKeys(), onWake: () => () => {} })
    open('#/room/new', real)
    expect(screen.getByRole('heading', { name: 'ルームを作れるのはホストだけです' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'ガチャのお店へ' })).toHaveAttribute('href', '#/gacha')
    expect(screen.queryByLabelText('表示する名前')).toBeNull()
    // F15: 実 transport ではデモの注記を出さない
    expect(screen.queryByText(/デモ：/)).toBeNull()
  })

  test('F15: 実 transport のルーム（別の端末とつながる）では、ロビー・共有シートにデモの注記を出さない', async () => {
    const host = createRoomSession(server.asUser('real-host'), false, new MemoryStorage(), { hostKeys: memoryKeys(HOST_KEY), onWake: () => () => {} })
    open('#/room/new', host)
    expect(screen.getByRole('heading', { name: 'どんな名前で始める？' })).toBeVisible()
    expect(screen.queryByText(/デモ：/)).toBeNull()
    fireEvent.change(screen.getByLabelText('表示する名前'), { target: { value: 'ミオ' } })
    await click('ルームを作る')
    await flush()
    expect(heading()).toHaveTextContent('あと2人で始められます')
    expect(screen.queryByText(/デモ：/)).toBeNull()
    await click('招待リンクを共有')
    expect(screen.getByRole('dialog', { name: '招待リンクを共有' })).toBeVisible()
    expect(screen.queryByText(/デモ：|別のスマホとはつながりません/)).toBeNull()
  })
})

describe('F15: ピッチ用の実物グッズ写真（Supabase につないだルームの中だけ）', () => {
  let created: string[]
  let revoked: string[]
  beforeEach(() => {
    created = []
    revoked = []
    let n = 0
    Object.assign(URL, {
      createObjectURL: vi.fn(() => { const url = `blob:photo-${++n}`; created.push(url); return url }),
      revokeObjectURL: vi.fn((url: string) => { revoked.push(url) }),
    })
  })

  const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })

  /** ホストの実 transport の端末。ほかの2人は画面を使わず準備する。photos は写真の取得元。 */
  async function hostWithPrize(photos: PhotoSource | null, demo = false) {
    const transport = Object.assign(server.asUser('photo-host'), { addHostKey: (key: string) => server.addHostKey(key) })
    const session = createRoomSession(transport, demo, new MemoryStorage(), { requestId: () => `request-${++ids}`, onWake: () => () => {}, hostKeys: memoryKeys(HOST_KEY) }, photos)
    await session.controller.createAsHost(HOST_KEY, 'ミオ')
    const invite = session.controller.getState().snapshot!.invite
    const guest = server.asUser('photo-guest')
    await guest.join(invite, 'ゆい')
    await addGuests(invite, ['さき'])
    await session.controller.setReady(true)
    open(`#/room/${invite}`, session)
    await flush()
    return session
  }

  async function openResult(session: RoomSession) {
    await session.controller.start()
    await advance(SHARED_START_DELAY_MS + SHARED_OPEN_TIMEOUT_MS + 1_000)
    await click('結果を見る')
    expect(heading()).toHaveTextContent('みんなの結果')
    return session.controller.getState().myPrize!
  }

  test('自分の賞品が決まるまで読まない。結果では写真（alt は賞品名）と権利表記を出し、一覧を見ても読み直さず、ルームを離れると URL を取り消す', async () => {
    const load = vi.fn(async () => jpeg())
    const session = await hostWithPrize({ load })
    expect(load).not.toHaveBeenCalled()
    const prize = await openResult(session)
    expect(load).toHaveBeenCalledWith(PITCH_PHOTOS[prize].path)
    const stage = screen.getByRole('figure')
    const photo = within(stage).getByRole('img', { name: /説明用/ })
    expect(photo).toHaveAttribute('src', created[0])
    expect(within(stage).getByText(`写真: ${PITCH_PHOTOS[prize].credit}`)).toBeVisible()
    // みんなのピースへ行って戻っても読み直さない
    await click('みんなの結果を見る')
    expect(screen.queryByText(/^写真: ©/)).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
    cleanup()
    expect(revoked).toContain(created[0])
  })

  test('読めない（権限なし・未アップロード）ときは元の絵のまま、権利表記も出さない', async () => {
    const load = vi.fn(async () => null)
    const session = await hostWithPrize({ load })
    await openResult(session)
    expect(load).toHaveBeenCalledTimes(1)
    expect(created).toHaveLength(0)
    expect(within(screen.getByRole('figure')).queryByRole('img', { name: /説明用/ })).toBeNull()
    expect(screen.queryByText(/^写真: ©/)).toBeNull()
  })

  test('写真が表示できない（壊れた画像）ときは元の絵に戻し、権利表記を消す', async () => {
    const session = await hostWithPrize({ load: async () => jpeg() })
    await openResult(session)
    const photo = within(screen.getByRole('figure')).getByRole('img', { name: /説明用/ })
    fireEvent.error(photo)
    expect(within(screen.getByRole('figure')).queryByRole('img', { name: /説明用/ })).toBeNull()
    expect(screen.queryByText(/^写真: ©/)).toBeNull()
  })

  test('端末内デモでは取得元を渡されても写真を読まない', async () => {
    const load = vi.fn(async () => jpeg())
    const session = await hostWithPrize({ load }, true)
    expect(session.photos).toBeNull()
    await openResult(session)
    expect(load).not.toHaveBeenCalled()
    expect(screen.queryByText(/^写真: ©/)).toBeNull()
  })
})
