import type { BannerId, CategoryId, Gacha, GachaTag, Glow, GoodsArt, Prize, SeriesId } from './types'

/**
 * 説明用の架空データ（4作品 × 各3本 = 12本）。実在の商品・価格・在庫ではない。
 * キャラクター名は「取り扱い商品の事実」としてテキストだけで使い、公式の画像は使わない。
 */
type Row = [name: string, art: GoodsArt, category: CategoryId, refPrice: number, glow: Glow, total: number, remaining: number, releasedAt: string]
interface Def { id: string; title: string; tagline: string; series: SeriesId; banner: BannerId; price: number; tags: GachaTag[]; addedOrder: number; rows: Row[] }

const defs: Def[] = [
  {
    id: 'melody-anniv', title: 'マイメロディ 周年限定ガチャ', tagline: '福袋・周年・会場限定の、買えなかった一点を', series: 'sanrio', banner: 'anniversary', price: 1500, tags: ['即完売品', '検品済み'], addedOrder: 12,
    rows: [
      ['会場限定ドレスマスコット', 'plush-keychain', 'plush', 12000, 'featured', 2, 2, '2025-11-01'],
      ['周年限定ぬいぐるみ', 'plush', 'plush', 9800, 'featured', 1, 1, '2025-10-18'],
      ['周年ポーチ', 'pouch', 'bag', 3200, 'sparkle', 4, 3, '2025-10-18'],
      ['周年ルームウェア', 'blanket', 'apparel', 2900, 'sparkle', 3, 3, '2025-12-05'],
      ['リボンヘアクリップ', 'hairclip', 'accessory', 2400, 'sparkle', 5, 5, '2025-10-18'],
      ['周年ギフトセット', 'gift', 'stationery', 2200, 'normal', 4, 4, '2025-12-20'],
      ['アクリルスタンド', 'acrylic-stand', 'badge', 1200, 'normal', 10, 8, '2025-10-18'],
      ['マグカップ', 'mug', 'stationery', 1000, 'normal', 10, 7, '2026-01-15'],
      ['ミニブランケット', 'blanket', 'apparel', 900, 'normal', 6, 5, '2026-01-15'],
      ['ミニポーチ', 'pouch', 'bag', 800, 'normal', 6, 6, '2026-02-01'],
      ['ヘアピン', 'hairclip', 'accessory', 700, 'normal', 8, 6, '2026-02-01'],
      ['周年缶バッジ', 'badge', 'badge', 600, 'normal', 16, 9, '2025-10-18'],
    ],
  },
  {
    id: 'kuromi-apparel', title: 'クロミ アパレルガチャ', tagline: '発売日に売り切れたウェアと小物', series: 'sanrio', banner: 'retro', price: 1000, tags: ['即完売品', '検品済み'], addedOrder: 8,
    rows: [
      ['限定パーカー', 'blanket', 'apparel', 8800, 'featured', 1, 1, '2025-09-12'],
      ['ぬいぐるみリュック', 'plush', 'bag', 6400, 'featured', 1, 1, '2025-09-12'],
      ['ミニショルダー', 'pouch', 'bag', 3600, 'sparkle', 3, 1, '2025-09-12'],
      ['ロゴTシャツ', 'blanket', 'apparel', 3000, 'sparkle', 3, 2, '2025-11-20'],
      ['ヘアクリップ', 'hairclip', 'accessory', 1800, 'sparkle', 4, 2, '2025-11-20'],
      ['マスコットキーホルダー', 'plush-keychain', 'plush', 1500, 'normal', 6, 3, '2025-11-20'],
      ['ソックス', 'gift', 'apparel', 900, 'normal', 8, 3, '2026-01-10'],
      ['アクリルスタンド', 'acrylic-stand', 'badge', 900, 'normal', 8, 2, '2026-01-10'],
      ['ステッカーセット', 'gift', 'stationery', 500, 'normal', 10, 3, '2026-01-10'],
      ['缶バッジ', 'badge', 'badge', 500, 'normal', 16, 4, '2025-09-12'],
    ],
  },
  {
    id: 'sanrio-capsule', title: 'サンリオ カプセルミックス', tagline: 'ちいさなマスコットを、気軽にひとつ', series: 'sanrio', banner: 'capsule', price: 500, tags: ['検品済み'], addedOrder: 4,
    rows: [
      ['ぬいぐるみマスコット', 'plush-keychain', 'plush', 2600, 'featured', 2, 2, '2025-08-01'],
      ['ミニぬいぐるみ', 'plush', 'plush', 1800, 'sparkle', 4, 4, '2025-08-01'],
      ['アクリルスタンド', 'acrylic-stand', 'badge', 900, 'sparkle', 8, 7, '2025-08-01'],
      ['ミニポーチ', 'pouch', 'bag', 800, 'normal', 8, 7, '2025-12-01'],
      ['ヘアゴム', 'hairclip', 'accessory', 600, 'normal', 10, 9, '2025-12-01'],
      ['メモ帳', 'gift', 'stationery', 400, 'normal', 12, 10, '2025-12-01'],
      ['ミニマグ', 'mug', 'stationery', 500, 'normal', 10, 9, '2026-01-20'],
      ['ハンドタオル', 'blanket', 'apparel', 450, 'normal', 10, 9, '2026-01-20'],
      ['缶バッジ', 'badge', 'badge', 400, 'normal', 20, 16, '2025-08-01'],
    ],
  },
  {
    id: 'sumikko-sakura', title: 'すみっコ さくらガチャ', tagline: '春の限定だけを集めました', series: 'sumikko', banner: 'sakura', price: 800, tags: ['新入荷', '検品済み'], addedOrder: 11,
    rows: [
      ['さくらぬいぐるみ（大）', 'plush', 'plush', 5200, 'featured', 1, 1, '2026-03-01'],
      ['さくらブランケット', 'blanket', 'apparel', 3400, 'featured', 1, 1, '2026-03-01'],
      ['さくらマスコット', 'plush-keychain', 'plush', 1800, 'sparkle', 5, 5, '2026-03-01'],
      ['さくらマグ', 'mug', 'stationery', 1400, 'sparkle', 5, 5, '2026-03-15'],
      ['さくらトート', 'pouch', 'bag', 1300, 'sparkle', 4, 4, '2026-03-15'],
      ['さくらヘアクリップ', 'hairclip', 'accessory', 900, 'normal', 8, 8, '2026-03-15'],
      ['さくら便箋セット', 'gift', 'stationery', 700, 'normal', 10, 10, '2026-03-15'],
      ['さくらアクスタ', 'acrylic-stand', 'badge', 800, 'normal', 10, 10, '2026-03-01'],
      ['さくら缶バッジ', 'badge', 'badge', 500, 'normal', 20, 20, '2026-03-01'],
    ],
  },
  {
    id: 'sumikko-cafe', title: 'すみっコ カフェガチャ', tagline: 'コラボカフェ限定グッズを、もう一度', series: 'sumikko', banner: 'capsule', price: 1000, tags: ['即完売品', '検品済み'], addedOrder: 7,
    rows: [
      ['カフェ限定ぬいぐるみ', 'plush', 'plush', 6800, 'featured', 1, 1, '2025-07-20'],
      ['カフェ限定マグ', 'mug', 'stationery', 2800, 'sparkle', 3, 2, '2025-07-20'],
      ['エプロン', 'blanket', 'apparel', 2600, 'sparkle', 3, 2, '2025-07-20'],
      ['ランチポーチ', 'pouch', 'bag', 1600, 'normal', 6, 4, '2025-09-01'],
      ['カフェマスコット', 'plush-keychain', 'plush', 1400, 'normal', 6, 4, '2025-09-01'],
      ['ヘアクリップ', 'hairclip', 'accessory', 800, 'normal', 8, 5, '2025-09-01'],
      ['コースター', 'gift', 'stationery', 600, 'normal', 10, 6, '2025-09-01'],
      ['カフェ缶バッジ', 'badge', 'badge', 500, 'normal', 20, 11, '2025-07-20'],
    ],
  },
  {
    id: 'sumikko-plush', title: 'すみっコ ぬいぐるみガチャ', tagline: 'シリーズ違いのぬいぐるみを集めて', series: 'sumikko', banner: 'retro', price: 1200, tags: ['検品済み'], addedOrder: 3,
    rows: [
      ['記念ぬいぐるみ（特大）', 'plush', 'plush', 9000, 'featured', 1, 1, '2025-05-10'],
      ['てのりぬいぐるみセット', 'gift', 'plush', 4200, 'sparkle', 3, 3, '2025-05-10'],
      ['ぬいぐるみポーチ', 'pouch', 'bag', 2400, 'sparkle', 4, 4, '2025-06-01'],
      ['ぬいぐるみ用ケープ', 'blanket', 'apparel', 1800, 'normal', 5, 5, '2025-06-01'],
      ['ぬいぐるみキーホルダー', 'plush-keychain', 'plush', 1500, 'normal', 8, 7, '2025-06-01'],
      ['ヘアゴム', 'hairclip', 'accessory', 700, 'normal', 8, 7, '2025-06-01'],
      ['アクリルスタンド', 'acrylic-stand', 'badge', 900, 'normal', 8, 8, '2025-06-01'],
      ['シールセット', 'gift', 'stationery', 500, 'normal', 10, 9, '2025-06-01'],
    ],
  },
  {
    id: 'haikyu-local', title: 'ハイキュー!! ご当地ガチャ', tagline: '旅先でしか買えなかった限定を', series: 'haikyu', banner: 'local', price: 1200, tags: ['即完売品', '検品済み'], addedOrder: 10,
    rows: [
      ['ご当地 大きめアクスタ', 'acrylic-stand', 'badge', 6800, 'featured', 1, 1, '2025-08-10'],
      ['ご当地ぬいぐるみ', 'plush', 'plush', 5600, 'featured', 1, 1, '2025-08-10'],
      ['ご当地マスコット', 'plush-keychain', 'plush', 2400, 'sparkle', 5, 4, '2025-08-10'],
      ['ご当地タオル', 'blanket', 'apparel', 2000, 'sparkle', 4, 3, '2025-10-01'],
      ['ご当地巾着', 'pouch', 'bag', 1500, 'normal', 6, 5, '2025-10-01'],
      ['ご当地ヘアピン', 'hairclip', 'accessory', 800, 'normal', 6, 4, '2025-10-01'],
      ['ご当地ポストカード', 'gift', 'stationery', 500, 'normal', 10, 7, '2025-10-01'],
      ['ご当地缶バッジ', 'badge', 'badge', 700, 'normal', 20, 12, '2025-08-10'],
    ],
  },
  {
    id: 'haikyu-match', title: 'ハイキュー!! 試合会場ガチャ', tagline: '会場でしか買えなかったグッズ', series: 'haikyu', banner: 'anniversary', price: 1500, tags: ['即完売品', '検品済み'], addedOrder: 6,
    rows: [
      ['会場限定ユニフォーム', 'blanket', 'apparel', 11000, 'featured', 1, 1, '2025-06-15'],
      ['会場限定ぬいぐるみ', 'plush', 'plush', 7200, 'featured', 1, 1, '2025-06-15'],
      ['会場限定アクスタ', 'acrylic-stand', 'badge', 3200, 'sparkle', 3, 2, '2025-06-15'],
      ['会場限定トート', 'pouch', 'bag', 2800, 'sparkle', 3, 2, '2025-06-15'],
      ['リストバンド', 'hairclip', 'accessory', 1200, 'normal', 6, 4, '2025-07-01'],
      ['マスコット', 'plush-keychain', 'plush', 1400, 'normal', 6, 4, '2025-07-01'],
      ['マグカップ', 'mug', 'stationery', 1300, 'normal', 6, 5, '2025-07-01'],
      ['会場缶バッジ', 'badge', 'badge', 600, 'normal', 20, 12, '2025-06-15'],
    ],
  },
  {
    id: 'haikyu-school', title: 'ハイキュー!! 学校ガチャ', tagline: '文房具と制服モチーフの小物', series: 'haikyu', banner: 'sakura', price: 800, tags: ['新入荷', '検品済み'], addedOrder: 2,
    rows: [
      ['制服モチーフぬいぐるみ', 'plush', 'plush', 4800, 'featured', 1, 1, '2025-04-01'],
      ['ペンケース', 'pouch', 'bag', 1800, 'sparkle', 4, 4, '2025-04-01'],
      ['ノートセット', 'gift', 'stationery', 1400, 'sparkle', 4, 4, '2025-04-01'],
      ['ジャージ風タオル', 'blanket', 'apparel', 1200, 'normal', 6, 6, '2025-05-01'],
      ['マスコット', 'plush-keychain', 'plush', 1100, 'normal', 6, 6, '2025-05-01'],
      ['ヘアクリップ', 'hairclip', 'accessory', 700, 'normal', 6, 6, '2025-05-01'],
      ['マグカップ', 'mug', 'stationery', 900, 'normal', 6, 6, '2025-05-01'],
      ['缶バッジ', 'badge', 'badge', 500, 'normal', 18, 18, '2025-04-01'],
    ],
  },
  {
    id: 'chiikawa-birthday', title: 'ちいかわ バースデーガチャ', tagline: 'お祝い限定のグッズをもう一度', series: 'chiikawa', banner: 'birthday', price: 1000, tags: ['新入荷', '検品済み'], addedOrder: 9,
    rows: [
      ['バースデーぬいぐるみ', 'plush', 'plush', 7600, 'featured', 1, 1, '2025-12-10'],
      ['バースデーパジャマ', 'blanket', 'apparel', 5200, 'featured', 1, 1, '2025-12-10'],
      ['ギフトボックスセット', 'gift', 'stationery', 3000, 'sparkle', 4, 4, '2025-12-10'],
      ['バースデーポーチ', 'pouch', 'bag', 2200, 'sparkle', 4, 4, '2025-12-10'],
      ['バースデーマスコット', 'plush-keychain', 'plush', 1600, 'normal', 6, 6, '2026-01-10'],
      ['ヘアクリップ', 'hairclip', 'accessory', 900, 'normal', 6, 6, '2026-01-10'],
      ['マグカップ', 'mug', 'stationery', 1000, 'normal', 6, 6, '2026-01-10'],
      ['バースデー缶バッジ', 'badge', 'badge', 500, 'normal', 20, 20, '2025-12-10'],
    ],
  },
  {
    id: 'chiikawa-market', title: 'ちいかわ マーケットガチャ', tagline: '限定ショップのグッズを集めて', series: 'chiikawa', banner: 'local', price: 1200, tags: ['即完売品', '検品済み'], addedOrder: 5,
    rows: [
      ['ショップ限定ぬいぐるみ', 'plush', 'plush', 8200, 'featured', 1, 1, '2025-07-01'],
      ['ショップ限定トート', 'pouch', 'bag', 3800, 'sparkle', 3, 1, '2025-07-01'],
      ['ショップ限定Tシャツ', 'blanket', 'apparel', 3200, 'sparkle', 3, 2, '2025-07-01'],
      ['マスコット', 'plush-keychain', 'plush', 1600, 'normal', 6, 3, '2025-08-01'],
      ['ヘアクリップ', 'hairclip', 'accessory', 900, 'normal', 6, 2, '2025-08-01'],
      ['マグカップ', 'mug', 'stationery', 1200, 'normal', 6, 2, '2025-08-01'],
      ['アクリルスタンド', 'acrylic-stand', 'badge', 900, 'normal', 8, 3, '2025-08-01'],
      ['缶バッジ', 'badge', 'badge', 500, 'normal', 20, 6, '2025-07-01'],
    ],
  },
  {
    id: 'chiikawa-mini', title: 'ちいかわ ミニグッズガチャ', tagline: '小さなグッズをコツコツと', series: 'chiikawa', banner: 'capsule', price: 500, tags: ['検品済み'], addedOrder: 1,
    rows: [
      ['ぬいぐるみマスコット', 'plush-keychain', 'plush', 2200, 'featured', 2, 2, '2025-03-01'],
      ['ミニぬいぐるみ', 'plush', 'plush', 1500, 'sparkle', 4, 4, '2025-03-01'],
      ['ミニポーチ', 'pouch', 'bag', 900, 'sparkle', 5, 5, '2025-03-01'],
      ['ミニタオル', 'blanket', 'apparel', 600, 'normal', 8, 8, '2025-04-01'],
      ['ヘアゴム', 'hairclip', 'accessory', 500, 'normal', 8, 8, '2025-04-01'],
      ['ミニメモ', 'gift', 'stationery', 400, 'normal', 10, 10, '2025-04-01'],
      ['アクリルチャーム', 'acrylic-stand', 'badge', 600, 'normal', 10, 10, '2025-04-01'],
      ['缶バッジ', 'badge', 'badge', 400, 'normal', 20, 20, '2025-03-01'],
    ],
  },
]

