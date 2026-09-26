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
  // 上限 = ページ別セッション数の合計。同じセッションが複数ページを見ると重複するので、LP のセッション総数を超えない値に切る
  const toDemoSessionsUpper = Math.min(demoRows.reduce((a, r) => a + r.m[0], 0), sessions || Infinity)
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

/**
 * Clarity Data Export API の結果を要約する。
 * - byUrl: dimension1=URL の結果。URL の行を LP とデモに分けて足す。同じ人が複数の URL に出ると、ユーザー数は重複して数えられる。
 * - totals: 次元なしの結果（プロジェクト全体）。重複なしの数。LP とデモが同じ Clarity プロジェクトなら両方を含む。
 * 平均（ページ/セッション・スクロール・デッドクリック率・イライラしたクリック率）は、行のセッション数で重み付けする。
 */
export function summarizeClarity(byUrl, totals = null, { lpPart = 'lastpiece-lp', demoPart = 'jtcc-group-e' } = {}) {
  const metricsOf = (payload) => (Array.isArray(payload) ? payload : payload?.metrics ?? [])
  const byName = (payload) => Object.fromEntries(metricsOf(payload).map((m) => [m.metricName, m.information ?? []]))
  const urlOf = (r) => r.URL ?? r.Url ?? r.url ?? ''
  const sum = (rows, key) => rows.reduce((a, r) => a + num(r[key]), 0)
  // 各行の重み = その行（URL）のセッション数。Traffic の行から URL → セッション数の表を作る
  const summarize = (m, filter) => {
    const pick = (rows) => (rows ?? []).filter(filter)
    const traffic = pick(m.Traffic)
    const weightOf = Object.fromEntries(traffic.map((r) => [urlOf(r), num(r.totalSessionCount)]))
    const weighted = (rows, key) => {
      const rs = pick(rows).filter((r) => r[key] !== undefined && r[key] !== null)
      const w = rs.reduce((a, r) => a + (weightOf[urlOf(r)] ?? 1), 0)
      if (!rs.length || w === 0) return null
      return rs.reduce((a, r) => a + num(r[key]) * (weightOf[urlOf(r)] ?? 1), 0) / w
    }
    const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10)
    const round2 = (v) => (v === null ? null : Math.round(v * 100) / 100)
    return {
      sessions: sum(traffic, 'totalSessionCount'),
      botSessions: sum(traffic, 'totalBotSessionCount'),
      users: sum(traffic, 'distinctUserCount'),
      pagesPerSession: round2(weighted(m.Traffic, 'pagesPerSessionPercentage') ?? weighted(m.Traffic, 'PagesPerSessionPercentage')),
      averageScrollDepth: round1(weighted(m.ScrollDepth, 'averageScrollDepth')),
      activeTimeSec: sum(pick(m.EngagementTime), 'activeTime'),
      deadClickRate: round1(weighted(m.DeadClickCount, 'sessionsWithMetricPercentage')),
      rageClickRate: round1(weighted(m.RageClickCount, 'sessionsWithMetricPercentage')),
    }
  }
  const m = byName(byUrl)
  const out = { lp: summarize(m, (r) => urlOf(r).includes(lpPart)), demo: summarize(m, (r) => urlOf(r).includes(demoPart)), project: null }
  if (totals) out.project = summarize(byName(totals), () => true)
  return out
}

// ---------- 表示 ----------
// 文面は Google のテクニカルライティングの指針に合わせる: 要約を先に、1 文に 1 つの内容、用語は表で定義、能動態、値には単位。

const NA = 'データなし'
const fmtPct = (v) => (v === null || v === undefined ? NA : `${v}%`)
const fmtNum = (v, unit = '') => (v === null || v === undefined ? NA : `${v}${unit}`)
const countWithRate = (count, rate) => (rate === null || rate === undefined ? `${count}` : `${count}（${rate}%）`)

