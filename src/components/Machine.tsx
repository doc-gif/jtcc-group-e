import type { SpinEffect } from './spinEffect'
import type { KnobHandlers } from './useKnobDrag'

interface Props {
  className?: string
  /** 読み上げの名前。回せない場面（回す前の確認・売り切れ）では、その状態を伝える。 */
  label?: string
  /** 回した回数。つまみをその分（1 回転 = 360°）回して見せる（筐体そのものは変わらない）。 */
  turns?: number
  /** いま指でなぞっている途中の角度（0〜360 未満）。つまみは turns × 360 + progress の向き。 */
  progress?: number
  /** 指が触れている間（マスターの state=dragging）。つまみを遅らせずに追従させ、案内の矢印を消す。 */
  dragging?: boolean
  /** なぞる前の案内（state=turn1〜3）: つまみの上に右回りの短い弧の矢印を出す。 */
  hint?: boolean
  /** 1 周した瞬間（state=click1）: つまみの外側の「カチッ」の線と札。 */
  click?: boolean
  /** つまみを押したとき（タップで 1 回転）。キーボードと読み上げでは、画面の「1タップで1回転」ボタンを使う。 */
  onHandleTap?: () => void
  /** 指で丸くなぞる操作（useKnobDrag）。onClick はタップ、それ以外はなぞり。 */
  knob?: KnobHandlers
  /** 回転ごとの演出（#116、spinEffect の結果）。無ければ演出なし（state=turn1 / idle と同じ絵） */
  effect?: SpinEffect
  /** 3 回転目のあとのカプセル: out = 取り出し口から出る途中（click3〜S4）、lit = 着地して光る（S5） */
  capsule?: 'none' | 'out' | 'lit'
}

/** つまみの中心（マスターの部品 419:10377 の座標。部品は 350×424） */
const KNOB = { x: 175, y: 316, r: 64 }
/** 押せる範囲（マスターの `Knob drag / 160×160 target`） */
const HIT_RADIUS = 80

/** ドームの中のパステルのカプセル（52px、色はマスターの 7 色） */
const CAPSULES: Array<[number, number, string]> = [
  [78, 208, '#f4c8da'], [128, 214, '#d5c7e7'], [178, 216, '#c9e6f5'], [228, 212, '#fbe9b8'], [276, 206, '#bbd7cb'],
  [100, 166, '#f8bcd0'], [150, 172, '#e8d0f0'], [200, 172, '#f4c8da'], [250, 166, '#d5c7e7'],
  [122, 126, '#c9e6f5'], [172, 132, '#fbe9b8'], [222, 128, '#bbd7cb'],
  [100, 90, '#f8bcd0'], [146, 86, '#e8d0f0'], [200, 90, '#f4c8da'], [246, 96, '#d5c7e7'],
  [174, 62, '#c9e6f5'],
]

/** 上のガーランド（ハートと星、y 8〜28） */
const GARLAND: Array<[number, 'heart' | 'star']> = [[52, 'heart'], [86, 'star'], [120, 'heart'], [154, 'star'], [188, 'heart'], [222, 'star'], [256, 'heart'], [290, 'star']]

const polar = (degrees: number, radius: number) => ({ x: KNOB.x + radius * Math.cos((degrees * Math.PI) / 180), y: KNOB.y + radius * Math.sin((degrees * Math.PI) / 180) })
/** 「カチッ」の線 8 本（半径 80→92、22.5° から 45° おき） */
const CLICK_TICKS = Array.from({ length: 8 }, (_, i) => { const a = polar(22.5 + 45 * i, 80); const b = polar(22.5 + 45 * i, 92); return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}` }).join('')
/** 右回りの案内の矢印（半径 86、10 時 → 2 時） */
const HINT_FROM = polar(210, 86)
const HINT_TO = polar(330, 86)

/** 四芒星（4 点、内側の半径 0.42）。size は幅 */
const FOUR_STAR = (() => {
  const r = 12
  const q = r * 0.42 * Math.SQRT1_2
  return `M0 ${-r}L${q} ${-q}L${r} 0L${q} ${q}L0 ${r}L${-q} ${q}L${-r} 0L${-q} ${-q}Z`
})()
const fourStar = (x: number, y: number, size: number, tone: number) => (
  <path key={`${x}-${y}`} className={`m-star t${tone}`} vectorEffect="non-scaling-stroke" transform={`translate(${x} ${y}) scale(${(size / 24).toFixed(3)})`} d={FOUR_STAR} />
)
/** 取り出し口の光の中心（開口の中）と、着地したカプセルの中心（S5、部品の (288,366)） */
const OUTLET = { x: 287, y: 332 }
const LANDED = { x: 288, y: 366 }
/** 楕円の上の点（度。右が 0、時計回り） */
const onArc = (center: { x: number; y: number }, degrees: number, rx: number, ry: number) => ({ x: center.x + rx * Math.cos((degrees * Math.PI) / 180), y: center.y + ry * Math.sin((degrees * Math.PI) / 180) })
/** 光の筋 4 本（featured）: 中心から 200°・240°・300°・340° の向きに、半径 from → to の線 */
const RAYS = [200, 240, 300, 340]
const rays = (center: { x: number; y: number }, from: number, to: number) => RAYS.map((deg) => { const a = onArc(center, deg, from, from); const b = onArc(center, deg, to, to); return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}` }).join('')
/** 揺れ線（turn3）: 胴の左右に短い弧を 2 本ずつ（y 312〜372） */
const SHAKE_LINES = 'M10 324Q4 342 10 360M5 316Q-3 342 5 368M340 324Q346 342 340 360M345 316Q353 342 345 368'
/** 着地の衝撃線（S3）: 受け皿の両脇 */
const IMPACT_LINES = 'M240 384L232 392M336 384L344 392'