const toPrize = (gachaId: string, [name, art, category, refPrice, glow, total, remaining, releasedAt]: Row, index: number): Prize => ({
  id: `${gachaId}-${index + 1}`, name, art, category, condition: glow === 'featured' ? 'タグ付き美品・検品済み' : '未開封・検品済み', refPrice, glow, total, startRemaining: remaining, releasedAt,
})

export const catalog: Gacha[] = defs.map(({ rows, ...def }) => {
  const prizes = rows.map((row, index) => toPrize(def.id, row, index))
  return { ...def, prizes, categories: [...new Set(prizes.map((prize) => prize.category))] }
})

export const seriesList: Array<{ id: SeriesId; label: string }> = [
  { id: 'sanrio', label: 'サンリオ' },
  { id: 'sumikko', label: 'すみっコぐらし' },
  { id: 'haikyu', label: 'ハイキュー!!' },
  { id: 'chiikawa', label: 'ちいかわ' },
]

export const categoryList: Array<{ id: CategoryId; label: string; icon: string }> = [
  { id: 'plush', label: 'ぬいぐるみ', icon: 'plush' },
  { id: 'apparel', label: 'アパレル', icon: 'apparel' },
  { id: 'bag', label: 'バッグ', icon: 'bag' },
  { id: 'accessory', label: 'アクセサリー', icon: 'accessory' },
  { id: 'stationery', label: '文房具', icon: 'stationery' },
  { id: 'badge', label: '缶バッジ/アクスタ', icon: 'keychain' },
]

export function findGacha(id: string): Gacha | undefined {
  return catalog.find((gacha) => gacha.id === id)
}

export function findPrize(gachaId: string, prizeId: string): { gacha: Gacha; prize: Prize } | undefined {
  const gacha = findGacha(gachaId)
  const prize = gacha?.prizes.find((item) => item.id === prizeId)
  return gacha && prize ? { gacha, prize } : undefined
}

/** 発売から90日以内の新作は扱わない（転売の助長を避ける）。 */
export const MIN_DAYS_SINCE_RELEASE = 90

export function daysSinceRelease(prize: Prize, today: Date): number {
  return Math.floor((today.getTime() - new Date(`${prize.releasedAt}T00:00:00+09:00`).getTime()) / 86_400_000)
}
