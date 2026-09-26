import { generateKeyPairSync, createVerify } from 'node:crypto'
import { expect, test } from 'vitest'
import {
  DEMO_EVENTS, DEMO_PATH, LP_PATH, buildGa4Requests, buildServiceAccountJwt, fetchClarity, fetchGa4, renderMarkdown, run, summarizeClarity, summarizeGa4,
} from './metrics-report.mjs'

const row = (dims, mets) => ({ dimensionValues: dims.map((v) => ({ value: v })), metricValues: mets.map((v) => ({ value: String(v) })) })

const landing = { rows: [row([LP_PATH], [25, 10, 24, 24, 42.5, 1.4, 6])] }
const funnel = { rows: [
  row([LP_PATH, LP_PATH], [25, 30]),
  row([LP_PATH, `${DEMO_PATH}`], [8, 9]),
  row([LP_PATH, `${DEMO_PATH}#/gacha/x`], [5, 7]),
] }
const events = { rows: [row(['demo_start'], [7, 7, 6]), row(['spin_first'], [4, 4, 4])] }

test('GA4 の要求: 期間・LP の絞り込み・デモのイベントの一覧', () => {
  const r = buildGa4Requests({ days: 7 })
  expect(r.landing.dateRanges[0]).toEqual({ startDate: '7daysAgo', endDate: 'yesterday' })
  expect(r.landing.dimensionFilter.filter.stringFilter.value).toBe(LP_PATH)
  expect(r.funnel.dimensions.map((d) => d.name)).toEqual(['landingPage', 'pagePath'])
  expect(r.events.dimensionFilter.filter.inListFilter.values).toEqual(DEMO_EVENTS)
})

test('GA4 の要約: しっかり見た割合・デモへの到達（複数ページは最大値で下限、合算で上限）', () => {
  const s = summarizeGa4({ landing, funnel, events })
  expect(s.sessions).toBe(25)
  expect(s.engaged).toBe(10)
  expect(s.engagedRate).toBe(40)
  expect(s.scrolledUsers).toBe(6)
  expect(s.scrolledRate).toBe(25)
  expect(s.avgDurationSec).toBe(43)
  expect(s.pagesPerSession).toBe(1.4)
  expect(s.toDemoSessions).toBe(8)
  expect(s.toDemoSessionsUpper).toBe(13)
  expect(s.toDemoRate).toBe(32)
  expect(s.pages[0]).toEqual({ path: LP_PATH, sessions: 25, views: 30 })
  expect(s.events.demo_start).toEqual({ count: 7, sessions: 7, users: 6 })
})

test('GA4 の要約: プロパティ全体と入口の一覧（LP が 0 のときの手がかり）', () => {
  const overview = { rows: [row(['/other/'], [12, 10]), row([LP_PATH], [3, 3])] }
  const total = { rows: [row([], [40, 33])] } // 次元なしの合計は上位 10 件の合計より大きい
  const s = summarizeGa4({ landing: {}, funnel: {}, events: {}, overview, total })
  expect(s.allSessions).toBe(40)
  expect(summarizeGa4({ landing: {}, funnel: {}, events: {}, overview }).allSessions).toBe(15)
  expect(s.topLanding[0]).toEqual({ path: '/other/', sessions: 12, users: 10 })
  const md = renderMarkdown({ days: 7, ga4: s, clarity: null })
  expect(md).toContain('プロパティ全体のセッションは **40 件**です。')
  expect(md).toContain('| `/other/` | 12 | 10 |')
  const zero = renderMarkdown({ days: 7, ga4: summarizeGa4({ landing: {}, funnel: {}, events: {}, overview: {} }), clarity: null })
  expect(zero).toContain('GA4_PROPERTY_ID')
})

test('GA4 の要約: 行が無いときは 0 と割合なし', () => {
  const s = summarizeGa4({ landing: {}, funnel: {}, events: {} })
  expect(s.sessions).toBe(0)
  expect(s.engagedRate).toBeNull()
  expect(s.toDemoRate).toBeNull()
  expect(s.events).toEqual({})
})

