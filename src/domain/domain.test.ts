import { describe, expect, test } from 'vitest'
import { catalog, categoryList, daysSinceRelease, findGacha, findPrize, MIN_DAYS_SINCE_RELEASE, seriesList } from './catalog'
import { addDemoCoins, completeWelcome, createInitialState, exchange, exchangeQuote, featuredCandidate, requestDelivery, setForceFeatured, setNickname, shouldShowKakutei, spin, spinCheck, spinQuote, STARTER_COINS, summarize, toggleSetting } from './game'
import { EXCHANGE_RATE, exchangeCoins, formatPercent, oddsOf, OPEN_TAPS, percentLabels, pickPrize, remainingRatio, remainLevel, totalRemaining } from './odds'
import { revealLine, turnEffect } from './spinScript'
import { loadState, parseState, saveState, STORAGE_KEY } from './storage'
import type { AppState } from './types'

const now = new Date('2026-09-25T10:00:00Z')
const fixed = (...values: number[]) => { let i = 0; return () => values[Math.min(i++, values.length - 1)] }
const melody = findGacha('melody-anniv')!

describe('カタログ', () => {
  test('すべてのガチャは中身があり、残りが最初の数を超えない', () => {
    for (const gacha of catalog) {
      expect(gacha.prizes.length).toBeGreaterThan(0)
      for (const prize of gacha.prizes) {
        expect(prize.startRemaining).toBeLessThanOrEqual(prize.total)
        expect(prize.refPrice).toBeGreaterThan(0)
      }
      expect(new Set(gacha.prizes.map((prize) => prize.id)).size).toBe(gacha.prizes.length)
    }
    expect(catalog).toHaveLength(12)
    for (const series of seriesList) expect(catalog.filter((gacha) => gacha.series === series.id)).toHaveLength(3)
    expect(findPrize('melody-anniv', 'nope')).toBeUndefined()
    expect(findPrize('nope', 'anniv-plush')).toBeUndefined()
  })
})

describe('取り扱いのルール', () => {
  test('発売から90日以内の新作は扱わない', () => {
    const today = new Date('2026-09-25T00:00:00+09:00')
    for (const gacha of catalog) for (const prize of gacha.prizes) expect(daysSinceRelease(prize, today), prize.name).toBeGreaterThan(MIN_DAYS_SINCE_RELEASE)
  })

  test('どの作品・種類のタブを選んでも 1 本以上のガチャが出る', () => {
    for (const series of seriesList) for (const category of categoryList) {
      expect(catalog.some((gacha) => gacha.series === series.id && gacha.categories.includes(category.id)), `${series.label}×${category.label}`).toBe(true)
    }
  })

  test('目玉は各ガチャ 1〜3 点', () => {
    for (const gacha of catalog) {
      const count = gacha.prizes.filter((prize) => prize.glow === 'featured').length
      expect(count).toBeGreaterThanOrEqual(1)
      expect(count).toBeLessThanOrEqual(3)
    }
  })

  test('確定演出は目玉のときだけ', () => {
    for (const prize of melody.prizes) expect(shouldShowKakutei(prize)).toBe(prize.glow === 'featured')
  })
})

