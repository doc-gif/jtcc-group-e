interface Props {
  className?: string
  /** 読み上げの名前。回せない場面（回す前の確認・売り切れ）では、その状態を伝える。 */
  label?: string
  /** 回した回数。ハンドルの十字をその分だけ回して見せる（筐体そのものは変わらない）。 */
  turns?: number
  /** 右のハンドルを押したとき。キーボードと読み上げでは、画面の「1タップで1回転」ボタンを使う。 */
  onHandleTap?: () => void
}

/** ハンドルの中心（マスターの部品 267:10520 の座標） */
const HANDLE = { x: 237, y: 261 }

/**
 * ガチャ筐体。デザインマスターの部品「T08 / Gacha Machine / visual only」（267:10520）の
 * オリジナルのベクター画をコードで描き直したもの。回転で飾りは増えない（マスターは静止の絵）。
 * #88（担当者の指示 2026-09-26）で、上側を丸いアーチから角ばった箱（角丸 12・内側 6）に変えた（Figma の案 408:15720）。
 */
export function Machine({ className = '', label = 'ガチャガチャ。右のハンドルをタップして回します', turns = 0, onHandleTap }: Props) {
  return (
    <svg className={`machine ${className}`.trim()} viewBox="0 0 350 350" role="img" aria-label={label}>
      <rect width="350" height="350" rx="0" className="m-bg" />
      <ellipse cx="175" cy="326" rx="126" ry="16" fill="#D5C6C6" />
      <rect x="67" y="217" width="216" height="102" rx="27" fill="#F8CDD9" stroke="#BD8496" strokeWidth="3" />
      <rect x="86" y="27" width="178" height="198" rx="12" fill="#FFFCFD" stroke="#BD8496" strokeWidth="4" />
      <rect x="95" y="36" width="160" height="172" rx="6" fill="#E8F1EF" />
      <circle cx="132" cy="168" r="31" fill="#E3B4C8" />
      <circle cx="177" cy="168" r="31" fill="#D5C7E7" />
      <circle cx="222" cy="168" r="31" fill="#BBD7CB" />
      <circle cx="150" cy="202" r="30" fill="#F0D9AD" />
      <circle cx="199" cy="201" r="30" fill="#DDA9B8" />
      <path d="M109 171h46M154 168h46M199 168h45M127 201h46M177 201h45" stroke="#FFF9FA" strokeWidth="4" opacity="0.8" />
      <rect x="104" y="46" width="8" height="56" rx="4" fill="#FFFFFF" opacity="0.85" />
      <path d="M69 221h214" stroke="#B7818C" strokeWidth="11" />
      <rect x="88" y="232" width="102" height="62" rx="18" fill="#FFF9FA" stroke="#C28E9E" strokeWidth="2" />
      <path d="M107 257h64" stroke="#B5CBBF" strokeWidth="5" />
      <rect x="108" y="274" width="62" height="11" rx="5" fill="#B5CBBF" />
      <rect x="133" y="302" width="84" height="15" rx="7" fill="#AA7C87" />
      <g className="m-handle" style={{ transform: `rotate(${turns * 90}deg)` }}>
        <circle cx={HANDLE.x} cy={HANDLE.y} r="27" fill="#FFF9FA" stroke="#BE6482" strokeWidth="5" />
        <path d="M237 239v44M218 261h38" stroke="#BE6482" strokeWidth="8" />
        <circle cx={HANDLE.x} cy={HANDLE.y} r="7" fill="#BE6482" />
      </g>
      {/* 指で押す範囲。見た目のハンドルより少し広く取る（読み上げ・キーボードはボタンで操作する） */}
      {onHandleTap && <circle className="m-handle-hit" cx={HANDLE.x} cy={HANDLE.y} r="36" fill="transparent" onClick={onHandleTap} />}
    </svg>
  )
}