const clarityPayload = [
  { metricName: 'Traffic', information: [
    { URL: 'https://doc-gif.github.io/lastpiece-lp/', totalSessionCount: '30', totalBotSessionCount: '12', distinctUserCount: '28', pagesPerSessionPercentage: '1.0' },
    { URL: 'https://doc-gif.github.io/lastpiece-lp/?utm_source=x', totalSessionCount: '10', totalBotSessionCount: '4', distinctUserCount: '24', pagesPerSessionPercentage: '2.0' },
    { URL: 'https://doc-gif.github.io/jtcc-group-e/', totalSessionCount: '9', totalBotSessionCount: '1', distinctUserCount: '8', pagesPerSessionPercentage: '3.2' },
  ] },
  { metricName: 'ScrollDepth', information: [
    { URL: 'https://doc-gif.github.io/lastpiece-lp/', averageScrollDepth: '30' },
    { URL: 'https://doc-gif.github.io/lastpiece-lp/?utm_source=x', averageScrollDepth: '60' },
  ] },
  { metricName: 'EngagementTime', information: [{ URL: 'https://doc-gif.github.io/lastpiece-lp/', totalTime: '900', activeTime: '400' }] },
  { metricName: 'DeadClickCount', information: [
    { URL: 'https://doc-gif.github.io/lastpiece-lp/', sessionsWithMetricPercentage: '10', sessionsCount: '3' },
    { URL: 'https://doc-gif.github.io/lastpiece-lp/?utm_source=x', sessionsWithMetricPercentage: '40', sessionsCount: '4' },
  ] },
  { metricName: 'RageClickCount', information: [{ URL: 'https://doc-gif.github.io/lastpiece-lp/', sessionsWithMetricPercentage: '0' }] },
]
// 次元なし（プロジェクト全体）。重複のない数
const clarityTotals = [
  { metricName: 'Traffic', information: [{ totalSessionCount: '36', totalBotSessionCount: '17', distinctUserCount: '33', pagesPerSessionPercentage: '1.3' }] },
  { metricName: 'ScrollDepth', information: [{ averageScrollDepth: '37.5' }] },
  { metricName: 'EngagementTime', information: [{ totalTime: '900', activeTime: '400' }] },
  { metricName: 'DeadClickCount', information: [{ sessionsWithMetricPercentage: '17.5', sessionsCount: '7' }] },
  { metricName: 'RageClickCount', information: [{ sessionsWithMetricPercentage: '0' }] },
]

test('Clarity の要約: URL で LP とデモに分け、平均はセッション数で重み付けする（手計算と一致）', () => {
  const c = summarizeClarity(clarityPayload, clarityTotals)
  // LP: 30 + 10 セッション。ページ/セッション = (1.0×30 + 2.0×10) / 40 = 1.25。スクロール = (30×30 + 60×10) / 40 = 37.5。デッドクリック = (10×30 + 40×10) / 40 = 17.5
  expect(c.lp).toMatchObject({ sessions: 40, botSessions: 16, users: 52, pagesPerSession: 1.25, averageScrollDepth: 37.5, activeTimeSec: 400, deadClickRate: 17.5, rageClickRate: 0 })
  expect(c.demo).toMatchObject({ sessions: 9, botSessions: 1, users: 8, pagesPerSession: 3.2, averageScrollDepth: null, deadClickRate: null })
  // プロジェクト全体は次元なしの値をそのまま使う（ユーザーの重複なし: 33 < LP の合計 52）
  expect(c.project).toMatchObject({ sessions: 36, botSessions: 17, users: 33, pagesPerSession: 1.3, averageScrollDepth: 37.5, deadClickRate: 17.5 })
})

test('Clarity の要約: 全体が無いときは null、空でも落ちない', () => {
  expect(summarizeClarity(clarityPayload).project).toBeNull()
  expect(summarizeClarity({ metrics: [] }).lp.sessions).toBe(0)
  expect(summarizeClarity(null).demo.users).toBe(0)
  expect(summarizeClarity(null).lp.pagesPerSession).toBeNull()
})

