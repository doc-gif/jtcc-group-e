#!/usr/bin/env node
// 計測の集計: GA4（Data API）と Clarity（Data Export API）から、LP をしっかり見た人・デモに進んだ割合を出す。
// 使い方: GA4_PROPERTY_ID・GA4_SA_KEY（サービスアカウントの JSON）・CLARITY_TOKEN を環境変数で渡し
//   node scripts/metrics-report.mjs --days 7 [--out path.md]
// 秘密が無い取得元は飛ばす（結果に「未設定」と書く）。手順は docs/METRICS.md。
import { createSign } from 'node:crypto'
import { writeFileSync } from 'node:fs'

export const LP_PATH = '/lastpiece-lp/'
export const DEMO_PATH = '/jtcc-group-e/'
/** デモ側の計測イベント（#42〜#45）。本番公開後に出る。 */
export const DEMO_EVENTS = ['demo_start', 'spin', 'spin_first', 'room_create', 'room_join', 'room_ready', 'round_start', 'result_view', 'exchange', 'deliver']

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)

// ---------- GA4: 要求の組み立て ----------

/** GA4 Data API の runReport 本文。LP に入ったセッションの概況・デモへの到達・デモのイベント。 */
export function buildGa4Requests({ days = 7, lpPath = LP_PATH } = {}) {
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }]
  const landingIsLp = { filter: { fieldName: 'landingPage', stringFilter: { matchType: 'CONTAINS', value: lpPath } } }
  return {
    // LP に入ったセッションの概況
    landing: {
      dateRanges,
      dimensions: [{ name: 'landingPage' }],
      metrics: [
        { name: 'sessions' }, { name: 'engagedSessions' }, { name: 'totalUsers' }, { name: 'newUsers' },
        { name: 'averageSessionDuration' }, { name: 'screenPageViewsPerSession' }, { name: 'scrolledUsers' },
      ],
      dimensionFilter: landingIsLp,
    },
    // LP に入ったセッションのうち、どのページを見たか（デモのページを含むセッション数）
    funnel: {
      dateRanges,
      dimensions: [{ name: 'landingPage' }, { name: 'pagePath' }],
      metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }],
      dimensionFilter: landingIsLp,
      limit: 200,
    },
    // プロパティ全体の合計（次元なし。上位 N 件に依存しない総数）
    total: { dateRanges, metrics: [{ name: 'sessions' }, { name: 'totalUsers' }] },
    // 入口の上位 10 件（一覧専用。LP が 0 のとき、入口の URL が想定と違うかを見分ける）
    overview: {
      dateRanges,
      dimensions: [{ name: 'landingPage' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    },
    // デモ側のイベント（本番公開後）
    events: {
      dateRanges,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }, { name: 'sessions' }, { name: 'totalUsers' }],
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: DEMO_EVENTS } } },
    },
  }
}

const rowsOf = (report) => (report?.rows ?? []).map((r) => ({ d: (r.dimensionValues ?? []).map((v) => v.value), m: (r.metricValues ?? []).map((v) => num(v.value)) }))

/** GA4 の 3 つの結果を 1 つの要約にする。 */
export function summarizeGa4({ landing, funnel, events, overview, total }, { demoPath = DEMO_PATH } = {}) {
  const l = rowsOf(landing)
  const sum = (i) => l.reduce((a, r) => a + r.m[i], 0)
  const sessions = sum(0)
  const engaged = sum(1)
  const users = sum(2)
  const newUsers = sum(3)
  // 平均滞在・ページ/セッションはセッション数で重み付け
  const avgDuration = sessions ? l.reduce((a, r) => a + r.m[4] * r.m[0], 0) / sessions : 0
  const pagesPerSession = sessions ? l.reduce((a, r) => a + r.m[5] * r.m[0], 0) / sessions : 0
  const scrolledUsers = sum(6)

  const f = rowsOf(funnel)
  const demoRows = f.filter((r) => (r.d[1] ?? '').includes(demoPath))
  const toDemoSessions = demoRows.reduce((a, r) => Math.max(a, r.m[0]), 0) // 同じセッションが複数のデモページを見るので最大値を使う（下限の見積もり）
  const toDemoSessionsUpper = demoRows.reduce((a, r) => a + r.m[0], 0)
  const pages = f.map((r) => ({ path: r.d[1], sessions: r.m[0], views: r.m[1] })).sort((a, b) => b.sessions - a.sessions).slice(0, 10)

  const ev = Object.fromEntries(rowsOf(events).map((r) => [r.d[0], { count: r.m[0], sessions: r.m[1], users: r.m[2] }]))
  const ov = rowsOf(overview)
  const tot = rowsOf(total)[0]
  const allSessions = tot ? tot.m[0] : ov.reduce((a, r) => a + r.m[0], 0) // 次元なしの合計。無ければ一覧の合計で代える
  const topLanding = ov.slice(0, 10).map((r) => ({ path: r.d[0], sessions: r.m[0], users: r.m[1] }))

  return {
    sessions, engaged, engagedRate: pct(engaged, sessions), users, newUsers,
    avgDurationSec: Math.round(avgDuration), pagesPerSession: Math.round(pagesPerSession * 100) / 100,
    scrolledUsers, scrolledRate: pct(scrolledUsers, users),
    toDemoSessions, toDemoSessionsUpper, toDemoRate: pct(toDemoSessions, sessions),
    pages, events: ev,
    allSessions, topLanding,
  }
}

