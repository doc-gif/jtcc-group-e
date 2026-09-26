import { describe, expect, test, vi } from 'vitest'
import { confirmRelease, summary, urls } from './release-confirm.mjs'
import { planRelease } from './release-plan.mjs'

const sha = (c) => c.repeat(40)
const TAGS = [
  { name: 'v0.3.1', commit: { sha: sha('3') } },
  { name: 'v0.4.0', commit: { sha: sha('4') } },
  { name: 'v0.10.0-rc', commit: { sha: sha('9') } },
  { name: 'v0.1.0', commit: { sha: sha('1') } },
]
const always = () => true

describe('公開の計画: 版を決め、二重公開と巻き戻しを止める', () => {
  test('入力がなければ、最新のタグ（数値の比較）の patch + 1', () => {
    expect(planRelease({ tags: TAGS, sha: sha('5'), requested: '', isAncestor: always })).toEqual({ publish: true, version: 'v0.4.1' })
    expect(planRelease({ tags: [...TAGS, { name: 'v0.9.9', commit: { sha: sha('6') } }, { name: 'v0.10.0', commit: { sha: sha('7') } }], sha: sha('8'), isAncestor: always }).version).toBe('v0.10.1')
    expect(planRelease({ tags: [], sha: sha('5'), isAncestor: always })).toEqual({ publish: true, version: 'v0.1.0' })
  })

  test('入力があれば、形と大きさを検査してそのまま使う', () => {
    expect(planRelease({ tags: TAGS, sha: sha('5'), requested: 'v0.5.0', isAncestor: always })).toEqual({ publish: true, version: 'v0.5.0' })
    expect(() => planRelease({ tags: TAGS, sha: sha('5'), requested: 'v0.4.0', isAncestor: always })).toThrow('別の commit')
    expect(() => planRelease({ tags: TAGS, sha: sha('5'), requested: 'v0.3.9', isAncestor: always })).toThrow('より大きく')
    expect(() => planRelease({ tags: TAGS, sha: sha('5'), requested: '0.5.0', isAncestor: always })).toThrow('vMAJOR')
  })

  test('同じ SHA がもう公開済みなら公開しない（続けて来た依頼・置き換わった依頼を1回にまとめる）', () => {
    expect(planRelease({ tags: TAGS, sha: sha('4'), isAncestor: always })).toMatchObject({ publish: false, version: 'v0.4.0', reason: expect.stringContaining('公開済み') })
    expect(planRelease({ tags: TAGS, sha: sha('4'), requested: 'v0.4.0', isAncestor: always })).toMatchObject({ publish: false })
    expect(planRelease({ tags: TAGS, sha: sha('4'), requested: 'v0.5.0', isAncestor: always })).toMatchObject({ publish: false, version: 'v0.4.0' })
  })

  test('最新の版を含まない SHA（古い実行の再実行など）は巻き戻さない', () => {
    const isAncestor = vi.fn((commit) => commit !== sha('4'))
    expect(() => planRelease({ tags: TAGS, sha: sha('2'), isAncestor })).toThrow('巻き戻さない')
    expect(isAncestor).toHaveBeenCalledWith(sha('4'))
  })

  test('SHA は 40 桁で渡す', () => {
    expect(() => planRelease({ tags: TAGS, sha: 'abc', isAncestor: always })).toThrow('full commit SHA')
  })
})

describe('公開後の確認: 配信の反映を待ち、版・SHA・固定 URL・タグを確かめる', () => {
  const site = 'https://doc-gif.github.io/jtcc-group-e'
  const base = { siteUrl: site, version: 'v0.4.1', sha: sha('5'), tagSha: sha('5'), sleep: vi.fn(async () => {}), attempts: 4 }

  test('古い deployment.json の間は待ち、一致したら固定 URL を確かめて URL を返す', async () => {
    const fetchJson = vi.fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce({ version: 'v0.4.0', sha: sha('4') })
      .mockResolvedValue({ version: 'v0.4.1', sha: sha('5') })
    const result = await confirmRelease({ ...base, fetchJson, fetchStatus: async () => 200 })
    expect(result.fixed).toBe(`${site}/versions/v0.4.1/`)
    expect(result.latest).toBe(`${site}/`)
    expect(fetchJson).toHaveBeenCalledTimes(3)
    expect(new Set(fetchJson.mock.calls.map(([url]) => url)).size).toBe(3)
    expect(fetchJson.mock.calls[0][0]).toMatch(/^https:\/\/doc-gif\.github\.io\/jtcc-group-e\/deployment\.json\?check=/)
  })

  test('一致しないまま時間切れ・固定 URL がない・タグが別の SHA なら失敗（成功と報告しない）', async () => {
    await expect(confirmRelease({ ...base, fetchJson: async () => ({ version: 'v0.4.0', sha: sha('4') }), fetchStatus: async () => 200 })).rejects.toThrow('最新 URL は v0.4.0')
    await expect(confirmRelease({ ...base, fetchJson: async () => ({ version: 'v0.4.1', sha: sha('5') }), fetchStatus: async () => 404 })).rejects.toThrow('固定 URL が 404')
    await expect(confirmRelease({ ...base, tagSha: sha('4'), fetchJson: async () => ({}), fetchStatus: async () => 200 })).rejects.toThrow('タグ v0.4.1')
  })

  test('報告に最新 URL・固定 URL・Release・QR の場所を書く', () => {
    const text = summary(urls(`${site}/`, 'v0.4.1'), 'v0.4.1', sha('5'))
    for (const part of [`${site}/`, `${site}/versions/v0.4.1/`, 'releases/tag/v0.4.1', sha('5'), 'release-qr']) expect(text).toContain(part)
  })
})