const heart = (x: number, y: number, size: number, fill: string) => (
  <path key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${size / 24})`} d="M0 8C-2 4-6-2-9-2c-3 0-5 2-5 5 0 6 8 10 14 15 6-5 14-9 14-15 0-3-2-5-5-5-3 0-7 6-9 10Z" fill={fill} />
)
const star = (x: number, y: number, size: number, fill: string, stroke?: string) => (
  <path key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${size / 24})`} d="M0-12 3.5-4.5 12-3.5 6 2.5 7.5 11 0 7-7.5 11-6 2.5-12-3.5-3.5-4.5Z" fill={fill} stroke={stroke} strokeWidth={stroke ? 1.5 : 0} strokeLinejoin="round" />
)

/**
 * ガチャ筐体。デザインマスターの部品「T08 / Gacha Machine」（component set 419:10377、基準 267:10520。#114 の v2-D）を
 * コードで描き直したもの（350×424）。筐体そのもの（.m-art）は静止の絵で、変わるのはつまみ（T08 / Knob v2 399:10978）の向きと、
 * なぞる前の矢印・1 周した瞬間の「カチッ」、そして回転ごとの演出（#116、effect: 星・揺れ線・取り出し口の光・つや・暖かい光。別の層 .m-fx）。
 * キャラクターの絵は入れない。ひさし・左下の表示窓は無し（#114 の確定）。
 */