// ---------- Clarity ----------

/** Clarity Data Export API の結果（metricName ごとの information 配列）を URL 別に要約する。 */
export function summarizeClarity(payload, { lpPart = 'lastpiece-lp', demoPart = 'jtcc-group-e' } = {}) {
  const metrics = Array.isArray(payload) ? payload : payload?.metrics ?? []
  const byName = Object.fromEntries(metrics.map((m) => [m.metricName, m.information ?? []]))
  const pick = (rows, part) => rows.filter((r) => (r.URL ?? r.Url ?? r.url ?? '').includes(part))
  const total = (rows, key) => rows.reduce((a, r) => a + num(r[key]), 0)
  const site = (part) => {
    const traffic = pick(byName.Traffic ?? [], part)
    const scroll = pick(byName.ScrollDepth ?? [], part)
    const engage = pick(byName.EngagementTime ?? [], part)
    const dead = pick(byName.DeadClickCount ?? [], part)
    const rage = pick(byName.RageClickCount ?? [], part)
    const sessions = total(traffic, 'totalSessionCount')
    const scrollAvg = scroll.length ? scroll.reduce((a, r) => a + num(r.averageScrollDepth), 0) / scroll.length : null
    return {
      sessions,
      botSessions: total(traffic, 'totalBotSessionCount'),
      users: total(traffic, 'distinctUserCount'),
      pagesPerSession: traffic.length ? Math.round((traffic.reduce((a, r) => a + num(r.pagesPerSessionPercentage ?? r.PagesPerSessionPercentage), 0) / traffic.length) * 100) / 100 : null,
      averageScrollDepth: scrollAvg === null ? null : Math.round(scrollAvg * 10) / 10,
      activeTimeSec: total(engage, 'activeTime'),
      deadClickRate: dead.length ? Math.round(dead.reduce((a, r) => a + num(r.sessionsWithMetricPercentage), 0) / dead.length * 10) / 10 : null,
      rageClickRate: rage.length ? Math.round(rage.reduce((a, r) => a + num(r.sessionsWithMetricPercentage), 0) / rage.length * 10) / 10 : null,
    }
  }
  return { lp: site(lpPart), demo: site(demoPart) }
}

// ---------- 表示 ----------

const fmtPct = (v) => (v === null || v === undefined ? '—' : `${v}%`)
const fmtNum = (v) => (v === null || v === undefined ? '—' : String(v))