export function renderMarkdown({ days, ga4, clarity, errors = [] }, now = new Date()) {
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ')
  const L = []
  L.push(`## 計測レポート`)
  L.push('')
  L.push(`- 生成: ${stamp} UTC`)
  L.push(`- 対象期間: GA4 は昨日までの ${days} 日間。Clarity は直近 3 日間（API の上限）。`)
  L.push(`- 対象: LP（\`${LP_PATH}\`）とデモ（\`${DEMO_PATH}\`）。どちらも同じ GA4 プロパティに送る。`)
  L.push('')

  // 要約
  L.push('### 要約')
  L.push('')
  if (ga4) {
    L.push(`- LP に入ったセッションは **${ga4.sessions}** 件です。`)
    L.push(`- そのうちしっかり見たセッションは **${countWithRate(ga4.engaged, ga4.engagedRate)}** です。`)
    L.push(`- デモのページまで進んだセッションは **${countWithRate(ga4.toDemoSessions, ga4.toDemoRate)}** 以上です${ga4.toDemoSessionsUpper > ga4.toDemoSessions ? `（上限は ${ga4.toDemoSessionsUpper} 件）` : ''}。`)
  } else L.push('- GA4 は未設定です。`GA4_PROPERTY_ID` と `GA4_SA_KEY` を設定すると LP からデモへの到達率が出ます。')
  if (clarity) {
    const c = clarity.project ?? clarity.lp
    L.push(`- Clarity のセッションは **${c.sessions}** 件で、スクロールの奥行きは平均 **${fmtPct(c.averageScrollDepth)}**、デッドクリックが起きたセッションは **${fmtPct(c.deadClickRate)}** です。`)
  } else L.push('- Clarity は未設定です。`CLARITY_TOKEN` を設定すると操作の質（スクロール・デッドクリック）が出ます。')
  L.push('')

  if (ga4) {
    L.push('### GA4: LP に入ったセッション')
    L.push('')
    L.push('| 指標 | 値 | 定義 |')
    L.push('| --- | --- | --- |')
    L.push(`| セッション | ${ga4.sessions} 件 | 入口のページが LP だったセッションの数 |`)
    L.push(`| ユーザー | ${ga4.users} 人（新規 ${ga4.newUsers} 人） | 上のセッションを持つユーザーの数。入口ページの行を足しているため、同じ人が別の入口から入ると重複して数える |`)
    L.push(`| しっかり見たセッション | ${countWithRate(ga4.engaged, ga4.engagedRate)} | GA4 の「エンゲージのあったセッション」。10 秒より長く滞在した、または 2 ページ以上見たセッション。割合の分母はセッション |`)
    L.push(`| 90% までスクロールしたユーザー | ${countWithRate(ga4.scrolledUsers, ga4.scrolledRate)} | ページの 90% の深さまでスクロールしたユーザー。割合の分母はユーザー |`)
    L.push(`| 平均滞在時間 | ${ga4.avgDurationSec} 秒 | セッションの長さの平均。入口ページの行をセッション数で重み付けして平均する |`)
    L.push(`| 1 セッションあたりの表示ページ数 | ${ga4.pagesPerSession} ページ | 同上の重み付け平均。LP は 1 ページの site なので、1 を超えた分はほぼデモへの移動 |`)
    L.push('')

    L.push('### GA4: LP からデモへの到達')
    L.push('')
    L.push(`LP に入ったセッションのうち、デモ（\`${DEMO_PATH}\` で始まるページ）を 1 回以上表示したセッションの数です。GA4 はページごとにセッション数を返すため、正確な数は次の範囲にあります。`)
    L.push('')
    L.push('| 値 | 件数 | 割合 | 求め方 |')
    L.push('| --- | --- | --- | --- |')
    L.push(`| 下限 | ${ga4.toDemoSessions} 件 | ${fmtPct(ga4.toDemoRate)} | デモのページ別セッション数の最大値。1 つのセッションは同じページを 1 回だけ数える |`)
    L.push(`| 上限 | ${ga4.toDemoSessionsUpper} 件 | ${fmtPct(ga4.sessions ? Math.round((ga4.toDemoSessionsUpper / ga4.sessions) * 1000) / 10 : null)} | デモのページ別セッション数の合計。同じセッションが複数のページを見ると重複するため、LP のセッション総数を上限として切る |`)
    L.push('')
    L.push('割合の分母は「LP に入ったセッション」です。下限と上限が同じなら、その値が正確な件数です。')
    L.push('')
    if (ga4.pages.length) {
      L.push('LP から入ったセッションが表示したページ（セッション数の多い順、上位 10 件）:')
      L.push('')
      L.push('| ページ | セッション | 表示回数 |')
      L.push('| --- | --- | --- |')
      for (const p of ga4.pages) L.push(`| \`${p.path}\` | ${p.sessions} | ${p.views} |`)
      L.push('')
    }
    if (ga4.sessions === 0) {
      L.push('#### LP のセッションが 0 件のときの確認')
      L.push('')
      L.push(`同じ期間のプロパティ全体のセッションは **${ga4.allSessions} 件**です。`)
      if (ga4.allSessions === 0) {
        L.push('プロパティ全体も 0 件です。次の 3 つを順に確かめてください。')
        L.push('')
        L.push('1. `GA4_PROPERTY_ID` が、測定 ID `G-3DDS1NJZXS` のデータ ストリームを持つプロパティの ID であること。')
        L.push('2. LP のページが GA4 にデータを送っていること。')
        L.push('3. データの反映を待つこと。GA4 は最大 24〜48 時間遅れます。')
      } else {
        L.push(`プロパティ全体には来ています。入口の URL が \`${LP_PATH}\` と違う可能性があります。多い入口:`)
        L.push('')
        L.push('| 入口のページ | セッション | ユーザー |')
        L.push('| --- | --- | --- |')
        for (const t of ga4.topLanding) L.push(`| \`${t.path}\` | ${t.sessions} | ${t.users} |`)
      }
      L.push('')
    }

    L.push('### GA4: デモ内のイベント')
    L.push('')
    const evNames = Object.keys(ga4.events)
    if (!evNames.length) L.push('イベントはまだ届いていません。デモの計測は本番の公開後に送られます（リリース Issue #97 の公開待ち）。')
    else {
      L.push('| イベント | 回数 | セッション | ユーザー |')
      L.push('| --- | --- | --- | --- |')
      for (const n of DEMO_EVENTS) if (ga4.events[n]) L.push(`| \`${n}\` | ${ga4.events[n].count} | ${ga4.events[n].sessions} | ${ga4.events[n].users} |`)
    }
    L.push('')
  }

  if (clarity) {
    const c = clarity
    L.push('### Clarity: 操作の質')
    L.push('')
    L.push('Clarity は直近 3 日間だけ返します。「プロジェクト全体」は重複のない数です。「LP」と「デモ」は URL 別の行を足した数なので、同じ人が複数の URL に出るとユーザー数は重複します。')
    L.push('')
    L.push('| 指標 | プロジェクト全体 | LP | デモ | 定義 |')
    L.push('| --- | --- | --- | --- | --- |')
    const P = c.project
    const cell = (site, key, fmt) => (site ? fmt(site[key]) : NA)
    L.push(`| セッション | ${cell(P, 'sessions', fmtNum)} | ${c.lp.sessions} | ${c.demo.sessions} | ボットを除いたセッションの数 |`)
    L.push(`| 除外したボットのセッション | ${cell(P, 'botSessions', fmtNum)} | ${c.lp.botSessions} | ${c.demo.botSessions} | ボットと判定して除外した数 |`)
    L.push(`| ユーザー | ${cell(P, 'users', fmtNum)} | ${c.lp.users} | ${c.demo.users} | 区別できたユーザーの数。LP とデモの列は重複を含む |`)
    L.push(`| 1 セッションあたりの表示ページ数 | ${cell(P, 'pagesPerSession', (v) => fmtNum(v, ' ページ'))} | ${fmtNum(c.lp.pagesPerSession, ' ページ')} | ${fmtNum(c.demo.pagesPerSession, ' ページ')} | URL の行をセッション数で重み付けした平均 |`)
    L.push(`| スクロールの奥行き | ${cell(P, 'averageScrollDepth', fmtPct)} | ${fmtPct(c.lp.averageScrollDepth)} | ${fmtPct(c.demo.averageScrollDepth)} | ページの高さに対して、平均でどこまでスクロールしたか。同上の重み付け平均 |`)
    L.push(`| 操作していた時間 | ${cell(P, 'activeTimeSec', (v) => fmtNum(v, ' 秒'))} | ${c.lp.activeTimeSec} 秒 | ${c.demo.activeTimeSec} 秒 | 全セッションの合計。放置していた時間は含まない |`)
    L.push(`| デッドクリックが起きたセッション | ${cell(P, 'deadClickRate', fmtPct)} | ${fmtPct(c.lp.deadClickRate)} | ${fmtPct(c.demo.deadClickRate)} | 押しても何も起きないクリックがあったセッションの割合 |`)
    L.push(`| イライラしたクリックが起きたセッション | ${cell(P, 'rageClickRate', fmtPct)} | ${fmtPct(c.lp.rageClickRate)} | ${fmtPct(c.demo.rageClickRate)} | 同じ場所を短時間に連打したセッションの割合 |`)
    L.push('')
  }

  L.push('### この集計の制約')
  L.push('')
  L.push('- 1 セッションが何ページ見たかの分布は出ません。GA4 Data API と Clarity API は分布を返しません。分布が必要なら GA4 の BigQuery エクスポートを使います。')
  L.push('- localhost、確認用プレビュー、`?internal=1` を付けた端末からの閲覧は、送信元で除外しています。')
  L.push('- Clarity の値は直近 3 日間です。GA4 の期間とは一致しません。')
  if (errors.length) { L.push(''); L.push('### 取得できなかったもの'); L.push(''); for (const e of errors) L.push(`- ${e}`) }
  L.push('')
  L.push('---')
  L.push('_Generated by [Claude Code](https://claude.ai/code)_')
  return L.join('\n')
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
  // 上限: numOfDays は 1〜3、1 日 10 回まで。1 回の実行で 2 回だけ呼ぶ（URL 別と、次元なしの全体）。
  const get = async (query) => {
    const res = await fetchImpl(`https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=3${query}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Clarity の取得に失敗: ${res.status} ${(await res.text()).slice(0, 300)}`)
    return res.json()
  }
  const byUrl = await get('&dimension1=URL')
  let totals = null
  try { totals = await get('') } catch { totals = null } // 全体が取れなくても URL 別だけで続ける
  return summarizeClarity(byUrl, totals)
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
