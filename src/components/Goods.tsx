import { asset } from '../app/appContext'
import { glowLabel, remainingRatio, remainLabel, remainLevel } from '../domain/odds'
import type { Gacha, GoodsArt, Glow, Stock } from '../domain/types'

/** 画面に等級の文字は出さず、光り方で見分ける。読み上げでは区別できるよう隠し文字で伝える（glowLabel）。 */
export function GoodsImage({ art, glow, size = 'md' }: { art: GoodsArt; glow: Glow; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`goods goods-${size} glow-${glow}`}>
      <img src={asset(`assets/goods/${art}.png`)} alt="" loading="lazy" />
      {glow !== 'normal' && <span className="visually-hidden">（{glowLabel[glow]}）</span>}
    </span>
  )
}

/** 残りは数を出さず、バーと言葉で伝える（色だけに頼らない）。 */
export function RemainBar({ gacha, stock }: { gacha: Gacha; stock: Stock }) {
  const ratio = remainingRatio(gacha, stock)
  const level = remainLevel(ratio)
  return (
    <div className={`remain remain-${level}`}>
      <span className="remain-label">残り<b>{remainLabel[level]}</b></span>
      <span className="remain-track" aria-hidden="true"><span className="remain-fill" style={{ width: `${Math.round(ratio * 100)}%` }} /></span>
    </div>
  )
}

export function Banner({ gacha, as = 'p', titleId }: { gacha: Gacha; as?: 'p' | 'h2'; titleId?: string }) {
  const Title = as
  return (
    <div className="banner" style={{ backgroundImage: `url(${asset(`assets/banners/${gacha.banner}.png`)})` }}>
      <div className="banner-text">
        <Title className="banner-title" id={titleId}>{gacha.title}</Title>
        <span className="banner-sub">{gacha.tagline}</span>
      </div>
    </div>
  )
}
