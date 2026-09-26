import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { paths } from '../app/router'
import { PipiFigure } from './Pipi'

/**
 * 街の地図（デザインマスターの部品 267:10063「T07 / Town Map / 4W square」、1560×1560）。
 * 絵はマスターのオリジナルのベクター（木・家・道・広場）を SVG で描き直したもの。
 * マスター中央の内部キャラクター参照（W019）は使わず、オリジナルの案内役ピピに置き換えた。
 */
const MAP_SIZE = 1560
/** 最初に見せる位置（マスターの 390×390 の窓が見ている範囲の中心） */
const START = { x: 780, y: 695 }

const TREES: Array<[number, number]> = [
  ...[115, 315, 515, 715, 915, 1115, 1315].map((x) => [x, 108] as [number, number]),
  ...[160, 360, 560, 760, 960, 1160, 1360].map((x) => [x, 308] as [number, number]),
  ...[115, 315, 1115, 1315].map((x) => [x, 508] as [number, number]),
  ...[160, 360, 1160, 1360].map((x) => [x, 708] as [number, number]),
  ...[115, 315, 1115, 1315].map((x) => [x, 908] as [number, number]),
  ...[160, 360, 560, 760, 960, 1160, 1360].map((x) => [x, 1108] as [number, number]),
  ...[115, 315, 515, 715, 915, 1115, 1315].map((x) => [x, 1308] as [number, number]),
]

/** 広場の中の木（位置・大きさ） */
const PLAZA_TREES: Array<[number, number, number]> = [
  [73.6, 59.5, 0.917], [407.6, 70.5, 0.917], [48.3, 206, 0.667], [434.4, 190.5, 0.75], [93.5, 379, 0.833], [380.5, 400, 0.833],
]
const FLOWERS: Array<[number, number]> = [[149.5, 136], [400.5, 173], [218.5, 271], [322.5, 396], [172.5, 399], [100.5, 189]]

function Window({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="24" height="27" rx="10" fill="#D4E3DE" />
      <path d={`M${x + 12} ${y + 1}v25M${x + 1} ${y + 13}h22`} stroke="#FFF9FA" strokeWidth="3" />
    </g>
  )
}

/** 小さな家。w は本体の幅。 */
function House({ x, y, w = 170, roof }: { x: number; y: number; w?: number; roof: string }) {
  const h = w > 150 ? 120 : 100
  const door = w / 2 - 17
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={w / 2 + 15.8} cy={h + 27} rx={w / 2 + 15} ry="12" fill="#D9CEBC" />
      <rect x="15.8" y="27" width={w} height={h} rx="16" fill="#FFF9FA" stroke="#CDB8B7" strokeWidth="2" />
      <path d={`M4.8 35C${4.8 + (w + 22) / 3} -10.3 ${4.8 + (2 * (w + 22)) / 3} -10.3 ${w + 26.8} 35L${w + 16.8} 50H14.8z`} fill={roof} stroke="#B7818C" strokeWidth="2" />
      <rect x={15.8 + door} y={h - 26} width="34" height="53" rx="16" fill="#DCA7A4" />
      <circle cx={15.8 + door + 24} cy={h + 4} r="2" fill="#805B64" />
      <Window x={27.8} y={59} />
      <Window x={w - 20.2} y={59} />
    </g>
  )
}

function Flower({ x, y }: { x: number; y: number }) {
  return (
    <g fill="#DFA6BB">
      <circle cx={x - 3} cy={y} r="4" /><circle cx={x + 3} cy={y} r="4" /><circle cx={x} cy={y - 4} r="4" /><circle cx={x} cy={y + 3} r="4" />
      <circle cx={x} cy={y} r="2" fill="#FFF9FA" />
    </g>
  )
}

