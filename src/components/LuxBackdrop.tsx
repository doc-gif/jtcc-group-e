/**
 * 回す画面の背景。回転数に合わせて豪華になる（ダマスク柄 → 葉とつぼみ → 牡丹・額縁・シャンデリア → 満開・光の帯）。
 * 目玉が確定したらワインローズに暗転する。装飾だけなので読み上げない。
 */
export function LuxBackdrop({ level, kakutei }: { level: number; kakutei: boolean }) {
  return (
    <div className={`lux lux-${level}${kakutei ? ' lux-kakutei' : ''}`} aria-hidden="true">
      <svg className="lux-damask" width="100%" height="100%">
        <defs>
          <pattern id="lux-dm" width="64" height="64" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M32 6c6 8 6 14 0 20-6-6-6-12 0-20zM32 58c6-8 6-14 0-20-6 6-6 12 0 20zM6 32c8-6 14-6 20 0-6 6-12 6-20 0zM58 32c-8-6-14-6-20 0 6 6 12 6 20 0z" />
              <circle cx="32" cy="32" r="3.5" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#lux-dm)" />
      </svg>
      <span className="lux-beams" />
      <span className="lux-frame" />
      {['tl', 'tr', 'bl', 'br'].map((corner) => (
        <svg key={corner} className={`lux-flower ${corner}`} viewBox="-40 -40 80 80">
          {Array.from({ length: 6 }, (_, i) => <ellipse key={i} cx="0" cy="-16" rx="11" ry="18" transform={`rotate(${i * 60})`} fill="#F7C3D3" stroke="#fff" strokeWidth="1" />)}
          {Array.from({ length: 6 }, (_, i) => <ellipse key={`in${i}`} cx="0" cy="-9" rx="7" ry="11" transform={`rotate(${i * 60 + 30})`} fill="#F09CB6" stroke="#fff" strokeWidth=".8" />)}
          <circle r="6" fill="#FBE3D9" />
        </svg>
      ))}
      <svg className="lux-chand l" viewBox="0 0 120 120"><path d="M60 0v20M20 40q40 30 80 0M30 40v16M60 50v18M90 40v16" stroke="#EDB3A3" strokeWidth="2" fill="none" /><circle cx="30" cy="60" r="5" fill="#FDE6EE" /><circle cx="60" cy="72" r="6" fill="#FDE6EE" /><circle cx="90" cy="60" r="5" fill="#FDE6EE" /></svg>
      <svg className="lux-chand r" viewBox="0 0 120 120"><path d="M60 0v20M20 40q40 30 80 0M30 40v16M60 50v18M90 40v16" stroke="#EDB3A3" strokeWidth="2" fill="none" /><circle cx="30" cy="60" r="5" fill="#FDE6EE" /><circle cx="60" cy="72" r="6" fill="#FDE6EE" /><circle cx="90" cy="60" r="5" fill="#FDE6EE" /></svg>
    </div>
  )
}
