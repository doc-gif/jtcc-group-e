export type SeriesId = 'sanrio' | 'sumikko' | 'haikyu' | 'chiikawa'
export type CategoryId = 'plush' | 'apparel' | 'bag' | 'accessory' | 'stationery' | 'badge'
export type GoodsArt = 'plush' | 'pouch' | 'hairclip' | 'badge' | 'acrylic-stand' | 'plush-keychain' | 'mug' | 'blanket' | 'gift'
export type BannerId = 'anniversary' | 'capsule' | 'sakura' | 'local' | 'birthday' | 'retro'
/** 目玉はローズゴールド、キラキラはパールに光る。文字の等級は付けない。 */
export type Glow = 'featured' | 'sparkle' | 'normal'
export type GachaTag = '即完売品' | '検品済み' | '新入荷'

export interface Prize {
  id: string
  name: string
  art: GoodsArt
  category: CategoryId
  /** 発売日（YYYY-MM-DD）。発売から90日以内の商品は扱わない。 */
  releasedAt: string
  condition: string
  /** 参考価格（円）。買取額や交換額ではない。 */
  refPrice: number
  glow: Glow
  /** このガチャに最初に入れた数 */
  total: number
  /** 画面を開いた時点の残り（説明用の架空データ） */
  startRemaining: number
}

export interface Gacha {
  id: string
  title: string
  tagline: string
  series: SeriesId
  categories: CategoryId[]
  banner: BannerId
  /** 1回のコイン（1コイン＝1円） */
  price: number
  tags: GachaTag[]
  /** 新入荷順の並び替えに使う。大きいほど新しい。 */
  addedOrder: number
  prizes: Prize[]
}

export type WinStatus = 'kept' | 'delivery' | 'exchanged'

export interface WinRecord {
  id: string
  gachaId: string
  prizeId: string
  spent: number
  wonAt: string
  companions: string[]
  status: WinStatus
  exchangedCoins?: number
}

export type Stock = Record<string, Record<string, number>>

export interface AppState {
  version: 1
  coins: number
  nickname: string
  stock: Stock
  wins: WinRecord[]
  forceFeaturedNext: boolean
  nextWinSeq: number
  /** 「はじめて」の画面を見終えたか */
  welcomed: boolean
  /** ピピの読み上げ・チャイム。自動で鳴らさないため最初は OFF。 */
  voiceOn: boolean
  soundOn: boolean
  /** 棚の前に並べる「お気に入り」（Prize の id）。いつでも外せる。 */
  favorites: string[]
  /** 友だち（デモ）の品に送った「いいな〜」（`<友だちの id>:<Prize の id>`）。同じ品には1回だけ。 */
  reactions: string[]
}
