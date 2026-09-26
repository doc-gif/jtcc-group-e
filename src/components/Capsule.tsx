import type { Glow } from '../domain/types'

/** カプセルの見た目の段階（マスター 267:8387 閉じている → 8404 すきまがあく → 8421 ふたが離れる）。 */
export type CapsuleStage = 'closed' | 'crack' | 'apart'

interface Props {
  glow: Glow
  stage?: CapsuleStage
  className?: string
  onClick?: () => void
}

/**
 * カプセルの絵（マスターの部品「T08 / Capsule」376:11670）。光り方で3種に見分ける:
 * normal 普通のピンク、sparkle 真珠色と小さな光の粒、featured 淡い金でふんわり光る。
 * 静止の絵で点滅しない。絵なので読み上げず、光り方は呼び出し側の文字で伝える。
 */
export function Capsule({ glow, stage = 'closed', className = '', onClick }: Props) {
  const lucky = glow !== 'normal'
  return (
    <div className={`capsule-art glow-${glow} stage-${stage} ${className}`.trim()} aria-hidden="true" onClick={onClick}>
      <span className="capsule-glow" />
      <span className="capsule-top">
        {glow === 'sparkle' && <><span className="spark t1" /><span className="spark t2" /><span className="spark t3" /></>}
      </span>
      <span className="capsule-bottom" />
      <span className="capsule-band" />
      {lucky && <><span className="spark o1" /><span className="spark o2" /><span className="spark o3" /><span className="grain g1" /><span className="grain g2" /><span className="grain g3" /></>}
    </div>
  )
}
