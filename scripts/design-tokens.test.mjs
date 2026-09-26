// design-system/tokens.css（Figma の DS の写し）と src/index.css（アプリ）の同じ名前の変数が同じ値かを検査する（#125）。
// アプリは tokens.css を import しないので（F06）、値を変えるときは両方を同じ PR で直す。
import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'

/** 最初の `:root { … }` の中の `--name: value;` を読む（コメントは除く）。 */
export function rootTokens(css) {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/:root\s*\{([\s\S]*?)\n\}/)
  if (!body) throw new Error(':root が見つからない')
  const tokens = new Map()
  for (const [, name, value] of body[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens.set(name, value.trim())
  return tokens
}

/** var(--x) を同じファイルの値で展開し、大文字小文字と空白をそろえる。 */
export function resolve(tokens, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`循環参照: ${name}`)
  const value = tokens.get(name)
  if (value === undefined) throw new Error(`未定義: ${name}`)
  const next = new Set(seen).add(name)
  return value
    .replace(/var\((--[\w-]+)\)/g, (_, ref) => resolve(tokens, ref, next))
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

const [ds, app] = await Promise.all([
  readFile('design-system/tokens.css', 'utf8').then(rootTokens),
  readFile('src/index.css', 'utf8').then(rootTokens),
])

describe('design-system/tokens.css と src/index.css', () => {
  test('同じ名前の変数は同じ値', () => {
    const shared = [...ds.keys()].filter((name) => app.has(name))
    const differ = shared.filter((name) => resolve(ds, name) !== resolve(app, name))
      .map((name) => `${name}: tokens.css=${resolve(ds, name)} / index.css=${resolve(app, name)}`)
    expect(differ).toEqual([])
    expect(shared.length).toBeGreaterThan(40)
  })

  // #122 で Figma の DS に入り、#125 でアプリに反映した名前。アプリから消すと対応が切れる。
  test('#122 で DS に追加した変数をアプリも持つ', () => {
    const added = [
      '--primary', '--line', '--head', '--art-mint', '--shelf-wood', '--shelf-slot-line', '--shelf-slot-line-owned',
      '--lux-text', '--disabled-soft', '--disabled-soft-text', '--lp-v2-action-pressed',
      '--lp-v2-capsule-sparkle-bg', '--lp-v2-capsule-featured-glow-in', '--lp-v2-capsule-featured-glow-out',
      '--lp-v2-radius-control', '--lp-v2-radius-tile', '--lp-v2-radius-panel', '--lp-v2-radius-card', '--lp-v2-radius-full',
      '--rg', '--rg-soft', '--pearl', '--kakutei', '--shadow',
      ...['heading', 'heading-s', 'subtitle', 'numeral', 'overline'].flatMap((style) => [`--lp-v2-type-${style}-size`, `--lp-v2-type-${style}-line`]),
    ]
    expect(added.filter((name) => !ds.has(name))).toEqual([])
    expect(added.filter((name) => !app.has(name))).toEqual([])
  })

  test('操作部品の角丸 --radius は radius/control（12px）、押している間はワイン', () => {
    expect(resolve(app, '--radius')).toBe('12px')
    expect(resolve(app, '--lp-v2-action-pressed')).toBe(resolve(ds, '--deep'))
  })

  test('読み取りの補助関数', () => {
    const tokens = rootTokens(':root {\n  --a: #ABC; /* x */\n  --b: var(--a);\n  --c: var(--c);\n}\n')
    expect(resolve(tokens, '--b')).toBe('#abc')
    expect(() => resolve(tokens, '--c')).toThrow('循環参照')
    expect(() => resolve(tokens, '--z')).toThrow('未定義')
    expect(() => rootTokens('body {}')).toThrow(':root')
  })
})