test('GA4 の要約: 検算（割合・重み付け平均・到達の下限と上限）', () => {
  // 入口が 2 行: 20 セッション（滞在 30 秒、1.2 ページ）と 5 セッション（滞在 90 秒、2.0 ページ）
  const landing2 = { rows: [row([LP_PATH], [20, 8, 19, 18, 30, 1.2, 4]), row([`${LP_PATH}?utm=a`], [5, 2, 5, 5, 90, 2.0, 2])] }
  const s = summarizeGa4({ landing: landing2, funnel, events: {} })
  expect(s.sessions).toBe(25)
  expect(s.engaged).toBe(10)
  expect(s.engagedRate).toBe(40) // 10 / 25
  expect(s.users).toBe(24)
  expect(s.scrolledUsers).toBe(6)
  expect(s.scrolledRate).toBe(25) // 6 / 24
  expect(s.avgDurationSec).toBe(42) // (30×20 + 90×5) / 25 = 42
  expect(s.pagesPerSession).toBe(1.36) // (1.2×20 + 2.0×5) / 25 = 1.36
  expect(s.toDemoSessions).toBe(8) // max(8, 5)
  expect(s.toDemoSessionsUpper).toBe(13) // 8 + 5
  expect(s.toDemoRate).toBe(32) // 8 / 25
  // 上限は LP のセッション総数を超えない（ページ別の合計 8 + 5 + 20 = 33 > 25 → 25。割合は 100% を超えない）
  const many = { rows: [row([LP_PATH, `${DEMO_PATH}`], [8, 9]), row([LP_PATH, `${DEMO_PATH}#/a`], [5, 7]), row([LP_PATH, `${DEMO_PATH}#/b`], [20, 21])] }
  const capped = summarizeGa4({ landing: landing2, funnel: many, events: {} })
  expect(capped.toDemoSessions).toBe(20)
  expect(capped.toDemoSessionsUpper).toBe(25)
  expect(renderMarkdown({ days: 7, ga4: capped, clarity: null })).toContain('| 上限 | 25 件 | 100% |')
})

test('Markdown: 要約・定義の列・下限と上限・未設定の表示。秘密は出さない', () => {
  const md = renderMarkdown({ days: 7, ga4: summarizeGa4({ landing, funnel, events }), clarity: null, errors: ['Clarity: 401'] }, new Date('2026-09-26T10:00:00Z'))
  expect(md).toContain('### 要約')
  expect(md).toContain('LP に入ったセッションは **25** 件です。')
  expect(md).toContain('**8（32%）** 以上です（上限は 13 件）')
  expect(md).toContain('| 下限 | 8 件 | 32% |')
  expect(md).toContain('| 上限 | 13 件 | 52% |')
  expect(md).toContain('| 指標 | 値 | 定義 |')
  expect(md).toContain('| `demo_start` | 7 | 7 | 6 |')
  expect(md).toContain('Clarity は未設定です')
  expect(md).toContain('- Clarity: 401')
  expect(md).toContain('_Generated by [Claude Code]')
  expect(md).not.toContain('—')
  const withClarity = renderMarkdown({ days: 7, ga4: summarizeGa4({ landing: {}, funnel: {}, events: {} }), clarity: summarizeClarity(clarityPayload, clarityTotals) })
  expect(withClarity).toContain('イベントはまだ届いていません')
  expect(withClarity).toContain('| セッション | 36 | 40 | 9 |')
  expect(withClarity).toContain('| ユーザー | 33 | 52 | 8 |')
  expect(withClarity).toContain('Clarity のセッションは **36** 件で')
  const noTotals = renderMarkdown({ days: 7, ga4: null, clarity: summarizeClarity(clarityPayload) })
  expect(noTotals).toContain('| セッション | データなし | 40 | 9 |')
})

test('サービスアカウントの JWT: RS256 で署名され、iss・scope・exp が入る', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' })
  const jwt = buildServiceAccountJwt({ client_email: 'sa@example.iam.gserviceaccount.com', private_key: pem }, { now: 1_000_000 })
  const [h, c, sig] = jwt.split('.')
  const dec = (s) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
  expect(dec(h)).toEqual({ alg: 'RS256', typ: 'JWT' })
  expect(dec(c)).toMatchObject({ iss: 'sa@example.iam.gserviceaccount.com', aud: 'https://oauth2.googleapis.com/token', iat: 1_000_000, exp: 1_003_600 })
  expect(dec(c).scope).toContain('analytics.readonly')
  const v = createVerify('RSA-SHA256'); v.update(`${h}.${c}`)
  expect(v.verify(publicKey, Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))).toBe(true)
  expect(() => buildServiceAccountJwt({})).toThrow(/client_email/)
})

