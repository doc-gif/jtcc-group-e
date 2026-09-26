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
 */
export function Machine({ className = '', label = 'ガチャガチャ。右のハンドルをタップして回します', turns = 0, onHandleTap }: Props) {
  return (
    <svg className={`machine ${className}`.trim()} viewBox="0 0 350 350" role="img" aria-label={label}>
      <rect width="350" height="350" rx="0" className="m-bg" />
      <ellipse cx="175" cy="326" rx="126" ry="16" fill="#D5C6C6" />
      <rect x="67" y="217" width="216" height="102" rx="27" fill="#F8CDD9" stroke="#BD8496" strokeWidth="3" />
      <path d="M86 225V122C86 61 126 27 175 27s89 34 89 95v103z" fill="#FFFCFD" stroke="#BD8496" strokeWidth="4" />
      <path d="M95 122c0-53 38-86 80-86s80 33 80 86v86H95z" fill="#E8F1EF" />
      <circle cx="132" cy="168" r="31" fill="#E3B4C8" />
      <circle cx="177" cy="168" r="31" fill="#D5C7E7" />
      <circle cx="222" cy="168" r="31" fill="#BBD7CB" />
      <circle cx="150" cy="202" r="30" fill="#F0D9AD" />
      <circle cx="199" cy="201" r="30" fill="#DDA9B8" />
      <path d="M109 171h46M154 168h46M199 168h45M127 201h46M177 201h45" stroke="#FFF9FA" strokeWidth="4" opacity="0.8" />
      <path d="M85 109C85.7 73.7 101.7 49 133 35" fill="none" stroke="#FFF9FA" strokeWidth="9" opacity="0.75" />
      {/* F14: ドームの上の赤いリボン（マスターの筐体 267:10520 の飾り。Chrome.tsx の Bow と同じ形） */}
      <g className="bow bow-red m-bow-top" transform="translate(145 4) scale(1.75)">
        <path className="bow-tail" d="M12.5 10 8 17.5h5l3-5zM21.5 10l4.5 7.5h-5l-3-5z" />
        <path className="bow-loop" d="M17 8.5C13 2.5 6.5.5 3.5 2.5.5 4.5 1 12.5 4 14.8c3 2.4 9-.8 13-6.3z" />
        <path className="bow-loop" d="M17 8.5c4-6 10.5-8 13.5-6 3 2 2.5 10-.5 12.3-3 2.4-9-.8-13-6.3z" />
        <circle className="bow-knot" cx="17" cy="8.5" r="3.6" />
        <circle className="bow-shine" cx="16" cy="7.4" r="1.1" />
      </g>
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
