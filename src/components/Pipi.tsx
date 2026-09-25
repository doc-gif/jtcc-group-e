/** 案内役「ピピ」。パズルのピースに王冠をのせたオリジナルキャラクター。 */
export function Pipi({ text, cheer = false }: { text: string; cheer?: boolean }) {
  return (
    <div className={`pipi${cheer ? ' cheer' : ''}`}>
      <p className="pipi-bubble" aria-live="polite"><span className="visually-hidden">ピピ：</span>{text}</p>
      <svg viewBox="0 0 80 84" aria-hidden="true" className="pipi-body">
        <defs><linearGradient id="pipi-rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FBE3D9" /><stop offset=".5" stopColor="#EDB3A3" /><stop offset="1" stopColor="#D98C86" /></linearGradient></defs>
        <path d="M14 30h14a8 8 0 1 1 16 0h14v14a8 8 0 1 1 0 16v16H14V60a7.5 7.5 0 1 0 0-15z" fill="#F7B8CB" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
        <path d="M24 18l4-10 6 7 6-11 6 11 6-7 4 10z" fill="url(#pipi-rg)" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="30" cy="54" r="3.2" fill="#5C4A50" /><circle cx="46" cy="54" r="3.2" fill="#5C4A50" />
        <circle cx="31" cy="53" r="1" fill="#fff" /><circle cx="47" cy="53" r="1" fill="#fff" />
        <ellipse cx="24" cy="61" rx="4.5" ry="3" fill="#F08FAE" opacity=".6" /><ellipse cx="52" cy="61" rx="4.5" ry="3" fill="#F08FAE" opacity=".6" />
        <path d="M34 60q4 4 8 0" fill="none" stroke="#5C4A50" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  )
}
