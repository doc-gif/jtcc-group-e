import { useMemo, type CSSProperties } from 'react'
import { prefersReducedMotion } from '../app/appContext'

export interface Burst { id: number; hearts: number; sparkles: number; gold?: boolean }

/** 1 回きりの粒の演出。動きを減らす設定では出さない。位置は burst.id から決まる。 */
export function Particles({ burst }: { burst: Burst | null }) {
  const items = useMemo(() => {
    if (!burst) return []
    let seed = burst.id * 9301 + 49297
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
    const total = burst.hearts + burst.sparkles
    return Array.from({ length: total }, (_, index) => {
      const angle = rand() * Math.PI * 2
      const distance = 60 + rand() * 120
      return { index, heart: index < burst.hearts, dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance - 30, size: 0.8 + rand() * 0.9, delay: rand() * 0.25 }
    })
  }, [burst])
  if (!burst || prefersReducedMotion()) return null
  return (
    <div className={`particles${burst.gold ? ' gold' : ''}`} aria-hidden="true" key={burst.id}>
      {items.map((item) => (
        <span key={item.index} className={item.heart ? 'pt heart' : 'pt spark'} style={{ '--dx': `${item.dx}px`, '--dy': `${item.dy}px`, fontSize: `${item.size}rem`, animationDelay: `${item.delay}s` } as CSSProperties}>
          {item.heart ? '♥' : '✦'}
        </span>
      ))}
    </div>
  )
}