const fakeFetch = (routes) => async (url, init = {}) => {
  for (const [match, handler] of routes) if (String(url).includes(match)) return handler(url, init)
  return { ok: false, status: 404, text: async () => 'no route', json: async () => ({}) }
}
const okJson = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) })

test('GA4 の取得: トークン → 3 つの runReport を property に送る', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const sa = { client_email: 'sa@x', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }
  const calls = []
  const f = fakeFetch([
    ['oauth2.googleapis.com/token', (u, i) => { calls.push(['token', i.body.get('grant_type')]); return okJson({ access_token: 'tok' }) }],
    [':runReport', (u, i) => { const b = JSON.parse(i.body); calls.push(['report', String(u), i.headers.authorization, (b.dimensions ?? []).map((d) => d.name).join('+')]); return okJson(!b.dimensions ? { rows: [] } : b.dimensions[0].name === 'eventName' ? events : b.dimensions.length === 2 ? funnel : b.orderBys ? { rows: [] } : landing) }],
  ])
  const s = await fetchGa4({ propertyId: '123456', saKey: JSON.stringify(sa), days: 7, fetchImpl: f })
  expect(calls[0]).toEqual(['token', 'urn:ietf:params:oauth:grant-type:jwt-bearer'])
  expect(calls.filter((c) => c[0] === 'report')).toHaveLength(5)
  expect(calls[1][1]).toContain('/properties/123456:runReport')
  expect(calls[1][2]).toBe('Bearer tok')
  expect(s.toDemoSessions).toBe(8)
})

test('Clarity の取得: Bearer と numOfDays=3 で URL 別と全体の 2 回。全体が失敗しても URL 別で続ける。URL 別の失敗は例外', async () => {
  const urls = []
  const f = fakeFetch([['clarity.ms/export-data', (u, i) => { urls.push(String(u)); expect(i.headers.authorization).toBe('Bearer ct'); return okJson(String(u).includes('dimension1=URL') ? clarityPayload : clarityTotals) }]])
  const c = await fetchClarity({ token: 'ct', fetchImpl: f })
  expect(urls).toHaveLength(2)
  expect(urls[0]).toContain('numOfDays=3&dimension1=URL')
  expect(urls[1]).toMatch(/numOfDays=3$/)
  expect(c.lp.sessions).toBe(40)
  expect(c.project.sessions).toBe(36)
  const onlyUrl = await fetchClarity({ token: 'ct', fetchImpl: fakeFetch([['dimension1=URL', () => okJson(clarityPayload)], ['clarity.ms', () => ({ ok: false, status: 429, text: async () => 'limit' })]]) })
  expect(onlyUrl.project).toBeNull()
  await expect(fetchClarity({ token: 'ct', fetchImpl: fakeFetch([['clarity.ms', () => ({ ok: false, status: 401, text: async () => 'bad token' })]]) })).rejects.toThrow(/401/)
})

test('run: 秘密が無い取得元は飛ばし、あるものの失敗はエラー欄に出る', async () => {
  const out = []
  const r = await run({ env: { CLARITY_TOKEN: 'ct' }, args: ['--days', '3'], fetchImpl: fakeFetch([['clarity.ms', () => ({ ok: false, status: 500, text: async () => 'boom' })]]), log: (m) => out.push(m) })
  expect(r.ga4).toBeNull()
  expect(r.clarity).toBeNull()
  expect(r.errors[0]).toMatch(/Clarity: .*500/)
  expect(out[0]).toContain('GA4 は未設定です')
  expect(out[0]).not.toContain('ct')
})

test('CLI: 秘密が無ければ正常終了（0）、設定済みの取得元が失敗したら 2', async () => {
  const { spawnSync } = await import('node:child_process')
  const ok = spawnSync(process.execPath, ['scripts/metrics-report.mjs', '--days', '3'], { env: { PATH: process.env.PATH }, encoding: 'utf8' })
  expect(ok.status).toBe(0)
  expect(ok.stdout).toContain('GA4 は未設定です')
  const bad = spawnSync(process.execPath, ['scripts/metrics-report.mjs'], { env: { PATH: process.env.PATH, CLARITY_TOKEN: 'x', HTTPS_PROXY: 'http://127.0.0.1:9', https_proxy: 'http://127.0.0.1:9' }, encoding: 'utf8', timeout: 20000 })
  expect(bad.status).toBe(2)
  expect(bad.stdout).toContain('取得できなかったもの')
})