export function renderMarkdown({ days, ga4, clarity, errors = [] }, now = new Date()) {
  const lines = []
  lines.push(`## 計測の集計（${now.toISOString().slice(0, 16).replace('T', ' ')} UTC・GA4 は過去 ${days} 日、Clarity は過去 3 日）`)
  lines.push('')
  if (ga4) {
    lines.push('### GA4: LP に入ったセッション')
    lines.push('')
    lines.push('| 指標 | 値 |')
    lines.push('| --- | --- |')
    lines.push(`| セッション | ${ga4.sessions}（ユーザー ${ga4.users}、新規 ${ga4.newUsers}） |`)
    lines.push(`| しっかり見た（エンゲージのあったセッション: 10 秒以上か 2 ページ以上） | ${ga4.engaged}（${fmtPct(ga4.engagedRate)}） |`)
    lines.push(`| 90% までスクロールしたユーザー | ${ga4.scrolledUsers}（${fmtPct(ga4.scrolledRate)}） |`)
    lines.push(`| 平均滞在 | ${ga4.avgDurationSec} 秒 |`)
    lines.push(`| ページ / セッション | ${ga4.pagesPerSession} |`)
    lines.push(`| **デモ（${DEMO_PATH}）のページも見たセッション** | **${ga4.toDemoSessions}（${fmtPct(ga4.toDemoRate)}）**${ga4.toDemoSessionsUpper > ga4.toDemoSessions ? `（デモ内の複数ページを合算すると最大 ${ga4.toDemoSessionsUpper}）` : ''} |`)
    lines.push('')
    if (ga4.pages.length) {
      lines.push('LP から入って見たページ（セッション数の多い順、上位 10）')
      lines.push('')
      lines.push('| ページ | セッション | 表示 |')
      lines.push('| --- | --- | --- |')
      for (const p of ga4.pages) lines.push(`| \`${p.path}\` | ${p.sessions} | ${p.views} |`)
      lines.push('')
    }
    if (ga4.sessions === 0) {
      lines.push(`LP のセッションが 0 です。プロパティ全体のセッション（同じ期間）: **${ga4.allSessions}**。`)
      if (ga4.allSessions === 0) lines.push('プロパティ全体も 0 なので、`GA4_PROPERTY_ID` が測定 ID `G-3DDS1NJZXS` のプロパティか、LP が GA4 に送っているか、データの反映（最大 24〜48 時間）を確かめてください。')
      else {
        lines.push('全体には来ているので、入口の URL が `' + LP_PATH + '` と違う可能性があります。多い入口:')
        lines.push('')
        lines.push('| 入口（landingPage） | セッション | ユーザー |')
        lines.push('| --- | --- | --- |')
        for (const t of ga4.topLanding) lines.push(`| \`${t.path}\` | ${t.sessions} | ${t.users} |`)
      }
      lines.push('')
    }
    const evNames = Object.keys(ga4.events)
    lines.push('### GA4: デモ側のイベント')
    lines.push('')
    if (!evNames.length) lines.push('まだ届いていない（デモの計測は本番公開後に送られる。#97 の公開待ち）。')
    else {
      lines.push('| イベント | 回数 | セッション | ユーザー |')
      lines.push('| --- | --- | --- | --- |')
      for (const n of DEMO_EVENTS) if (ga4.events[n]) lines.push(`| ${n} | ${ga4.events[n].count} | ${ga4.events[n].sessions} | ${ga4.events[n].users} |`)
    }
    lines.push('')
  } else lines.push('GA4: 未設定（`GA4_PROPERTY_ID` と `GA4_SA_KEY`）。\n')
  if (clarity) {
    lines.push('### Clarity（過去 3 日。API の上限）')
    lines.push('')
    lines.push('| 指標 | LP | デモ |')
    lines.push('| --- | --- | --- |')
    const c = clarity
    lines.push(`| セッション（ボット除外数） | ${c.lp.sessions}（${c.lp.botSessions}） | ${c.demo.sessions}（${c.demo.botSessions}） |`)
    lines.push(`| ユニークユーザー | ${c.lp.users} | ${c.demo.users} |`)
    lines.push(`| ページ / セッション | ${fmtNum(c.lp.pagesPerSession)} | ${fmtNum(c.demo.pagesPerSession)} |`)
    lines.push(`| スクロールの奥行き（平均） | ${fmtPct(c.lp.averageScrollDepth)} | ${fmtPct(c.demo.averageScrollDepth)} |`)
    lines.push(`| 操作していた時間（合計秒） | ${c.lp.activeTimeSec} | ${c.demo.activeTimeSec} |`)
    lines.push(`| デッドクリック（セッション比） | ${fmtPct(c.lp.deadClickRate)} | ${fmtPct(c.demo.deadClickRate)} |`)
    lines.push(`| イライラしたクリック（セッション比） | ${fmtPct(c.lp.rageClickRate)} | ${fmtPct(c.demo.rageClickRate)} |`)
    lines.push('')
  } else lines.push('Clarity: 未設定（`CLARITY_TOKEN`）。\n')
  lines.push('注: 「1 セッションが何ページ見たか」の分布は GA4 Data API・Clarity API では取れない（BigQuery エクスポートが要る）。LP は 1 ページなので、2 ページ目以降はほぼ「デモへ進んだ」と読める。localhost・プレビュー・`?internal=1` は送信元で除外済み。')
  if (errors.length) { lines.push(''); lines.push('### 取得できなかったもの'); for (const e of errors) lines.push(`- ${e}`) }
  lines.push('')
  lines.push('---')
  lines.push('_Generated by [Claude Code](https://claude.ai/code)_')
  return lines.join('\n')
}

