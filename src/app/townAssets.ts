import { catalog } from '../domain/catalog'
import { asset } from './appContext'
import { createAssetGate, fontsReady, loadImage } from './assets'

/** 街の「注目のピース」。最初のガチャの目玉。 */
export function townFeature() {
  const gacha = catalog[0]
  const prize = gacha.prizes.find((item) => item.glow === 'featured') ?? gacha.prizes[0]
  return { gacha, prize }
}

/**
 * 街（ホーム）を出す前に準備する絵：コイン・マイページのアイコンと、注目のピースの絵。
 * 街の地図はアプリに組み込んだ SVG なので待たない。
 */
export const TOWN_IMAGES = [
  asset('assets/icons/coin.png'),
  asset('assets/icons/mypage.png'),
  asset(`assets/goods/${townFeature().prize.art}.png`),
]

/** アプリ全体で1つ。アプリを開いたときに読み込みを始め、街へ行くときに準備できたかを見る。 */
export const townAssets = createAssetGate([...TOWN_IMAGES.map((url) => () => loadImage(url)), fontsReady])