describe('確率と残り', () => {
  test('確率はいまの残りから計算し、合計は 1 になる', () => {
    const state = createInitialState()
    const rows = oddsOf(melody, state.stock)
    expect(rows.map((row) => row.prize.refPrice)).toEqual([...rows.map((row) => row.prize.refPrice)].sort((a, b) => b - a))
    expect(rows.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1)
    const total = totalRemaining(melody, state.stock)
    expect(rows[0].probability).toBeCloseTo(rows[0].remaining / total)
  })

  test('売り切れのガチャは確率 0、残りの段階は売り切れ', () => {
    const state = createInitialState()
    const empty = { ...state.stock, [melody.id]: Object.fromEntries(melody.prizes.map((prize) => [prize.id, 0])) }
    expect(oddsOf(melody, empty).every((row) => row.probability === 0)).toBe(true)
    expect(remainLevel(remainingRatio(melody, empty))).toBe('soldout')
    expect(pickPrize(melody, empty, 0.5)).toBeNull()
  })

  test('残りの段階の境界値', () => {
    expect(remainLevel(1)).toBe('plenty')
    expect(remainLevel(0.6)).toBe('plenty')
    expect(remainLevel(0.59)).toBe('half')
    expect(remainLevel(0.3)).toBe('half')
    expect(remainLevel(0.29)).toBe('few')
    expect(remainLevel(0)).toBe('soldout')
  })

  test('確率の表示形式', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(0.0233)).toBe('2.3%')
    expect(formatPercent(0.0005)).toBe('0.05%')
  })

  test('重み付きの抽選は乱数の端でも中身を返す', () => {
    const stock = createInitialState().stock
    expect(pickPrize(melody, stock, 0)?.id).toBe(melody.prizes[0].id)
    expect(pickPrize(melody, stock, 0.9999999999)?.id).toBe(melody.prizes[melody.prizes.length - 1].id)
    expect(pickPrize(melody, stock, -1)?.id).toBe(melody.prizes[0].id)
    expect(pickPrize(melody, stock, 0.99, true)?.glow).toBe('featured')
  })

  test('目玉確定のデモは目玉が残っていないときは通常の抽選になる', () => {
    const stock = createInitialState().stock
    const featuredIds = melody.prizes.filter((prize) => prize.glow === 'featured').map((prize) => prize.id)
    const noFeatured = { ...stock, [melody.id]: { ...stock[melody.id], ...Object.fromEntries(featuredIds.map((id) => [id, 0])) } }
    expect(pickPrize(melody, noFeatured, 0, true)?.glow).not.toBe('featured')
  })

  test('交換は参考価格の一律 20%（端数切り捨て）', () => {
    expect(EXCHANGE_RATE).toBe(0.2)
    expect(exchangeCoins(12000)).toBe(2400)
    expect(exchangeCoins(999)).toBe(199)
    expect(exchangeCoins(0)).toBe(0)
    expect(exchangeCoins(-100)).toBe(0)
    expect(exchangeCoins(Number.NaN)).toBe(0)
  })

  test('カプセルはマスターどおり、光り方にかかわらず3回タップで開く', () => {
    expect(OPEN_TAPS).toBe(3)
  })

  test('確率の表示は小数第1位で、合計がちょうど 100.0% になる（値はいまの残りのまま）', () => {
    const sum = (labels: Map<string, string>) => Math.round([...labels.values()].reduce((total, text) => total + Number.parseFloat(text) * 10, 0))
    for (const gacha of catalog) {
      const rows = oddsOf(gacha, createInitialState().stock)
      const labels = percentLabels(rows)
      expect(sum(labels), gacha.id).toBe(1000)
      for (const row of rows) {
        const shown = Number.parseFloat(labels.get(row.prize.id)!)
        // 丸めた表示と本当の値の差は 0.1% 未満
        expect(Math.abs(shown - row.probability * 100), row.prize.id).toBeLessThan(0.1)
        expect(labels.get(row.prize.id)).toMatch(/^\d+\.\d%$/)
      }
    }
  })

  test('確率の表示：残り 0 は 0%、残りがある品は 0.0% にしない、全部売り切れは全部 0%', () => {
    const capsule = findGacha('sanrio-capsule')!
    const stock = createInitialState().stock
    const one = { ...stock, [capsule.id]: { ...Object.fromEntries(capsule.prizes.map((prize) => [prize.id, 0])), 'sanrio-capsule-1': 1, 'sanrio-capsule-9': 5000 } }
    const labels = percentLabels(oddsOf(capsule, one))
    expect(labels.get('sanrio-capsule-1')).toBe('0.1%')
    expect(labels.get('sanrio-capsule-9')).toBe('99.9%')
    expect(labels.get('sanrio-capsule-2')).toBe('0%')
    const none = { ...stock, [capsule.id]: Object.fromEntries(capsule.prizes.map((prize) => [prize.id, 0])) }
    expect([...percentLabels(oddsOf(capsule, none)).values()]).toEqual(Array(capsule.prizes.length).fill('0%'))
  })
})