/** 街の絵。操作できる場所は別に重ねる。 */
export function TownIllustration() {
  return (
    <svg className="town-art" viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
      <defs>
        <g id="town-tree">
          <ellipse cx="34.8" cy="69.6" rx="26.4" ry="9.6" fill="#C8D5BF" />
          <path d="M34.8 48v24" stroke="#AA8063" strokeWidth="8.4" strokeLinecap="round" />
          <circle cx="21.6" cy="42" r="21.6" fill="#93B9A1" />
          <circle cx="49.2" cy="38.4" r="21.6" fill="#ACCBB0" />
          <circle cx="34.8" cy="24" r="24" fill="#BED8BC" />
          <circle cx="28.8" cy="21.6" r="6" fill="#D8E8C8" />
        </g>
      </defs>
      <rect width={MAP_SIZE} height={MAP_SIZE} fill="#FDEEF2" />
      <path d="M120 330C273.3 163.3 440 136.7 620 250C800 363.3 1036.7 383.3 1330 310C1450 583.3 1436.7 893.3 1290 1240C1143.3 1586.7 843.3 1623.3 390 1350C163.3 1156.7 73.3 816.7 120 330Z" fill="#E8EDDA" />
      <g fill="none" strokeLinecap="round">
        <path d="M80 770C293.3 590 516.7 586.7 750 760C983.3 933.3 1226.7 906.7 1480 680M810 110C670 356.7 666.7 586.7 800 800C933.3 1013.3 926.7 1240 780 1480" stroke="#F7CBD9" strokeWidth="65" />
        <path d="M80 770C293.3 590 516.7 586.7 750 760C983.3 933.3 1226.7 906.7 1480 680M810 110C670 356.7 666.7 586.7 800 800C933.3 1013.3 926.7 1240 780 1480" stroke="#FFF9FA" strokeWidth="42" />
      </g>
      {TREES.map(([x, y]) => <use key={`${x}-${y}`} href="#town-tree" x={x} y={y} />)}
      <House x={329.2} y={364} roof="#C9BCDE" />
      <House x={1039.2} y={434} roof="#EAB0C0" />
      <House x={519.2} y={1044} roof="#C9BCDE" />
      <House x={1091} y={1104} w={140} roof="#DFB49A" />
      {/* 中央の広場：ガチャのお店・コレクションの家・フレンドの家・噴水 */}
      <g transform="translate(505.5 486)">
        <ellipse cx="274.5" cy="242" rx="246" ry="242" fill="#E8EDDA" />
        <g fill="none" strokeLinecap="round">
          <path d="M19.5 319C79.5 289 122.2 254.7 147.5 216C168.8 191.3 211.8 182.7 276.5 190C357.2 198 408.5 232.7 430.5 294C441.8 323.3 464.8 349 499.5 371M270.5 181C251.8 258.3 252.5 346 272.5 444" stroke="#E8C2C2" strokeWidth="39" />
          <path d="M19.5 319C79.5 289 122.2 254.7 147.5 216C168.8 191.3 211.8 182.7 276.5 190C357.2 198 408.5 232.7 430.5 294C441.8 323.3 464.8 349 499.5 371M270.5 181C251.8 258.3 252.5 346 272.5 444" stroke="#FFF3DD" strokeWidth="29" />
        </g>
        {PLAZA_TREES.map(([x, y, s]) => <use key={`${x}-${y}`} href="#town-tree" transform={`translate(${x} ${y}) scale(${s})`} />)}
        {/* ガチャのお店 */}
        <ellipse cx="274.5" cy="212" rx="108" ry="14" fill="#D8C9B7" />
        <rect x="183.5" y="103" width="182" height="111" rx="22" fill="#FFF9FA" stroke="#B77D8E" strokeWidth="2" />
        <path d="M173.5 111L201.5 69C249.5 60.3 298.2 60.3 347.5 69L375.5 111z" fill="#D994AD" stroke="#B77D8E" strokeWidth="2" />
        <path d="M193.5 113H354.5" stroke="#B65B80" strokeWidth="18" strokeDasharray="17 15" />
        <rect x="209.5" y="124" width="54" height="73" rx="15" fill="#B9D6CC" />
        <rect x="287.5" y="124" width="54" height="73" rx="15" fill="#E8CADB" />
        <circle cx="236.5" cy="147" r="20" fill="#FFF9FA" /><circle cx="314.5" cy="147" r="20" fill="#FFF9FA" />
        <circle cx="229.5" cy="143" r="8" fill="#D994AD" /><circle cx="244.5" cy="150" r="7" fill="#D3BFE8" />
        <circle cx="309.5" cy="143" r="8" fill="#D994AD" /><circle cx="322.5" cy="151" r="7" fill="#B9D6CC" />
        <circle cx="236.5" cy="177" r="8" fill="#FFF9FA" /><circle cx="314.5" cy="177" r="8" fill="#FFF9FA" />
        <path d="M231.5 177h10M309.5 177h10" stroke="#52615A" strokeWidth="3" />
        <path d="M273.5 62C243.5 35 238.5 79 273.5 75C303.5 35 316.5 81 273.5 75" fill="#F7CBD9" stroke="#B77D8E" strokeWidth="2" />
        {/* コレクションの家 */}
        <ellipse cx="155.5" cy="347" rx="71.7" ry="12" fill="#D9CEBC" />
        <rect x="96.5" y="272" width="118" height="75" rx="16" fill="#FFF9FA" stroke="#CDB8B7" strokeWidth="2" />
        <path d="M85.5 280C132.2 234.7 178.8 234.7 225.5 280L215.5 295H95.5z" fill="#CFBDD9" stroke="#B7818C" strokeWidth="2" />
        <rect x="138.5" y="294" width="34" height="53" rx="16" fill="#DCA7A4" />
        <Window x={108.5} y={304} /><Window x={178.5} y={304} />
        {/* フレンドの家 */}
        <ellipse cx="394.5" cy="347" rx="70.5" ry="12" fill="#D9CEBC" />
        <rect x="336.5" y="269" width="116" height="78" rx="16" fill="#FFF9FA" stroke="#CDB8B7" strokeWidth="2" />
        <path d="M325.5 277C371.5 231.7 417.5 231.7 463.5 277L453.5 292H335.5z" fill="#BDD1BD" stroke="#B7818C" strokeWidth="2" />
        <rect x="377.5" y="294" width="34" height="53" rx="16" fill="#DCA7A4" />
        <circle cx="401.5" cy="324" r="2" fill="#805B64" />
        <Window x={348.5} y={301} /><Window x={416.5} y={301} />
        {/* 噴水 */}
        <ellipse cx="273.5" cy="352" rx="47" ry="28" fill="#D1DDD7" stroke="#A8BEB7" strokeWidth="3" />
        <ellipse cx="273.5" cy="347" rx="35" ry="18" fill="#B4D4D0" />
        <ellipse cx="273.5" cy="343" rx="20" ry="10" fill="#EFF9F2" />
        <path d="M273.5 344V323" stroke="#9BBEB5" strokeWidth="7" strokeLinecap="round" />
        <path d="M259.5 332C268.8 315.3 278.2 315.3 287.5 332" fill="none" stroke="#FFF9FA" strokeWidth="3" />
        {FLOWERS.map(([x, y]) => <Flower key={`${x}-${y}`} x={x} y={y} />)}
      </g>
    </svg>
  )
}

