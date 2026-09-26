import type { PointerEventHandler, Ref } from 'react'
import { coinText } from '../domain/odds'

const TAU = Math.PI * 2
const bulbs = Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * TAU - Math.PI / 2; return { i, x: 130 + 97 * Math.cos(a), y: 120 + 97 * Math.sin(a) } })
const pearls = Array.from({ length: 15 }, (_, i) => { const t = i / 14; return { i, x: 48 + t * 164, y: 252 + Math.sin(t * Math.PI) * 12, r: i % 2 ? 3.2 : 4.2 } })
const caps = [[90, 146, 17, '#F9C9D6'], [128, 162, 17, '#F3B3C6'], [166, 144, 17, '#FBD7E1'], [108, 116, 17, '#EFA3BA'], [150, 112, 17, '#F9C9D6'], [130, 82, 17, '#F5BFCF'], [88, 104, 15, '#FBD7E1'], [176, 108, 14, '#EFA3BA']] as const

interface Props {
  ref?: Ref<SVGSVGElement>
  price: number
  angle: number
  className: string
  /** 読み上げの名前。回せない場面（回す前の確認・売り切れ）では、その状態を伝える。 */
  label?: string
  onPointerDown?: PointerEventHandler<SVGSVGElement>
  onPointerMove?: PointerEventHandler<SVGSVGElement>
  onPointerUp?: PointerEventHandler<SVGSVGElement>
}

/** ガチャガチャの筐体。1 回転ごとにリボン・花・羽が加わる。ハンドルは指でなぞって回す。 */
export function Machine({ ref, price, angle, className, label = 'ガチャガチャ。ハンドルを指でなぞって回します', onPointerDown, onPointerMove, onPointerUp }: Props) {
  return (
    <svg ref={ref} className={`machine ${className}`} viewBox="0 0 260 370" role="img" aria-label={label}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={onPointerUp}>
      <defs>
        <radialGradient id="m-glass" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#FDE9EF" /></radialGradient>
        <linearGradient id="m-rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FBE3D9" /><stop offset=".45" stopColor="#EDB3A3" /><stop offset=".7" stopColor="#FFF1EC" /><stop offset="1" stopColor="#D98C86" /></linearGradient>
        <linearGradient id="m-pearl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" /><stop offset=".5" stopColor="#F9D4E0" /><stop offset="1" stopColor="#FFF6F9" /></linearGradient>
      </defs>
      <g className="m-wings">
        <path d="M44 118C8 96 -2 52 14 34c6 22 16 30 28 40C22 66 8 78 14 92c10 2 20 8 30 18z" fill="url(#m-pearl)" stroke="#F2A7BC" strokeWidth="2" />
        <path d="M216 118c36-22 46-66 30-84-6 22-16 30-28 40 20-8 34 4 28 18-10 2-20 8-30 18z" fill="url(#m-pearl)" stroke="#F2A7BC" strokeWidth="2" />
      </g>
      <path d="M104 30 L108 10 L120 22 L130 4 L140 22 L152 10 L156 30 Z" fill="#F2A7BC" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="130" cy="120" r="90" fill="url(#m-glass)" stroke="#F2A7BC" strokeWidth="6" />
      <g className="m-bulbs">{bulbs.map((b) => <circle key={b.i} className="m-bulb" style={{ animationDelay: `${(b.i % 5) * 0.12}s` }} cx={b.x} cy={b.y} r="4.2" stroke="#fff" strokeWidth="1.2" />)}</g>
      <g className="m-caps">
        {caps.map(([x, y, r, fill], i) => <g key={i}><circle cx={x} cy={y} r={r} fill={fill} /><path d={`M${x - r} ${y}a${r} ${r} 0 0 1 ${r * 2} 0z`} fill="#fff" /></g>)}
      </g>
      <g className="m-special m-pearlcap"><circle cx="130" cy="136" r="19" fill="url(#m-pearl)" stroke="#fff" strokeWidth="2" /><path d="M111 136a19 19 0 0 1 38 0z" fill="#fff" /></g>
      <g className="m-special m-starcap"><circle cx="130" cy="136" r="21" fill="url(#m-rg)" stroke="#fff" strokeWidth="2" /><path d="M109 136a21 21 0 0 1 42 0z" fill="#FFF1EC" /></g>
      <ellipse cx="98" cy="78" rx="20" ry="10" fill="#fff" opacity=".8" transform="rotate(-30 98 78)" />
      <g className="m-bow">
        <path className="m-bowfill" d="M58 58c-18-14-30-2-24 10 5 9 18 6 24-2 4 10 2 22-6 30l8 2 6-26c8 6 22 10 26 0 4-12-12-20-26-10z" stroke="#fff" strokeWidth="2" />
        <circle cx="60" cy="62" r="5" fill="#fff" />
      </g>
      <rect className="m-body" x="38" y="204" width="184" height="140" rx="22" />
      <g className="m-pearls">{pearls.map((p) => <circle key={p.i} cx={p.x} cy={p.y} r={p.r} fill="url(#m-pearl)" stroke="#fff" strokeWidth="1" />)}</g>
      <rect x="54" y="214" width="152" height="24" rx="12" fill="#fff" opacity=".92" />
      <text x="130" y="231" textAnchor="middle" fontSize="11" fontWeight="700" fill="#8E3B57">1回 {coinText(price)}コイン</text>
      <g className="m-handle" style={{ transform: `rotate(${(angle * 180) / Math.PI}deg)` }}>
        <circle cx="130" cy="284" r="34" fill="#fff" stroke="#DE7F9C" strokeWidth="5" />
        <rect x="122" y="254" width="16" height="60" rx="8" fill="#DE7F9C" />
        <path d="M130 290c-4-4-10-6-10-11 0-3 3-5 5-5s4 1 5 3c1-2 3-3 5-3s5 2 5 5c0 5-6 7-10 11z" fill="#fff" />
      </g>
      <rect x="172" y="304" width="40" height="26" rx="8" fill="#C9678A" />
      <rect x="177" y="309" width="30" height="16" rx="5" fill="#8f4a62" opacity=".5" />
      <rect x="54" y="344" width="152" height="16" rx="8" fill="#EBA0B8" />
      <rect x="70" y="358" width="18" height="10" rx="4" fill="#DE7F9C" /><rect x="172" y="358" width="18" height="10" rx="4" fill="#DE7F9C" />
    </svg>
  )
}