describe('まわす', () => {
  test('コインを使い、在庫を 1 つ減らし、記録を残す', () => {
    const state = createInitialState()
    const result = spin(state, melody.id, fixed(0), [], now)
    if (!result.ok) throw new Error(result.error)
    expect(result.state.coins).toBe(STARTER_COINS - melody.price)
    expect(result.state.stock[melody.id][result.prize.id]).toBe(state.stock[melody.id][result.prize.id] - 1)
    expect(result.win).toMatchObject({ id: 'w1', spent: melody.price, status: 'kept', companions: [], wonAt: now.toISOString() })
    expect(result.state.nextWinSeq).toBe(2)
    expect(state.coins).toBe(STARTER_COINS)
  })

  test('友達（デモ）も同じ在庫から引く', () => {
    const state = createInitialState()
    const result = spin(state, melody.id, fixed(0, 0, 0), ['ゆい', 'さき'], now)
    if (!result.ok) throw new Error(result.error)
    expect(result.friends.map((friend) => friend.name)).toEqual(['ゆい', 'さき'])
    const before = totalRemaining(melody, state.stock)
    expect(totalRemaining(melody, result.state.stock)).toBe(before - 3)
  })

  test('在庫が 1 つだけのとき友達の結果は空になる', () => {
    const state = createInitialState()
    const last = melody.prizes[melody.prizes.length - 1].id
    const one: AppState = { ...state, stock: { ...state.stock, [melody.id]: { ...Object.fromEntries(melody.prizes.map((prize) => [prize.id, 0])), [last]: 1 } } }
    const result = spin(one, melody.id, fixed(0.5), ['ゆい'], now)
    if (!result.ok) throw new Error(result.error)
    expect(result.friends[0].prize).toBeNull()
  })

  test('目玉確定のデモは 1 回で解除される', () => {
    const state = setForceFeatured(createInitialState(), true)
    const result = spin(state, melody.id, fixed(0.99), [], now)
    if (!result.ok) throw new Error(result.error)
    expect(result.prize.glow).toBe('featured')
    expect(result.state.forceFeaturedNext).toBe(false)
  })

  test('コイン不足・売り切れ・存在しないガチャは失敗し、状態を変えない', () => {
    const state = createInitialState()
    expect(spin({ ...state, coins: 100 }, melody.id, fixed(0), [], now)).toEqual({ ok: false, error: 'insufficient-coins' })
    const empty = { ...state, stock: { ...state.stock, [melody.id]: Object.fromEntries(melody.prizes.map((prize) => [prize.id, 0])) } }
    expect(spinCheck(empty, melody.id)).toBe('sold-out')
    expect(spin(state, 'unknown', fixed(0), [], now)).toEqual({ ok: false, error: 'not-found' })
    expect(spinCheck(state, melody.id)).toBeNull()
  })
})

describe('当てたもの', () => {
  const won = () => {
    let state = createInitialState()
    for (const r of [0, 0.99]) {
      const result = spin(state, melody.id, fixed(r), [], now)
      if (!result.ok) throw new Error(result.error)
      state = result.state
    }
    return state
  }

  test('コインに交換すると一律 20% が入り、同じ物は二度交換できない', () => {
    const state = won()
    const ids = state.wins.map((win) => win.id)
    const quote = exchangeQuote(state, ids)
    const expected = quote.reduce((sum, row) => sum + row.coins, 0)
    expect(quote.every(({ win, coins }) => coins === exchangeCoins(findPrize(win.gachaId, win.prizeId)!.prize.refPrice))).toBe(true)
    const next = exchange(state, ids)
    expect(next.coins).toBe(state.coins + expected)
    expect(next.wins.every((win) => win.status === 'exchanged')).toBe(true)
    expect(exchange(next, ids)).toBe(next)
  })

  test('届けてもらうと届け待ちになり、交換の対象から外れる', () => {
    const state = won()
    const [first] = state.wins
    const next = requestDelivery(state, [first.id])
    expect(next.wins.find((win) => win.id === first.id)?.status).toBe('delivery')
    expect(exchangeQuote(next, [first.id])).toEqual([])
    expect(requestDelivery(next, [first.id])).toBe(next)
  })

  test('合計は使ったコインと参考価格の合計', () => {
    const state = won()
    const summary = summarize(state.wins)
    expect(summary.count).toBe(2)
    expect(summary.spent).toBe(melody.price * 2)
    expect(summary.refTotal).toBeGreaterThan(0)
    expect(summarize([{ ...state.wins[0], prizeId: 'missing' }]).refTotal).toBe(0)
  })
})

describe('マイページの操作', () => {
  test('デモのコインは決まったパックだけ増える', () => {
    const state = createInitialState()
    expect(addDemoCoins(state, 5000).coins).toBe(STARTER_COINS + 5000)
    expect(addDemoCoins(state, 123)).toBe(state)
  })

  test('はじめての画面を終えると記録される。声と音は切り替えられる', () => {
    const state = createInitialState()
    expect(state.voiceOn).toBe(false)
    expect(state.soundOn).toBe(false)
    const done = completeWelcome(state, 'ゆい')
    expect(done.ok && done.state.welcomed).toBe(true)
    expect(completeWelcome(state, '').ok).toBe(false)
    expect(toggleSetting(state, 'voiceOn').voiceOn).toBe(true)
    expect(toggleSetting(state, 'soundOn').soundOn).toBe(true)
  })

  test('ニックネームは前後の空白を除き 1〜12 文字', () => {
    const state = createInitialState()
    const ok = setNickname(state, '  さき ')
    expect(ok.ok && ok.state.nickname).toBe('さき')
    expect(setNickname(state, '   ')).toEqual({ ok: false, message: 'ニックネームを入れてください' })
    expect(setNickname(state, 'あ'.repeat(13)).ok).toBe(false)
    expect(setNickname(state, 'あ'.repeat(12)).ok).toBe(true)
  })
})