export function Machine({ className = '', label = 'ガチャガチャ。つまみを右に丸くなぞるかタップして回します', turns = 0, progress = 0, dragging = false, hint = false, click = false, onHandleTap, knob, effect, capsule = 'none' }: Props) {
  // 角度は atan2 の積み上げなので、表示は 0.1° に丸めて浮動小数の誤差を見せない
  const angle = Math.round((turns * 360 + progress) * 10) / 10
  const turnable = Boolean(onHandleTap)
  const lit = capsule === 'lit'
  // 3 周目が終わった瞬間（click3）も「カチッ」を出す。カプセルが出はじめる 0.2 秒後に CSS で消す
  const showClick = click || (effect?.state === 'click3' && capsule === 'out')
  return (
    <>
    <svg className={`machine${dragging ? ' is-dragging' : ''}${effect ? ` ${effect.className}` : ''}${lit ? ' is-lit' : ''} ${className}`.trim()} viewBox="0 0 350 424" role="img" aria-label={label}>
      <defs>
        <linearGradient id="m-outlet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c27a94" />
          <stop offset="1" stopColor="#8e4d69" />
        </linearGradient>
        {/* 演出の色は glow の className から CSS 変数で入る（gacha.css） */}
        <radialGradient id="m-aura"><stop offset="0" stopColor="#f9dfa8" stopOpacity="0.65" /><stop offset="1" stopColor="#f9dfa8" stopOpacity="0" /></radialGradient>
        <linearGradient id="m-sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0.35" /><stop offset="0.5" stopColor="#f6c4d8" stopOpacity="0.22" /><stop offset="1" stopColor="#a6d6f0" stopOpacity="0.2" /></linearGradient>
        <radialGradient id="m-light"><stop offset="0" className="fx-light-0" /><stop offset="0.55" className="fx-light-1" /><stop offset="1" className="fx-light-1" stopOpacity="0" /></radialGradient>
        <radialGradient id="m-ring"><stop offset="0" className="fx-ring-0" /><stop offset="0.6" className="fx-ring-1" /><stop offset="1" className="fx-ring-1" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="350" height="424" className="m-bg" />
      {/* featured の turn3 から: 筐体の後ろの暖かい光（楕円 470×470、中心 (175,212)。部品の枠で切れる） */}
      {effect?.aura && <circle className="m-aura" cx="175" cy="212" r="235" fill="url(#m-aura)" />}
      <g className="m-body">
      <g className="m-art">
        {/* 台座と影 */}
        <ellipse cx="175" cy="410" rx="132" ry="12" fill="#d5c6c6" />
        <rect x="52" y="390" width="246" height="20" rx="10" fill="#aa7c87" />
        {/* 上のガーランド（ひも wine 35%、ハート petal・星 purin-yellow） */}
        <path d="M20 12C70 34 120 30 175 22c55 8 105 12 155-10" fill="none" stroke="#a94a68" strokeOpacity="0.35" strokeWidth="2" />
        {GARLAND.map(([x, kind]) => (kind === 'heart' ? heart(x, 12, 12, '#f7cbd9') : star(x, 18, 12, '#fbe28c')))}
        {/* ドーム（上が半円、ガラス）と中のパステルのカプセル */}
        <path d="M35 242V180a140 140 0 0 1 280 0v62Z" fill="#fff6f9" stroke="#bd8496" strokeWidth="3" />
        <clipPath id="m-dome"><path d="M37 241V180a138 138 0 0 1 276 0v61Z" /></clipPath>
        <g clipPath="url(#m-dome)">
          {CAPSULES.map(([x, y, fill]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="26" fill={fill} />
              <rect x={x - 26} y={y - 3} width="52" height="6" fill="#fff" opacity="0.9" />
              <circle cx={x - 9} cy={y - 11} r="5" fill="#fff" opacity="0.85" />
            </g>
          ))}
        </g>
        {/* 左上の白い光の筋 */}
        <path d="M62 190C64 132 98 84 150 62" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" opacity="0.8" />
        {/* 頂点の赤いリボン */}
        <path d="M175 40c-6-10-18-14-24-6-5 7 4 14 24 6Zm0 0c6-10 18-14 24-6 5 7-4 14-24 6Z" fill="#e0344f" />
        <circle cx="175" cy="40" r="4.5" fill="#e0344f" />
        {/* ドームと胴の間の白いレース帯と玉、中央の小さなリボン */}
        <rect x="30" y="238" width="290" height="8" rx="4" fill="#fff" />
        {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={46 + i * 32} cy="246" r="6" fill="#fff" />)}
        <path d="M175 244c-5-6-13-8-16-3-3 4 4 8 16 3Zm0 0c5-6 13-8 16-3 3 4-4 8-16 3Z" fill="#f28ba0" />
        {/* 胴と内側の面 */}
        <rect x="20" y="240" width="310" height="152" rx="30" fill="#f9d3de" stroke="#bd8496" strokeWidth="3" />
        <rect x="34" y="254" width="282" height="124" rx="22" fill="#fde6ec" />
        {/* 左の星のシールとハート */}
        {star(85, 337, 46, '#fbe28c', '#e9c25a')}
        {heart(66, 284, 18, '#f8bcd0')}
        {/* 取り出し口（アーチ・開口・ふち）と受け皿 */}
        <path d="M252 364V311a35 35 0 0 1 70 0v53Z" fill="#e6a9bc" stroke="#bd8496" strokeWidth="2" />
        <path d="M259 357V311a28 28 0 0 1 56 0v46Z" fill="url(#m-outlet)" />
        <rect x="246" y="360" width="82" height="10" rx="5" fill="#f4b5c8" />
        <rect x="250" y="392" width="76" height="14" rx="7" fill="#f4b5c8" />
        {/* つまみの台 */}
        <circle cx={KNOB.x} cy={KNOB.y} r="68" fill="#f4b5c8" />
      </g>
      </g>
      {/* 回転ごとの演出（#116）。飾りなので読み上げない。色は glow の className から CSS で付く */}
      {effect && (effect.stars.length > 0 || effect.light || lit) && (
        <g className="m-fx" aria-hidden="true">
          {/* sparkle の turn2 から: ドームに真珠色のつや */}
          {effect.sheen && <path className="m-sheen" d="M35 242V180a140 140 0 0 1 280 0v62Z" fill="url(#m-sheen)" />}
          {/* 筐体のまわりの四芒星と粒 */}
          {effect.stars.map((s) => fourStar(s.x, s.y, s.size, s.tone))}
          {effect.grains.map((g) => <circle key={`${g.x}-${g.y}`} className="m-grain" cx={g.x} cy={g.y} r="1.75" />)}
          {/* turn3: 揺れ線 */}
          {effect.shake && <path className="m-shake" d={SHAKE_LINES} fill="none" strokeWidth="3" strokeLinecap="round" />}
          {/* click3〜S4: 取り出し口に光が集まり、上半分の弧に星が寄る。featured は光の筋 4 本 */}
          {effect.light && !lit && (
            <g className="m-light">
              <ellipse cx={OUTLET.x} cy={OUTLET.y} rx={effect.glow === 'featured' ? 95 : 75} ry={effect.glow === 'featured' ? 55 : 45} fill="url(#m-light)" />
              {effect.rays && <path className="m-rays" d={rays(OUTLET, 46, 76)} fill="none" strokeWidth="3" strokeLinecap="round" />}
              <g className="m-gather">
                {Array.from({ length: effect.gather }, (_, i) => { const p = onArc(OUTLET, 180 + (180 * (i + 0.5)) / effect.gather, 58, 46); return fourStar(Math.round(p.x), Math.round(p.y), 8 + (i % 3) * 2, i % (effect.glow === 'normal' ? 2 : 3)) })}
              </g>
            </g>
          )}
          {/* S3 着地: 受け皿の両脇の衝撃線（CSS で着地の間だけ見せる） */}
          {effect.light && capsule === 'out' && <path className="m-impact" d={IMPACT_LINES} fill="none" strokeWidth="3" strokeLinecap="round" />}
          {/* S5: 取り出し口の光は消え、カプセルの後ろに光の輪と星（featured は光の筋も） */}
          {lit && (
            <g className="m-lit">
              <circle cx={LANDED.x} cy={LANDED.y} r={effect.glow === 'featured' ? 75 : 60} fill="url(#m-ring)" />
              {effect.rays && <path className="m-rays" d={rays(LANDED, 40, 70)} fill="none" strokeWidth="3" strokeLinecap="round" />}
              {Array.from({ length: effect.gather }, (_, i) => { const p = onArc(LANDED, -90 + (360 * i) / effect.gather, 46, 46); return fourStar(Math.round(p.x), Math.round(p.y), 8 + (i % 3) * 2, i % (effect.glow === 'normal' ? 2 : 3)) })}
            </g>
          )}
        </g>
      )}
      {/* なぞる前の案内: 右回りの短い弧の矢印（10 時 → 2 時）。なぞり始めたら消す */}
      {hint && (
        <g className="m-hint" fill="none" stroke="#a94a68" strokeOpacity="0.8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d={`M${HINT_FROM.x.toFixed(1)} ${HINT_FROM.y.toFixed(1)}A86 86 0 0 1 ${HINT_TO.x.toFixed(1)} ${HINT_TO.y.toFixed(1)}`} />
          <path d="M-10 -6L0 0L-10 6" transform={`translate(${HINT_TO.x.toFixed(1)} ${HINT_TO.y.toFixed(1)}) rotate(60)`} />
        </g>
      )}
      {/* つまみ（T08 / Knob v2）。白いバーが向きを示す */}
      <g className="m-knob" style={{ transform: `rotate(${angle}deg)` }}>
        <circle cx={KNOB.x} cy={KNOB.y} r={KNOB.r} fill="#fff0f4" stroke="#be6482" strokeWidth="6" />
        <circle cx={KNOB.x} cy={KNOB.y} r="50" fill="#fbd0dd" />
        <path d="M140 296c6-16 20-26 36-28" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.9" />
        <rect x={KNOB.x - 38} y={KNOB.y - 9} width="76" height="18" rx="9" fill="#fff" stroke="#be6482" strokeWidth="2" />
        <circle cx={KNOB.x} cy={KNOB.y} r="4" fill="#be6482" />
      </g>
      {/* 1 周した瞬間の「カチッ」: 短い線 8 本と右上の白い札（3 周目の click3 も。featured の turn3 からは金） */}
      {showClick && (
        <g className="m-click">
          <path className="m-ticks" d={CLICK_TICKS} fill="none" strokeOpacity="0.85" strokeWidth="3" strokeLinecap="round" />
          <rect x="246" y="222" width="64" height="30" rx="10" fill="#fff" opacity="0.9" />
          <text className="m-click-text" x="278" y="243" textAnchor="middle" fontSize="16" fontWeight="700">カチッ</text>
        </g>
      )}
    </svg>
    {/* 指で押す範囲 160×160（マスターの Knob drag target）。SVG の中の要素では Chromium が touch-action を見ないので、
        筐体の上に重ねた HTML の丸だけを touch-action: none にする（筐体のほかの部分はページのスクロールを妨げない）。
        読み上げ・キーボードは画面の「1タップで1回転」ボタンで操作する */}
    {turnable && (
      <div
        className={`m-knob-hit${dragging ? ' is-dragging' : ''}`} aria-hidden="true"
        style={{ left: `${((KNOB.x - HIT_RADIUS) / 350) * 100}%`, top: `${((KNOB.y - HIT_RADIUS) / 424) * 100}%`, width: `${((HIT_RADIUS * 2) / 350) * 100}%`, touchAction: 'none' }}
        onClick={knob ? knob.onClick : onHandleTap}
        onPointerDown={knob?.onPointerDown} onPointerMove={knob?.onPointerMove} onPointerUp={knob?.onPointerUp} onPointerCancel={knob?.onPointerCancel}
      />
    )}
    </>
  )
}