// ---------- Google の認証（サービスアカウント → アクセストークン） ----------

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

/** サービスアカウントの JSON から JWT を作る（RS256）。scope は Analytics の読み取りだけ。 */
export function buildServiceAccountJwt(sa, { now = Math.floor(Date.now() / 1000), scope = 'https://www.googleapis.com/auth/analytics.readonly' } = {}) {
  if (!sa?.client_email || !sa?.private_key) throw new Error('GA4_SA_KEY に client_email と private_key が要る')
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = b64url(signer.sign(sa.private_key))
  return `${header}.${claims}.${signature}`
}

export async function getGoogleAccessToken(sa, fetchImpl = fetch) {
  const assertion = buildServiceAccountJwt(sa)
  const res = await fetchImpl(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) throw new Error(`Google のトークン取得に失敗: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  if (!json.access_token) throw new Error('Google のトークンが空')
  return json.access_token
}

// ---------- 取得 ----------

export async function fetchGa4({ propertyId, saKey, days, fetchImpl = fetch }) {
  const sa = typeof saKey === 'string' ? JSON.parse(saKey) : saKey
  const token = await getGoogleAccessToken(sa, fetchImpl)
  const requests = buildGa4Requests({ days })
  const out = {}
  for (const [name, body] of Object.entries(requests)) {
    const res = await fetchImpl(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`GA4 ${name} の取得に失敗: ${res.status} ${(await res.text()).slice(0, 300)}`)
    out[name] = await res.json()
  }
  return summarizeGa4(out)
}

export async function fetchClarity({ token, fetchImpl = fetch }) {
  // 上限: numOfDays は 1〜3、1 日 10 回まで。URL 別に 1 回だけ取る。
  const res = await fetchImpl('https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=3&dimension1=URL', {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Clarity の取得に失敗: ${res.status} ${(await res.text()).slice(0, 300)}`)
  return summarizeClarity(await res.json())
}

export async function run({ env = process.env, args = process.argv.slice(2), fetchImpl = fetch, log = console.log } = {}) {
  const days = Math.max(1, Math.min(90, num(args[args.indexOf('--days') + 1] || env.METRICS_DAYS || 7) || 7))
  const outIdx = args.indexOf('--out')
  const errors = []
  let ga4 = null
  let clarity = null
  if (env.GA4_PROPERTY_ID && env.GA4_SA_KEY) {
    try { ga4 = await fetchGa4({ propertyId: env.GA4_PROPERTY_ID, saKey: env.GA4_SA_KEY, days, fetchImpl }) } catch (e) { errors.push(`GA4: ${e.message}`) }
  }
  if (env.CLARITY_TOKEN) {
    try { clarity = await fetchClarity({ token: env.CLARITY_TOKEN, fetchImpl }) } catch (e) { errors.push(`Clarity: ${e.message}`) }
  }
  const md = renderMarkdown({ days, ga4, clarity, errors })
  if (outIdx >= 0 && args[outIdx + 1]) writeFileSync(args[outIdx + 1], md + '\n')
  log(md)
  return { ga4, clarity, errors, markdown: md }
}

if (process.argv[1] && /metrics-report\.mjs$/.test(process.argv[1]) && import.meta.url.endsWith('/scripts/metrics-report.mjs')) {
  // 秘密が無い取得元は正常な「飛ばし」。設定済みの取得元が失敗したときだけ非成功で終わる
  run().then((r) => { if (r.errors.length) process.exitCode = 2 }).catch((e) => { console.error(e); process.exitCode = 1 })
}