describe('演出の台本', () => {
  test('確定演出は目玉のときだけ出る', () => {
    expect(turnEffect(2, 'featured', true).banner?.kind).toBe('kakutei')
    expect(turnEffect(2, 'sparkle', true).banner?.kind).toBe('chance')
    expect(turnEffect(2, 'normal', true).banner).toBeUndefined()
    for (const turn of [1, 3]) for (const glow of ['featured', 'sparkle', 'normal'] as const) expect(turnEffect(turn, glow, false).banner).toBeUndefined()
  })

  test('ひとりのときは友達のひとことを出さない', () => {
    expect(turnEffect(1, 'normal', false).friendLine).toBeUndefined()
    expect(turnEffect(1, 'featured', true).friendLine).toContain('リボン')
    expect(turnEffect(3, 'featured', true).chip).toContain('ぜったい')
    expect(turnEffect(3, 'normal', false).pipi).toBe('せーのっ！')
  })

  test('開封のことば', () => {
    expect(revealLine('featured')).toContain('おめでとう')
    expect(revealLine('sparkle')).toContain('キラキラ')
    expect(revealLine('normal')).toContain('やったね')
  })
})

describe('保存', () => {
  const memory = () => {
    const data = new Map<string, string>()
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
  }

  test('保存して読み戻せる', () => {
    const store = memory()
    const result = spin(createInitialState(), melody.id, fixed(0), ['ゆい'], now)
    if (!result.ok) throw new Error(result.error)
    expect(saveState(store, result.state)).toBe(true)
    expect(loadState(store)).toEqual(result.state)
  })

  test('壊れたデータ・古い形式・未知の在庫は最初の状態に戻す', () => {
    const initial = createInitialState()
    expect(parseState(null)).toEqual(initial)
    expect(parseState('{')).toEqual(initial)
    expect(parseState(JSON.stringify({ version: 2 }))).toEqual(initial)
    expect(parseState(JSON.stringify({ ...initial, wins: [{ id: 1 }] }))).toEqual(initial)
    const [first, second] = melody.prizes
    const tampered = parseState(JSON.stringify({ ...initial, nickname: '', welcomed: 'yes', stock: { [melody.id]: { [first.id]: 99, [second.id]: -1 }, other: 3 } }))
    expect(tampered.stock[melody.id][first.id]).toBe(first.total)
    expect(tampered.stock[melody.id][second.id]).toBe(initial.stock[melody.id][second.id])
    expect(tampered.nickname).toBe('あなた')
    expect(tampered.welcomed).toBe(false)
    const unknownWin = { id: 'w9', gachaId: 'gone', prizeId: 'gone', spent: 100, wonAt: now.toISOString(), companions: [], status: 'kept' }
    expect(parseState(JSON.stringify({ ...initial, wins: [unknownWin] })).wins).toEqual([])
    expect(parseState(JSON.stringify(initial))).toEqual(initial)
  })

  test('ストレージが使えなくても落ちない', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('full') } }
    expect(loadState(broken)).toEqual(createInitialState())
    expect(saveState(broken, createInitialState())).toBe(false)
    expect(saveState(undefined, createInitialState())).toBe(false)
    expect(loadState(undefined)).toEqual(createInitialState())
    expect(STORAGE_KEY).toBe('lastpiece_app_v1')
  })
})

describe('回す前の確認（T08）', () => {
  test('支払う前に、1回のコイン・引いた後の残高・足りない分を出す', () => {
    const state = createInitialState()
    expect(spinQuote(state, melody)).toEqual({ price: 1500, balance: STARTER_COINS, after: STARTER_COINS - 1500, shortBy: 0 })
    expect(spinQuote({ ...state, coins: 1500 }, melody)).toEqual({ price: 1500, balance: 1500, after: 0, shortBy: 0 })
    expect(spinQuote({ ...state, coins: 100 }, melody)).toEqual({ price: 1500, balance: 100, after: 0, shortBy: 1400 })
  })

  test('目玉の候補は、残っている目玉のうち参考価格がいちばん高いもの', () => {
    const stock = createInitialState().stock
    expect(featuredCandidate(melody, stock)?.name).toBe('会場限定ドレスマスコット')
    const gone = { ...stock, [melody.id]: { ...stock[melody.id], [melody.prizes[0].id]: 0 } }
    expect(featuredCandidate(melody, gone)?.name).toBe('周年限定ぬいぐるみ')
    const none = { ...stock, [melody.id]: Object.fromEntries(melody.prizes.map((prize) => [prize.id, 0])) }
    expect(featuredCandidate(melody, none)?.name).toBe('会場限定ドレスマスコット')
    expect(featuredCandidate({ ...melody, prizes: melody.prizes.filter((prize) => prize.glow !== 'featured') }, stock)).toBeNull()
  })
})
