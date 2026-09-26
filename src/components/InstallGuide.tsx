import { useInstallGuide } from '../app/installGuide'

/**
 * 「ホーム画面に追加」の案内（#57）。街ホームの地図の下に出す。
 * マスター 448:14192（手順と「閉じる」）・448:14267（追加の画面を出せるときの主ボタン「ホーム画面に追加」）。
 * 出し分けは src/app/installGuide.ts。ルーム（招待・ホスト用リンク）には出さない（ホーム画面のアプリは保存データが別のため）。
 */
export function InstallGuide({ storage }: { storage?: Pick<Storage, 'getItem' | 'setItem'> }) {
  const { show, canPrompt, close, install } = useInstallGuide(storage)
  if (!show) return null
  const onClose = () => {
    close()
    // 押したボタンが消えるので、画面の見出しへ焦点を戻す
    document.getElementById('page-title')?.focus({ preventScroll: true })
  }
  return (
    <section className="install-guide" aria-labelledby="install-guide-title">
      <h2 id="install-guide-title" className="install-guide-title">ホーム画面に追加すると、全画面で遊べます</h2>
      {canPrompt
        ? <p className="install-guide-text">リンクバーのない画面で開けます。追加しなくても、このまま遊べます。</p>
        : (
          <ul className="install-guide-steps">
            <li>iPhone：共有ボタン →「ホーム画面に追加」</li>
            <li>Android：メニュー →「ホーム画面に追加」</li>
          </ul>
        )}
      <div className="install-guide-actions">
        {canPrompt && <button type="button" className="btn btn-main" onClick={() => { void install() }}>ホーム画面に追加</button>}
        <button type="button" className="btn btn-outline" onClick={onClose}>閉じる</button>
      </div>
    </section>
  )
}
