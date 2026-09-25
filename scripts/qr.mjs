import QRCode from 'qrcode'

export async function qrPng(url) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('QR requires a public HTTPS URL without credentials')
  return QRCode.toBuffer(parsed.href, { type: 'png', errorCorrectionLevel: 'M', margin: 4, scale: 6 })
}
