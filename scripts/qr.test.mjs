import { expect, test } from 'vitest'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { qrPng } from './qr.mjs'

test.each([
  'https://doc-gif.github.io/jtcc-group-e-preview/pr-6/runs/36151439972/',
  'https://doc-gif.github.io/jtcc-group-e/versions/v0.1.0/',
  'https://example.com/path?value=abc#screen',
])('QR round trip returns the exact destination: %s', async (url) => {
  const png = PNG.sync.read(await qrPng(url))
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  expect(decoded?.data).toBe(url)
})

test('rejects unsafe URL schemes or embedded credentials', async () => {
  for (const url of ['javascript:alert(1)', 'http://example.com/', 'https://user:secret@example.com/']) await expect(qrPng(url)).rejects.toThrow()
})