/** 地図上の位置（マスターの座標）を、地図の大きさに対する割合で置く。文字を大きくすると地図ごと大きくなる。 */
const at = (x: number, y: number) => ({ left: `${(x / MAP_SIZE) * 100}%`, top: `${(y / MAP_SIZE) * 100}%` })

function Spot({ x, y, className, href, children }: { x?: number; y?: number; className: string; href?: string; children: ReactNode }) {
  const style = x === undefined || y === undefined ? undefined : at(x, y)
  if (!href) return <span className={className} style={style}>{children}</span>
  // ドラッグで地図を動かすとき、リンクそのものを引っぱらない
  return <a className={className} style={style} href={href} draggable={false}>{children}</a>
}

/** 地図の中身（絵＋場所の名前）。interactive が false のときは導入の背景として見せるだけ。 */
export function TownMapLayer({ interactive, winCount }: { interactive: boolean; winCount: number }) {
  return (
    <div className="town-map">
      <TownIllustration />
      <Spot x={781} y={704} className="town-spot spot-main" href={interactive ? paths.gachaList : undefined}>ガチャのお店</Spot>
      {/* 当てた数はコレクションの名前の上に重ねて置き、文字を大きくしても重ならないようにする */}
      <span className="town-stack" style={at(667, 878)}>
        <span className="town-count">当てたもの {winCount}</span>
        <Spot className="town-spot" href={interactive ? paths.shelf : undefined}>コレクション</Spot>
      </span>
      <Spot x={895} y={854} className="town-spot" href={interactive ? paths.together : undefined}>フレンド</Spot>
      <span className="town-pipi" style={at(780, 776)}><PipiFigure className="town-pipi-figure" /></span>
    </div>
  )
}

/**
 * ドラッグで縦横に動かせる街の窓。タッチはブラウザのスクロール、マウスはドラッグ、
 * キーボードは窓に焦点を当てて矢印キーで動かせる。最初は広場を中央に見せる。
 */
export function TownViewport({ winCount }: { winCount: number }) {
  const viewport = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; distance: number } | null>(null)

  const center = () => {
    const el = viewport.current
    const map = el?.firstElementChild as HTMLElement | null
    if (!el || !map || moved.current) return
    const scale = map.offsetWidth / MAP_SIZE
    el.scrollLeft = START.x * scale - el.clientWidth / 2
    el.scrollTop = START.y * scale - el.clientHeight / 2
  }

  useLayoutEffect(center, [])
  // 文字の大きさを変えると地図も大きくなるので、利用者が動かす前なら広場を中央に戻す
  useEffect(() => {
    const el = viewport.current
    if (!el || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(() => center())
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    const el = event.currentTarget
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop, distance: 0 }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state || state.id !== event.pointerId) return
    const dx = event.clientX - state.x
    const dy = event.clientY - state.y
    state.distance = Math.max(state.distance, Math.hypot(dx, dy))
    if (state.distance < 4) return
    const el = event.currentTarget
    if (typeof el.setPointerCapture === 'function' && !el.hasPointerCapture(event.pointerId)) el.setPointerCapture(event.pointerId)
    el.classList.add('is-dragging')
    el.scrollLeft = state.left - dx
    el.scrollTop = state.top - dy
    moved.current = true
  }
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state || state.id !== event.pointerId) return
    event.currentTarget.classList.remove('is-dragging')
    // ドラッグの終わりで、下にある場所のリンクを押したことにしない
    if (state.distance >= 4) {
      const block = (click: MouseEvent) => { click.preventDefault(); click.stopPropagation() }
      window.addEventListener('click', block, { capture: true, once: true })
      window.setTimeout(() => window.removeEventListener('click', block, { capture: true }), 0)
    }
    drag.current = null
  }

  return (
    <div
      ref={viewport}
      className="town-viewport"
      role="region"
      aria-label="街の地図。ドラッグやスクロール、矢印キーで動かせます"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={() => { moved.current = true }}
      onTouchStart={() => { moved.current = true }}
      onWheel={() => { moved.current = true }}
    >
      <TownMapLayer interactive winCount={winCount} />
    </div>
  )
}
